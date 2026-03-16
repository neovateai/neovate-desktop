# Extract Product Name as Global Config

## Goal

Centralize hardcoded product name strings, directory paths, and storage key prefixes so they're defined once and shared across processes.

## New Files

### `src/shared/constants.ts`

Importable by both main and renderer:

```ts
export const APP_NAME = "Neovate";
export const APP_ID = "neovate-desktop";
```

### `src/main/core/app-paths.ts`

Main process only (needs `os.homedir()`):

```ts
import { homedir } from "node:os";
import { join } from "node:path";

import { APP_ID } from "../../shared/constants";

export const APP_DATA_DIR = join(homedir(), `.${APP_ID}`);
```

## Changes

### Renderer — UI strings (import `APP_NAME` from `shared/constants`)

| File                                             | Before                                               | After                                                        |
| ------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------ |
| `features/agent/components/welcome-panel.tsx:14` | `alt="Neovate Logo"`                                 | ``alt={`${APP_NAME} Logo`}``                                 |
| `features/agent/components/welcome-panel.tsx:17` | `"Hi, I'm Neovate. Let's start chatting!"`           | `` `Hi, I'm ${APP_NAME}. Let's start chatting!` ``           |
| `features/updater/updater-toast.tsx:65`          | `"Neovate will quit and reopen to finish updating."` | `` `${APP_NAME} will quit and reopen to finish updating.` `` |

### Main — UI strings (import `APP_NAME` from `shared/constants`)

| File              | Before             | After             |
| ----------------- | ------------------ | ----------------- |
| `core/menu.ts:17` | `label: "Neovate"` | `label: APP_NAME` |

### Main — App identity (`index.ts`)

| File          | Before                                          | After                                                    |
| ------------- | ----------------------------------------------- | -------------------------------------------------------- |
| `index.ts:56` | `electronApp.setAppUserModelId("com.electron")` | `electronApp.setAppUserModelId("com.neovateai.desktop")` |

### Main — Directory paths (import `APP_DATA_DIR` from `core/app-paths`)

| File                                   | Before                                              | After                            |
| -------------------------------------- | --------------------------------------------------- | -------------------------------- |
| `core/logger.ts:8`                     | `join(homedir(), ".neovate-desktop", "logs")`       | `join(APP_DATA_DIR, "logs")`     |
| `core/browser-window-manager.ts:30`    | `path.join(os.homedir(), ".neovate-desktop")`       | `APP_DATA_DIR`                   |
| `core/storage-service.ts:5`            | `path.join(os.homedir(), ".neovate-desktop")`       | `APP_DATA_DIR`                   |
| `features/config/config-store.ts:57`   | `path.join(os.homedir(), ".neovate-desktop")`       | `APP_DATA_DIR`                   |
| `features/project/project-store.ts:20` | `path.join(os.homedir(), ".neovate-desktop")`       | `APP_DATA_DIR`                   |
| `features/agent/claude-settings.ts:13` | `join(homedir(), ".neovate-desktop", "sessions")`   | `join(APP_DATA_DIR, "sessions")` |
| `features/agent/router.ts:89`          | `path.join(homedir(), ".neovate-desktop", "plans")` | `join(APP_DATA_DIR, "plans")`    |

## Not Touched

- Debug namespaces (`debug("neovate:...")`) — internal logging, not user-facing
- Editor plugin paths (`~/.neovate/code-server`, `~/.local/share/neovate-code/`) — left as-is per decision
- Code identifiers (`NeovateApi` interface) — code symbols, not product name strings
- Custom events (`neovate:log-event`) — internal plumbing
- Storage keys (`neovate:defaultOpenApp`) — only one occurrence, not worth extracting
