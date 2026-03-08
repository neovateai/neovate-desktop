# Auto Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add auto-update to neovate-desktop with single event iterator state push and two independent UI paths (toast + check button).

**Architecture:** Built-in feature using oRPC event iterator. Server pushes `UpdaterState` via `watchState()`. Renderer has two decoupled UI components: `UpdaterToast` (download progress + ready) and `CheckForUpdatesButton` (inline check feedback).

**Tech Stack:** electron-updater, @orpc/contract, @orpc/server, React, base-ui Progress component, Tailwind CSS

**Design doc:** `docs/plans/2026-03-08-auto-update-design.md`

---

### Task 1: Shared types and contract

**Files:**
- Create: `src/shared/features/updater/types.ts`
- Create: `src/shared/features/updater/contract.ts`
- Modify: `src/shared/contract.ts`

**Step 1: Create UpdaterState type**

```typescript
// src/shared/features/updater/types.ts
export type UpdaterState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "downloading"; version: string; percent: number }
  | { status: "ready"; version: string }
  | { status: "error"; message: string };
```

**Step 2: Create oRPC contract**

```typescript
// src/shared/features/updater/contract.ts
import { oc, type, eventIterator } from "@orpc/contract";
import type { UpdaterState } from "./types";

export const updaterContract = {
  check: oc.output(type<void>()),
  install: oc.output(type<void>()),
  watchState: oc.output(eventIterator(type<UpdaterState>())),
};
```

**Step 3: Register in root contract**

Add to `src/shared/contract.ts`:

```typescript
import { updaterContract } from "./features/updater/contract";

export const contract = {
  ping: oc.output(type<"pong">()),
  acp: acpContract,
  project: projectContract,
  utils: utilsContract,
  updater: updaterContract,
};
```

**Step 4: Verify types compile**

Run: `cd packages/desktop && bun run typecheck`
Expected: No errors related to updater contract

**Step 5: Commit**

```
feat: add updater shared types and oRPC contract
```

---

### Task 2: UpdaterService

**Files:**
- Create: `src/main/features/updater/service.ts`

**Step 1: Create UpdaterService**

```typescript
// src/main/features/updater/service.ts
import { autoUpdater } from "electron-updater";
import type { UpdaterState } from "../../../shared/features/updater/types";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class UpdaterService {
  private state: UpdaterState = { status: "idle" };
  private listeners = new Set<(state: UpdaterState) => void>();
  private checkInterval: Timer | null = null;
  private currentVersion: string | null = null;

  getState(): UpdaterState {
    return this.state;
  }

  private setState(newState: UpdaterState) {
    this.state = newState;
    for (const listener of this.listeners) listener(newState);
  }

  async *watchState(signal?: AbortSignal): AsyncGenerator<UpdaterState> {
    const queue: UpdaterState[] = [];
    let resolve: (() => void) | null = null;
    const listener = (s: UpdaterState) => {
      queue.push(s);
      resolve?.();
    };
    this.listeners.add(listener);
    signal?.addEventListener("abort", () => resolve?.(), { once: true });

    try {
      yield this.state;
      while (!signal?.aborted) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
          resolve = null;
        }
      }
    } finally {
      this.listeners.delete(listener);
    }
  }

  check() {
    if (this.state.status === "checking" || this.state.status === "downloading") return;
    this.setState({ status: "checking" });
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      this.setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    });
  }

  install() {
    if (this.state.status !== "ready") return;
    autoUpdater.quitAndInstall();
  }

  init() {
    autoUpdater.autoDownload = false;

    autoUpdater.on("update-not-available", () => {
      this.setState({ status: "idle" });
    });

    autoUpdater.on("update-available", (info) => {
      this.currentVersion = info.version;
      this.setState({ status: "available", version: info.version });
      autoUpdater.downloadUpdate();
    });

    autoUpdater.on("download-progress", (p) => {
      if (this.currentVersion && (this.state.status === "available" || this.state.status === "downloading")) {
        this.setState({ status: "downloading", version: this.currentVersion, percent: Math.round(p.percent) });
      }
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.setState({ status: "ready", version: info.version });
    });

    autoUpdater.on("error", (err) => {
      this.setState({ status: "error", message: err.message });
    });

    this.check();
    this.checkInterval = setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  dispose() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.listeners.clear();
    autoUpdater.removeAllListeners();
  }
}
```

Note: uses `currentVersion` field to avoid unsafe `(this.state as any).version` cast in `download-progress`.

**Step 2: Verify types compile**

Run: `cd packages/desktop && bun run typecheck`

**Step 3: Commit**

```
feat: add UpdaterService with state machine and event iterator
```

---

### Task 3: Router and wiring

**Files:**
- Create: `src/main/features/updater/router.ts`
- Modify: `src/main/router.ts`
- Modify: `src/main/index.ts`

**Step 1: Create updater router**

```typescript
// src/main/features/updater/router.ts
import { implement } from "@orpc/server";
import { updaterContract } from "../../../shared/features/updater/contract";
import type { AppContext } from "../../router";

const os = implement({ updater: updaterContract }).$context<AppContext>();

export const updaterRouter = os.updater.router({
  check: os.updater.check.handler(({ context }) => {
    context.updaterService.check();
  }),

  install: os.updater.install.handler(({ context }) => {
    context.updaterService.install();
  }),

  watchState: os.updater.watchState.handler(async function* ({ signal, context }) {
    yield* context.updaterService.watchState(signal);
  }),
});
```

**Step 2: Add UpdaterService to AppContext and router**

In `src/main/router.ts`, add:

```typescript
import type { UpdaterService } from "./features/updater/service";
import { updaterRouter } from "./features/updater/router";

export type AppContext = {
  acpConnectionManager: AcpConnectionManager;
  projectStore: ProjectStore;
  updaterService: UpdaterService;
};
```

Add `updater: updaterRouter` to `buildRouter()` return object (before `...Object.fromEntries(pluginRouters)`).

**Step 3: Wire up in entry point**

In `src/main/index.ts`, add:

```typescript
import { UpdaterService } from "./features/updater/service";

const updaterService = new UpdaterService();
```

Add `updaterService` to `appContext` object.

After `await mainApp.start()`, add:

```typescript
updaterService.init();
```

In the `before-quit` handler, add:

```typescript
updaterService.dispose();
```

**Step 4: Verify types compile**

Run: `cd packages/desktop && bun run typecheck`

**Step 5: Commit**

```
feat: wire updater router and service into app lifecycle
```

---

### Task 4: Renderer hook

**Files:**
- Create: `src/renderer/src/features/updater/hooks.ts`

**Step 1: Create useUpdaterState hook**

```typescript
// src/renderer/src/features/updater/hooks.ts
import { useState, useEffect } from "react";
import { client } from "../../orpc";
import type { UpdaterState } from "../../../../shared/features/updater/types";

export function useUpdaterState(): UpdaterState {
  const [state, setState] = useState<UpdaterState>({ status: "idle" });

  useEffect(() => {
    const iter = client.updater.watchState();
    let cancelled = false;
    (async () => {
      for await (const s of iter) {
        if (cancelled) break;
        setState(s);
      }
    })();
    return () => {
      cancelled = true;
      iter.return(undefined);
    };
  }, []);

  return state;
}
```

**Step 2: Verify types compile**

Run: `cd packages/desktop && bun run typecheck`

**Step 3: Commit**

```
feat: add useUpdaterState hook for renderer
```

---

### Task 5: UpdaterToast component

**Files:**
- Create: `src/renderer/src/features/updater/UpdaterToast.tsx`
- Modify: `src/renderer/src/App.tsx`

**Step 1: Create UpdaterToast**

Uses the existing `Progress` component from `src/renderer/src/components/ui/progress.tsx`. Fixed position overlay, shows for `available`/`downloading`/`ready` states.

```tsx
// src/renderer/src/features/updater/UpdaterToast.tsx
import { useState, useEffect, useRef } from "react";
import { Progress } from "../../components/ui/progress";
import { client } from "../../orpc";
import { useUpdaterState } from "./hooks";

export function UpdaterToast() {
  const state = useUpdaterState();
  const [dismissed, setDismissed] = useState(false);
  const prevStatus = useRef(state.status);

  useEffect(() => {
    if (state.status !== prevStatus.current) {
      prevStatus.current = state.status;
      setDismissed(false);
    }
  }, [state]);

  if (dismissed) return null;

  if (state.status === "available" || state.status === "downloading") {
    const percent = state.status === "downloading" ? state.percent : 0;
    return (
      <div className="fixed bottom-4 right-4 z-50 w-72 rounded-lg border bg-popover p-4 shadow-lg">
        <p className="mb-2 text-sm">Downloading {state.version}...</p>
        <Progress value={percent} max={100} />
      </div>
    );
  }

  if (state.status === "ready") {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-72 rounded-lg border bg-popover p-4 shadow-lg">
        <p className="mb-3 text-sm">Update {state.version} ready</p>
        <div className="flex justify-end gap-2">
          <button
            className="rounded px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => setDismissed(true)}
          >
            Later
          </button>
          <button
            className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
            onClick={() => client.updater.install()}
          >
            Restart
          </button>
        </div>
      </div>
    );
  }

  return null;
}
```

**Step 2: Add to App.tsx**

Add `<UpdaterToast />` as the last child inside `<AppLayoutRoot>`:

```tsx
import { UpdaterToast } from "./features/updater/UpdaterToast";

// Inside App component, before closing </AppLayoutRoot>:
<UpdaterToast />
```

**Step 3: Verify types compile and dev server runs**

Run: `cd packages/desktop && bun run typecheck`
Run: `cd packages/desktop && bun run dev` (manual smoke test — toast should not appear if no update available)

**Step 4: Commit**

```
feat: add UpdaterToast component with download progress and ready state
```

---

### Task 6: Verify end-to-end

**Step 1: Run typecheck**

Run: `cd packages/desktop && bun run typecheck`
Expected: PASS

**Step 2: Run existing tests**

Run: `cd packages/desktop && bun run test:run`
Expected: No regressions

**Step 3: Commit all remaining changes (if any)**

```
chore: finalize auto-update feature
```
