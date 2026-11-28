---
name: fresh-review
description: Load when reviewing a completed ticket or PR in a clean session.
---
Enforce Rule 9: review in a fresh context.
1. Read ONLY the ticket spec and git diff. Do not browse unrelated files.
2. Rank issues strictly by: (1) breaks the spec; (2) breaks tests; (3) risky edge case, security, or data loss; (4) style violation.
3. For each issue, give the file, line number, and smallest concrete fix.
4. Do not rewrite code unless asked.
