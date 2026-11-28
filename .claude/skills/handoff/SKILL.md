---
name: handoff
description: Load when isolating a detour, prototype, or heavy session into a fresh agent.
---
Enforce Rule 7: hand off side tasks.
1. Do NOT continue the work.
2. Write ONE Markdown file to the OS temp directory ($TMPDIR, /tmp, or %TEMP%). NEVER inside the repo.
3. Include only: (1) one-line goal; (2) status: done, half-done, or not started; (3) decisions and why; (4) open questions; (5) exact file paths, commits, or diffs to read, never full files; (6) skills the next session must invoke; (7) the single next action.
4. Redact API keys, passwords, tokens, and personal data.
5. Print the temp file path and a one-line starter prompt for the fresh session.
