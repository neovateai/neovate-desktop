---
name: bug-report
description: Create a bug report issue on GitHub
disable-model-invocation: true
---

Create a GitHub bug report issue for this project. Follow this process:

1. Auto-gather context before asking the user anything:
   - Run `git log --oneline -10` and `git diff --stat` to understand recent changes
   - If the user mentioned a specific area, read relevant source files
   - Use this context to pre-fill details and ask smarter questions

2. Use AskUserQuestion tool to collect all info in one batch (up to 4 questions):
   - Describe the bug
   - Steps to reproduce
   - Severity: annoyance / serious, but I can work around it / blocking all usage of neovate-desktop
   - Any logs or additional context (optional)

3. Format the information into a structured bug report with sections:
   - Describe the bug
   - Reproduction
   - Logs (if provided)
   - Severity
   - Environment (auto-fill: OS, branch, recent commit hash)

4. Show the formatted issue to the user and ask for confirmation
5. Create the issue using: gh issue create --title "[Bug]: <brief_summary>" --body "<formatted_body>" --label "bug"

If gh CLI is not available or not authenticated, inform the user how to set it up.
