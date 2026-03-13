---
name: code-review
description: Reviews code for bugs, security issues, performance problems, and style concerns. Use when the user asks to review, audit, or check code quality.
---

# Code Review

Performs a thorough code review covering correctness, security, performance, and maintainability.

## When to Use This Skill

- User asks to "review this code" or "check my code"
- User wants to find bugs or security vulnerabilities
- User wants feedback on code quality or style
- User is preparing a pull request and wants a pre-review

## Instructions

1. **Read the code carefully** — Understand the intent before looking for issues.

2. **Check for bugs** — Logic errors, off-by-one errors, null/undefined handling, error propagation.

3. **Check for security issues** — Injection vulnerabilities (SQL, command, XSS), hardcoded credentials, insecure defaults, missing input validation.

4. **Check for performance issues** — Unnecessary loops, N+1 queries, missing indexes, memory leaks.

5. **Check for maintainability** — Naming clarity, function length, duplication, missing comments on complex logic.

6. **Format your review** using this structure:
   - **Summary** — One paragraph overall assessment
   - **Critical Issues** — Must-fix bugs or security problems (numbered list)
   - **Suggestions** — Improvements worth considering (numbered list)
   - **Positive Notes** — What the code does well (brief)

## Examples

**Input:** "Review this authentication function"
**Action:** Check for SQL injection, password hashing, session handling, error leakage

**Input:** "Check my API endpoint for issues"
**Action:** Check input validation, error handling, auth checks, rate limiting
