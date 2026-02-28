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

| Command         | Description                           |
| --------------- | ------------------------------------- |
| `bun dev`       | Start dev server with hot reload      |
| `bun build`     | Build the app                         |
| `bun build:mac` | Build macOS distributable             |
| `bun check`     | Run typecheck + lint + format check   |
| `bun lint`      | Run oxlint                            |
| `bun format`    | Format code with oxfmt                |
| `bun test`      | Run unit tests in watch mode (vitest) |
| `bun test:run`  | Run unit tests once (CI)              |
| `bun test:e2e`  | Build and run e2e tests (playwright)  |

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

## Pull Requests

1. Create a branch on origin following the naming convention above.
2. Make your changes and ensure `bun check` passes.
3. Open a PR against `master`.
