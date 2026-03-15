# Shared Code

Types and oRPC contracts imported by both main and renderer processes.

- Contract root: `contract.ts` — all IPC method signatures
- Each domain has `features/<name>/contract.ts` with zod schemas
- `claude-code/tools/` — parsers for ACP tool output rendering
- Changes here affect both processes — run `bun check` after editing
