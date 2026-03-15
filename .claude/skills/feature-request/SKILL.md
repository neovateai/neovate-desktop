---
name: feature-request
description: Create a feature request issue on GitHub
disable-model-invocation: true
---

Create a GitHub feature request issue for this project. Follow this process:

1. Auto-gather context before asking the user anything:
   - Run `git log --oneline -10` to understand recent changes
   - If the user mentioned a specific area, read relevant source files
   - Use this context to understand the current state and ask smarter questions

2. Use AskUserQuestion tool to collect all info in one batch (up to 4 questions):
   - What problem does this feature solve?
   - What's your proposed solution?
   - Importance: nice to have / would make my life easier / cannot use neovate-desktop without it
   - Any alternatives considered or additional context? (optional)

3. Use AskUserQuestion tool to ask if this should be marked as "good first issue" (yes/no)

4. Format the information into a structured feature request with sections:
   - Problem
   - Solution
   - Alternatives (if provided)
   - Importance
   - Additional Information (if provided)

5. Show the formatted issue to the user and ask for confirmation
6. Create the issue using: gh issue create --title "[Feature Request]: <brief_summary>" --body "<formatted_body>" --label "enhancement" [--label "good first issue" if selected]

If gh CLI is not available or not authenticated, inform the user how to set it up.
