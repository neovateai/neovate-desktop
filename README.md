# neovate-desktop

ACP protocol Electron client with chat-first experience. Claude Code first, more agents later.

Successor of [neovate-code-desktop](https://github.com/neovateai/neovate-code-desktop) — rebuilt from scratch with a new architecture.

macOS only.

## What Changed

- **IPC**: custom IPC → [oRPC](https://orpc.unnoq.com/) (type-safe Main ↔ Renderer)
- **Agent comm**: WebSocket → [ACP protocol](https://agentclientprotocol.com/) (one subprocess per session, stdio NDJSON)

## Architecture

```
Renderer (React 19 + zustand 5)
    ↕ oRPC (type-safe IPC + ACP event forwarding)
Main
    ├── AcpManager → ACP subprocess × N (per session, stdio)
    └── Store Persistence (local JSON)
```

## Tech Stack

| Layer    | Choice                                          |
| -------- | ----------------------------------------------- |
| Desktop  | Electron ~40, electron-vite 5, electron-builder |
| Frontend | React 19, TypeScript 5, Vite 7                  |
| IPC      | oRPC                                            |
| Agent    | ACP (`@agentclientprotocol/sdk`)                |
| State    | zustand 5 (multi-slice)                         |
| Style    | Tailwind CSS 4, @base-ui/react                  |
| Terminal | XTerm.js 6 + node-pty                           |
| Lint     | Biome                                           |
| Test     | Vitest + @testing-library/react                 |
| Package  | pnpm                                            |

## Modules

- **Communication**: ACP connection management, oRPC IPC layer
- **Session & Project**: session CRUD/resume/archive, project management, workspace (branch/worktree isolation)
- **Chat**: message stream, input, permission approval, question panel, task messages, todo list, diff viewer
- **Content Panel**: terminal, code editor (code-server), browser (webview), review, multi-tab
- **Sidebar**: file tree, git panel, search
- **Layout**: title bar, activity bar, status bar, window management
- **Settings**: general, providers, MCP, skills, rules, keybindings
- **Extensions**: plugin system (main + renderer), slash commands, VS Code integration
- **Infra**: onboarding, auto-update, i18n, state persistence

## Roadmap

| Milestone | Scope                                           | Timeline |
| --------- | ----------------------------------------------- | -------- |
| **MVP**   | ACP round-trip, basic chat, permission approval | W1 early |
| **M1**    | Layout framework, state persistence             | W1 late  |
| **M2**    | Session/project management, all message types   | W2       |
| **M3**    | Diff viewer, terminal, sidebar, settings, i18n  | W2-W3    |
| **M4**    | Editor, browser, review, plugins, auto-update   | W3+      |

## References

- [ACP Protocol](https://agentclientprotocol.com/)
- [zed-industries/claude-agent-acp](https://github.com/zed-industries/claude-agent-acp)
- [ThinkInAIXYZ/deepchat](https://github.com/ThinkInAIXYZ/deepchat)
- [multica-ai/multica](https://github.com/multica-ai/multica)

## License

Private
