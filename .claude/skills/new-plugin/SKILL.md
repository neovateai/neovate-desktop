---
name: new-plugin
description: Scaffold a new Neovate Desktop plugin across main, shared, and renderer
disable-model-invocation: true
argument-hint: "<plugin-name> (e.g. bookmarks, snippets)"
---

# Scaffold New Plugin

Create the boilerplate for a new Neovate Desktop plugin across all three processes. All paths are relative to `packages/desktop/`.

## Steps

1. **Create shared contract** at `src/shared/plugins/<name>/contract.ts`:

   ```ts
   import { oc } from "@orpc/contract";

   export const <name>Contract = {
     // Define oRPC contract methods here
   };
   ```

2. **Register contract** in `src/shared/contract.ts`:
   - Add import: `import { <name>Contract } from "./plugins/<name>/contract";`
   - Add to the `contract` object: `<name>: <name>Contract,`

3. **Create main plugin** at `src/main/plugins/<name>/index.ts`:

   ```ts
   import type { MainPlugin, PluginContext } from "../../core/plugin/types";

   import { create<Name>Router } from "./router";

   export default {
     name: "<name>",
     async configContributions(ctx: PluginContext) {
       return {
         router: create<Name>Router(ctx.orpcServer),
       };
     },
   } satisfies MainPlugin;
   ```

4. **Create main router** at `src/main/plugins/<name>/router.ts`:

   ```ts
   import type { os } from "@orpc/server";

   export function create<Name>Router(orpcServer: typeof os) {
     return {
       // Implement contract handlers here
     };
   }
   ```

5. **Register plugin** in `src/main/index.ts`:
   - Add import: `import <name>Plugin from "./plugins/<name>";`
   - Add `<name>Plugin` to the `plugins` array in the `MainApp` constructor

6. **Create renderer directory** at `src/renderer/src/plugins/<name>/` with an initial component if needed.

7. Run `bun check` to verify everything compiles.

## Reference

See `src/main/plugins/terminal/index.ts` for the simplest working example (22 lines).
