# Auto Update Design

Migrated from neovate-code-desktop, redesigned to fix architectural issues and fit neovate-desktop's oRPC architecture.

## Problems with neovate-code-desktop's Design

1. **Dual data source**: Events + `getState()` create two sources of truth; renderer reconstructs state machine locally
2. **`isManualDownload` leaks to UI**: Server manages UI visibility concerns
3. **No state transition constraints**: No centralized transition table, guards scattered across methods
4. **`up-to-date` is a pseudo-state**: 3-second transient notification mixed with persistent states
5. **6 redundant events**: Could be a single `stateChanged` push

## Design Principles

- **Single source of truth**: Server owns factual state, pushes via one event iterator
- **Clean separation**: Server pushes facts, renderer decides presentation
- **Server doesn't know manual vs auto**: That's a renderer-only concern

## Architecture

### Placement

Built-in feature at `src/main/features/updater/`, not a plugin. The updater lifecycle is tightly coupled to the app.

### Server State

```typescript
// src/shared/features/updater/types.ts
type UpdaterState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "downloading"; version: string; percent: number }
  | { status: "ready"; version: string }
  | { status: "error"; message: string }
```

No `up-to-date` state. The renderer infers "no update" from `checking -> idle`.

### State Transitions

```
idle ──check()──> checking
checking ────────> idle          (no update found)
checking ────────> available     (update found)
checking ────────> error         (check failed)
available ───────> downloading   (auto-download starts)
downloading ─────> ready         (download complete)
downloading ─────> error         (download failed)
ready ──install()─> [app quits]
error ──check()──> checking      (retry)
```

Server auto-downloads on `available`; no manual download step needed.

### oRPC Contract

```typescript
// src/shared/features/updater/contract.ts
import { oc, type, eventIterator } from "@orpc/contract";

export const updaterContract = {
  check: oc.output(type<void>()),
  install: oc.output(type<void>()),
  watchState: oc.output(eventIterator(type<UpdaterState>())),
};
```

Three methods. `watchState()` yields current state as first value, then pushes changes.

### Server Implementation

```typescript
// src/main/features/updater/service.ts
class UpdaterService {
  private state: UpdaterState = { status: "idle" };
  private listeners = new Set<(state: UpdaterState) => void>();
  private checkInterval: Timer | null = null;

  private setState(newState: UpdaterState) {
    this.state = newState;
    for (const listener of this.listeners) listener(newState);
  }

  async *watchState(signal?: AbortSignal): AsyncGenerator<UpdaterState> {
    const queue: UpdaterState[] = [];
    let resolve: (() => void) | null = null;
    const listener = (s: UpdaterState) => { queue.push(s); resolve?.(); };
    this.listeners.add(listener);
    signal?.addEventListener("abort", () => resolve?.(), { once: true });

    try {
      yield this.state;
      while (!signal?.aborted) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => { resolve = r; });
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
    autoUpdater.checkForUpdates().catch((err) => {
      this.setState({ status: "error", message: String(err) });
    });
  }

  install() {
    if (this.state.status !== "ready") return;
    autoUpdater.quitAndInstall();
  }

  init() {
    autoUpdater.autoDownload = false;
    autoUpdater.on("update-not-available", () => this.setState({ status: "idle" }));
    autoUpdater.on("update-available", (info) => {
      this.setState({ status: "available", version: info.version });
      autoUpdater.downloadUpdate();
    });
    autoUpdater.on("download-progress", (p) => {
      if (this.state.status === "available" || this.state.status === "downloading") {
        this.setState({ status: "downloading", version: (this.state as any).version, percent: Math.round(p.percent) });
      }
    });
    autoUpdater.on("update-downloaded", (info) => this.setState({ status: "ready", version: info.version }));
    autoUpdater.on("error", (err) => this.setState({ status: "error", message: err.message }));

    this.check();
    this.checkInterval = setInterval(() => this.check(), 60 * 60 * 1000);
  }

  dispose() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.listeners.clear();
  }
}
```

### Router

```typescript
// src/main/features/updater/router.ts
const os = implement({ updater: updaterContract }).$context<AppContext>();

export const updaterRouter = os.updater.router({
  check: os.updater.check.handler(({ context }) => context.updaterService.check()),
  install: os.updater.install.handler(({ context }) => context.updaterService.install()),
  watchState: os.updater.watchState.handler(async function* ({ signal, context }) {
    yield* context.updaterService.watchState(signal);
  }),
});
```

### Integration Points

**AppContext** (`src/main/router.ts`): Add `updaterService`.

**Router** (`src/main/router.ts`): Add `updater: updaterRouter`.

**Entry point** (`src/main/index.ts`): Create `UpdaterService`, add to `appContext`, call `init()` after `app.whenReady()`.

**Contract** (`src/shared/contract.ts`): Add `updater: updaterContract`.

### Renderer Integration

Two independent UI paths, zero shared state between them.

**1. Update Toast** — shows download progress and ready state. Works for both auto and manual checks.

```typescript
// src/renderer/src/features/updater/UpdaterToast.tsx
function UpdaterToast() {
  const state = useUpdaterState();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed on status change (not on percent updates)
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
      <Toast>
        Downloading {state.version}... {percent}%
        <ProgressBar value={percent} />
      </Toast>
    );
  }

  if (state.status === "ready") {
    return (
      <Toast>
        Update {state.version} ready
        <Button onClick={() => setDismissed(true)}>Later</Button>
        <Button onClick={() => orpc.updater.install()}>Restart</Button>
      </Toast>
    );
  }

  return null;
}
```

**2. Check Button** — inline at trigger location. Only shows checking spinner and "up to date" feedback.

```typescript
function CheckForUpdatesButton() {
  const state = useUpdaterState();
  const [checking, setChecking] = useState(false);

  function handleCheck() {
    setChecking(true);
    orpc.updater.check();
  }

  useEffect(() => {
    if (!checking) return;
    if (state.status === "idle") {
      const t = setTimeout(() => setChecking(false), 3000);
      return () => clearTimeout(t);
    }
    if (state.status !== "checking") {
      setChecking(false);  // Update found or error — toast takes over
    }
  }, [checking, state.status]);

  return (
    <div>
      <Button onClick={handleCheck} disabled={checking}>Check for Updates</Button>
      {checking && state.status === "checking" && <Spinner />}
      {checking && state.status === "idle" && <span>Up to date</span>}
    </div>
  );
}
```

**UI flow — manual check:**
```
Button: [spinner] ──found──> [clear]
Toast:                        [Downloading 50%] ──> [v1.2.3 ready — Later / Restart]
```

**UI flow — manual check, no update:**
```
Button: [spinner] ──> [Up to date (3s)] ──> [clear]
Toast:  (nothing)
```

**UI flow — auto check:**
```
Button: (nothing)
Toast:  [Downloading 50%] ──> [v1.2.3 ready — Later / Restart]
```

## File Structure

```
src/main/features/updater/
  service.ts          # UpdaterService class
  router.ts           # oRPC router

src/shared/features/updater/
  contract.ts         # oRPC contract
  types.ts            # UpdaterState type

src/renderer/src/features/updater/
  UpdaterToast.tsx    # Download progress + ready toast
  hooks.ts            # useUpdaterState hook
```

Check button is inline wherever the trigger lives, not a separate file.
