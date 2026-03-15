# Contributing

## Prerequisites

- macOS
- [Bun](https://bun.sh/) >= 1.3.9

## Getting Started

```sh
bun install
bun dev
```

## Scripts

| Command         | Description                                      |
| --------------- | ------------------------------------------------ |
| `bun dev`       | Start dev server with hot reload                 |
| `bun build`     | Build the app                                    |
| `bun build:mac` | Build macOS distributable                        |
| `bun check`     | Run typecheck + lint + format check              |
| `bun lint`      | Run oxlint                                       |
| `bun format`    | Format code with oxfmt                           |
| `bun test`      | Run unit tests in watch mode (vitest)            |
| `bun test:run`  | Run unit tests once (CI)                         |
| `bun start`     | Preview production build locally (electron-vite) |
| `bun test:e2e`  | Build and run e2e tests (playwright)             |
| `bun ready`     | Pre-push readiness check (format + check + test) |

Flags for `bun ready`:

- `--build` — also run full build
- `--e2e` — also run e2e tests

## Logging

All logs from both main and renderer processes are automatically written to a single file via `electron-log`:

- **Dev**: `/tmp/dev.log` (truncated on each app start)
- Both `console.*` and `debug("neovate:*")` output is captured automatically — no setup needed
- Search logs with `grep` or `less` against `/tmp/dev.log`

## UI Playground

A dev-only playground with two tabs:

- **AI Elements** — all `ai-elements` components rendered with sample data
- **Chat** — `ClaudeCodeMessageParts` renderer with a real Claude Code session as mock data

```sh
VITE_UI_PLAYGROUND=1 bun dev
```

The playground is only available in dev mode (`import.meta.env.DEV`) and is excluded from production builds.

## Environment Variables

| Variable                  | Default | Description                                                                         |
| ------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `NEOVATE_PRELOAD_SESSION` | `all`   | `all` = preload all sessions, `latest` = only the most recent, `false` = no preload |
| `VITE_UI_PLAYGROUND`      | —       | Set to `1` to launch directly into the UI playground on startup                     |

## Code Style

- Linting: [oxlint](https://oxc.rs/)
- Formatting: [oxfmt](https://oxc.rs/)
- 2-space indent, UTF-8, LF line endings (see `.editorconfig`)

Run `bun check` before pushing to catch issues early.

## Branch Naming

Create branches off `master` with a conventional prefix:

```
feat/short-description
fix/short-description
chore/short-description
docs/short-description
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add session persistence
fix: resolve IPC timeout on reconnect
chore: update electron to 40.1
docs: add contributing guide
```

## Filing Issues

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code), two slash commands are available:

- `/bug-report` — create a structured bug report issue on GitHub
- `/feature-request` — create a structured feature request issue on GitHub

These commands auto-gather git context, batch questions, and create the issue via `gh` CLI.

## Pull Requests

1. Create a branch on origin following the naming convention above.
2. Make your changes and ensure `bun check` passes.
3. Open a PR against `master`.
