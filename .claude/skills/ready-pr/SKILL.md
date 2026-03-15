---
name: ready-pr
description: Run readiness checks, fix issues, and create a PR
disable-model-invocation: true
---

# Ready PR

Run `bun ready` to validate the project, fix any issues, and create a pull request.

## Steps

1. Run `bun ready`
2. If it fails:
   - Read the error output to identify what failed (format, typecheck, lint, or tests)
   - Fix the issues
   - Run `bun ready` again
   - Repeat until it passes (max 3 attempts, then stop and report)
3. Stage and commit any files changed during fixes (use Conventional Commits)
4. Analyze all commits on the current branch vs `master` using `git log master..HEAD` and `git diff master...HEAD`
5. Draft a PR title (under 70 chars) and body with a Summary section and Test plan
6. Push the branch and create the PR:
   ```bash
   git push -u origin HEAD
   gh pr create --base master --title "<title>" --body "<body>"
   ```
7. Return the PR URL
