#!/usr/bin/env node

/**
 * Agent Skills CLI
 *
 * A mini coding agent that implements the open Agent Skills specification.
 * It discovers skills from a local .skills/ directory, intelligently matches
 * user prompts to relevant skills, and executes them using Claude's Sonnet model.
 *
 * Spec: https://agentskills.io
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const Anthropic = require("@anthropic-ai/sdk");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "Error: ANTHROPIC_API_KEY environment variable is not set.\n" +
    "Set it with: export ANTHROPIC_API_KEY=your-api-key"
  );
  process.exit(1);
}

const client = new Anthropic();
const MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Step 1: Skill Discovery
// Scan the .skills/ directory for subdirectories containing a SKILL.md file.
// We only load name + description at this stage (Tier 1: Catalog).
// ---------------------------------------------------------------------------

/**
 * Parses a SKILL.md file into its frontmatter fields and body content.
 *
 * A SKILL.md looks like:
 *   ---
 *   name: my-skill
 *   description: What this skill does and when to use it.
 *   ---
 *   # My Skill
 *   ...instructions...
 *
 * Returns { frontmatter: {name, description, ...}, body: string } or null.
 */
function parseSkillMd(content) {
  // Locate the opening and closing --- delimiters
  const firstDelim = content.indexOf("---");
  if (firstDelim !== 0) return null;

  const secondDelim = content.indexOf("---", firstDelim + 3);
  if (secondDelim === -1) return null;

  const yamlBlock = content.slice(firstDelim + 3, secondDelim).trim();
  const body = content.slice(secondDelim + 3).trim();

  // Parse the YAML block manually to avoid requiring a full YAML parser.
  // We support simple key: value pairs and multiline values prefixed with |.
  const frontmatter = {};
  const lines = yamlBlock.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    if (rawValue === "|") {
      // Block scalar — collect indented lines that follow
      const indentMatch = lines[i + 1]?.match(/^(\s+)/);
      const indent = indentMatch ? indentMatch[1].length : 2;
      const blockLines = [];
      i++;
      while (i < lines.length && (lines[i].startsWith(" ".repeat(indent)) || lines[i].trim() === "")) {
        blockLines.push(lines[i].slice(indent));
        i++;
      }
      frontmatter[key] = blockLines.join("\n").trim();
    } else {
      // Inline value — strip surrounding quotes if present
      frontmatter[key] = rawValue.replace(/^["']|["']$/g, "");
      i++;
    }
  }

  return { frontmatter, body };
}

/**
 * Discovers all valid skills in a given skills directory.
 *
 * Rules (following the spec's lenient validation approach):
 *  - Each subdirectory is checked for a SKILL.md file.
 *  - Skills without a name or description are skipped.
 *  - Malformed YAML causes the skill to be skipped (with a warning).
 *
 * Returns an array of skill objects: { name, description, location, body }
 */
function discoverSkills(skillsDir) {
  const skills = [];

  if (!fs.existsSync(skillsDir)) {
    return skills;
  }

  let entries;
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return skills;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Skip common non-skill directories
    if (entry.name === ".git" || entry.name === "node_modules") continue;

    const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;

    let content;
    try {
      content = fs.readFileSync(skillMdPath, "utf-8");
    } catch {
      console.warn(`[warn] Could not read ${skillMdPath}`);
      continue;
    }

    const parsed = parseSkillMd(content);
    if (!parsed) {
      console.warn(`[warn] Could not parse frontmatter in ${skillMdPath}`);
      continue;
    }

    const { frontmatter, body } = parsed;

    if (!frontmatter.description) {
      console.warn(`[warn] Skill in ${entry.name}/ has no description — skipping`);
      continue;
    }

    // Use frontmatter name if provided, otherwise fall back to directory name
    const name = frontmatter.name || entry.name;

    skills.push({
      name,
      description: frontmatter.description,
      location: skillMdPath,
      // Body is not loaded until a skill is activated (Tier 2: Instructions)
      body,
    });
  }

  return skills;
}

// ---------------------------------------------------------------------------
// Step 2: Build the Skill Catalog (Tier 1)
// A compact representation sent to Claude so it knows which skills exist.
// ~50-100 tokens per skill — lightweight even with many skills installed.
// ---------------------------------------------------------------------------

function buildCatalogXml(skills) {
  if (skills.length === 0) return "";

  const entries = skills
    .map(
      (s) =>
        `  <skill>\n    <name>${s.name}</name>\n    <description>${s.description}</description>\n  </skill>`
    )
    .join("\n");

  return `<available_skills>\n${entries}\n</available_skills>`;
}

// ---------------------------------------------------------------------------
// Step 3: Intelligent Skill Matching
// Ask Claude which skills (if any) are relevant to the user's prompt.
// This is the key mechanism that prevents loading unrelated skills into context.
// ---------------------------------------------------------------------------

/**
 * Uses Claude to select only the skills relevant to a user's prompt.
 *
 * Claude sees only the skill catalog (names + descriptions), not the full
 * SKILL.md bodies. This keeps the matching call cheap and fast.
 *
 * Returns a filtered array of skill objects.
 */
async function matchSkills(userPrompt, skills) {
  if (skills.length === 0) return [];

  const catalog = buildCatalogXml(skills);

  // Ask Claude to output a JSON array of relevant skill names.
  // We use a strict output format so the response is easy to parse reliably.
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system:
      "You are a skill selector for a coding agent. " +
      "Your job is to decide which skills from a catalog are relevant to the user's task. " +
      "Respond ONLY with a JSON array of skill names. No explanation, no markdown fences — just the array.",
    messages: [
      {
        role: "user",
        content:
          `Here are the available skills:\n\n${catalog}\n\n` +
          `User task: "${userPrompt}"\n\n` +
          `Which skill names (if any) are genuinely relevant to this task? ` +
          `Only include a skill if it would meaningfully help. ` +
          `If nothing is relevant, return [].`,
      },
    ],
  });

  const raw = response.content[0].text.trim();

  let selectedNames;
  try {
    selectedNames = JSON.parse(raw);
  } catch {
    // If parsing fails, fall back to no skills
    return [];
  }

  if (!Array.isArray(selectedNames)) return [];

  return skills.filter((s) => selectedNames.includes(s.name));
}

// ---------------------------------------------------------------------------
// Step 4: Skill Activation & Execution (Tier 2)
// Load the full SKILL.md body of each matched skill and inject it into the
// prompt as structured <skill_content> blocks. Then let Claude do the work.
// ---------------------------------------------------------------------------

/**
 * Wraps a skill's body in identifying XML tags (structured wrapping pattern
 * from the spec). This helps Claude distinguish skill instructions from other
 * conversation content and makes future context management cleaner.
 */
function wrapSkillContent(skill) {
  return (
    `<skill_content name="${skill.name}">\n` +
    `${skill.body}\n` +
    `\nSkill directory: ${path.dirname(skill.location)}\n` +
    `</skill_content>`
  );
}

/**
 * Runs the user's prompt through Claude with the relevant skills loaded.
 *
 * If no skills matched, Claude answers from its base knowledge.
 * If skills matched, their full instructions are injected into the system
 * prompt — giving Claude the specialized context it needs.
 *
 * Streams the response to stdout for a responsive UX.
 */
async function executeWithSkills(userPrompt, relevantSkills) {
  let systemPrompt =
    "You are a helpful mini coding agent. " +
    "Follow the instructions in any loaded skills precisely.";

  if (relevantSkills.length > 0) {
    const skillBlocks = relevantSkills.map(wrapSkillContent).join("\n\n");
    systemPrompt +=
      "\n\nThe following skills have been activated for this task:\n\n" +
      skillBlocks;
  }

  process.stdout.write("\n");

  // Stream the response so the user sees output as it arrives
  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      process.stdout.write(event.delta.text);
    }
  }

  process.stdout.write("\n\n");
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

/**
 * Interactive REPL mode — keeps the skill catalog in memory across turns.
 * Each user message goes through matching before execution.
 */
async function interactiveMode(skills) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`\nAgent Skills CLI — ${MODEL}`);
  console.log(
    skills.length > 0
      ? `Skills available: ${skills.map((s) => s.name).join(", ")}`
      : "No skills found in .skills/"
  );
  console.log('Type your prompt and press Enter. Type "exit" to quit.\n');

  const ask = () => {
    rl.question("> ", async (input) => {
      const prompt = input.trim();

      if (!prompt || prompt.toLowerCase() === "exit") {
        rl.close();
        return;
      }

      await runPrompt(prompt, skills);
      ask();
    });
  };

  ask();
}

/**
 * Single-shot mode — run one prompt from CLI args and exit.
 */
async function singleShotMode(prompt, skills) {
  await runPrompt(prompt, skills);
}

/**
 * Core pipeline: match skills → activate matched skills → execute.
 */
async function runPrompt(prompt, skills) {
  // Step 1: Match — which skills are relevant?
  const matched = await matchSkills(prompt, skills);

  if (matched.length > 0) {
    console.log(`\n[skills loaded: ${matched.map((s) => s.name).join(", ")}]`);
  } else {
    console.log("\n[no skills matched]");
  }

  // Step 2: Execute with matched skill context
  await executeWithSkills(prompt, matched);
}

async function main() {
  const args = process.argv.slice(2);

  // Discover skills from .skills/ in the current working directory
  const skillsDir = path.join(process.cwd(), ".skills");
  const skills = discoverSkills(skillsDir);

  if (args.length > 0) {
    // Single-shot: node index.js "your prompt here"
    const prompt = args.join(" ");
    await singleShotMode(prompt, skills);
  } else {
    // Interactive REPL
    await interactiveMode(skills);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
