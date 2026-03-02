---
description: Manage the first release todo list (issue #15)
---

Manage the first release checklist tracked in GitHub issue #15. Follow this process:

1. Fetch the current issue body:
   - Run `gh issue view 15 --repo neovateai/neovate-desktop --json body -q .body`
   - Parse the markdown checklist to identify completed (`- [x]`) and pending (`- [ ]`) items

2. Display a summary to the user:
   - Show completed count vs total
   - List pending items

3. Use AskUserQuestion tool to ask what action to take:
   - **Check off items** - Mark pending items as done
   - **Add new items** - Add new tasks to the pending list
   - **View only** - Just show the status (stop here)

4. For "Check off items":
   - Use AskUserQuestion with multiSelect to let the user pick which pending items to mark done
   - Update the issue body: change `- [ ]` to `- [x]` for selected items and move them to the Completed section
   - Run `gh issue edit 15 --repo neovateai/neovate-desktop --body "<updated_body>"`
   - Show the updated status

5. For "Add new items":
   - Use AskUserQuestion to ask for the new item title(s), comma-separated
   - Append `- [ ] <item>` lines to the Pending section
   - Run `gh issue edit 15 --repo neovateai/neovate-desktop --body "<updated_body>"`
   - Show the updated status

Rules:

- NEVER close issue #15
- NEVER remove items from the list — only move checked items to the Completed section
- Keep the existing issue structure (## First Release Checklist, ### Completed, ### Pending, ### Technical Notes, etc.)
- Preserve the Technical Notes and Definition of Done sections unchanged
