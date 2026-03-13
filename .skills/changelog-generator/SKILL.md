---
name: changelog-generator
description: Generates a CHANGELOG.md from git commit history following Keep a Changelog format. Use when the user asks to generate, create, or update a changelog, release notes, or summarize recent git commits.
---

# Changelog Generator

Generates a well-structured `CHANGELOG.md` from the project's git history, following the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format and [Semantic Versioning](https://semver.org/).

## When to Use This Skill

- User asks to "generate a changelog"
- User wants to create or update release notes
- User wants a summary of recent commits organized by type
- User asks what changed between two git tags or versions

## Instructions

1. **Gather git history** — Run `git log` to get commit messages. Use `--oneline` for a compact view, or `--pretty=format:"%h %s"` for hash + subject.

2. **Categorize commits** — Map commit types to changelog sections:
   - `feat:` / `feature:` → **Added**
   - `fix:` / `bugfix:` → **Fixed**
   - `refactor:` → **Changed**
   - `docs:` → **Changed** (or omit if minor)
   - `break:` / `BREAKING CHANGE` → **Changed** (flag prominently)
   - `chore:` / `ci:` / `test:` → **Changed** (or omit)
   - Uncategorized → **Changed**

3. **Determine the version** — Check for existing git tags (`git tag --sort=-v:refname`). If none exist, use `[Unreleased]`. Otherwise group commits since the last tag.

4. **Format the output** using the Keep a Changelog structure:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- New feature descriptions here

### Fixed
- Bug fix descriptions here

### Changed
- Refactoring or breaking changes here
```

5. **Write to CHANGELOG.md** — Create or prepend to the file in the project root.

## Examples

**Input:** "Generate a changelog for this project"
**Action:** Run `git log --oneline`, categorize commits, write CHANGELOG.md

**Input:** "Create release notes for v1.2.0"
**Action:** Run `git log v1.1.0..HEAD --oneline`, format as v1.2.0 release notes
