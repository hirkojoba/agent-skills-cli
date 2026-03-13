# Agent Skills CLI

## How I Built This

I started by reading through the Agent Skills spec to understand exactly what was expected. The core idea is progressive disclosure, which means you load as little as possible upfront and only pull in what you actually need when you need it.

**Step 1: Skill discovery**

When the CLI starts, it scans the `.skills/` directory for subfolders that contain a `SKILL.md` file. At this stage it only reads the name and description from the YAML frontmatter at the top of each file. The full instructions are not loaded yet.

**Step 2: Skill matching**

When the user types a prompt, a lightweight call is made to Claude with just the skill catalog (names and descriptions). Claude returns a JSON array of which skills are actually relevant to the task. If nothing matches, no skill context gets loaded at all and Claude just answers from its base knowledge.

**Step 3: Execution**

For any matched skills, the full body of their `SKILL.md` files gets injected into the system prompt as structured `<skill_content>` blocks. Then a second Claude call handles the actual response, which streams to the terminal as it comes in.

## Setup

```bash
npm install
export ANTHROPIC_API_KEY=your-api-key-here
```

## Usage

Single prompt:
```bash
node index.js "generate a changelog"
```

Interactive mode:
```bash
node index.js
```

## Example

```bash
node index.js "generate a changelog"
# [skills loaded: changelog-generator]
# ...streamed response...

node index.js "whats my favourite colour?"
# [no skills matched]
# ...streamed response...
```
