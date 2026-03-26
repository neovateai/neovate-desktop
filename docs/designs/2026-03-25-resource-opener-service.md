# Opener Service & External URI Opener Service

**Date:** 2026-03-25
**Branch:** feat/open-chat-markdown-link-in-browser

## Problem

Chat messages render markdown links as `<a>` tags. Clicking them triggers `window.open()`, which the main process intercepts via `setWindowOpenHandler` and routes to `shell.openExternal()` — opening in the system browser.

We want http/https links to open in the app's built-in browser plugin. We also want file paths to open in the editor plugin. The challenge: the link click handler (in a generic UI component) should not know which plugin handles which resource. Plugins may or may not be loaded.

## Design

### Inspiration: VS Code's Two-Layer Architecture

VS Code uses two layers for URI opening:

1. **`IOpenerService`** (internal) — Top-level chain-of-responsibility. Holds built-in openers (CommandOpener, EditorOpener) and the ExternalUriOpenerService. Iterates openers until one handles the URI.
2. **`IExternalUriOpenerService`** (extension-facing) — Manages openers contributed by extensions. Registers itself as an `IExternalOpener` into `IOpenerService`. Handles scheme filtering, priority resolution, and user prompts.

We replicate this two-layer split. The only structural difference: Neovate plugins are same-process, so external openers are declared in `configContributions(ctx)` instead of registered imperatively in `activate()`.

**Key difference from VS Code:** In VS Code, the editor is built-in and handles `file:` URIs via an `IOpener` in Layer 1. In Neovate, the editor is a plugin — so `file:` URIs are also routed through Layer 2 (`ExternalUriOpenerService`) alongside `http/https`. Layer 2 is not limited to "external" URIs; it handles all plugin-contributed URI openers regardless of scheme.

### Full Resolution Chain

When a user clicks a link (e.g. in chat markdown):

```
MarkdownLink onClick
  → app.opener.open("https://example.com")

OpenerService.open(resource)
  1. Normalize input to URL
  2. Try built-in IOpeners in registration order
     → opener.open(uri) returns true? → done
  3. Delegate to ExternalUriOpenerService.openExternal(uri)
     a. Check user configuration (host pattern → opener id)
        - Matched "default" → return false (use system browser)
        - Matched an opener id → call that opener's openExternalUri() directly, skip canOpenExternalUri()
     b. No user config matched → iterate plugin-registered openers:
        - Filter by metadata.schemes
        - Call canOpenExternalUri(uri)
        - First that returns true → call openExternalUri(uri) → done
     c. No opener handled → return false
  4. Final fallback: window.open(uri) → main process → shell.openExternal() → system browser
```

Example: user clicks `https://github.com/foo` with no user configuration:

1. OpenerService: no built-in IOpeners registered → step 3
2. ExternalUriOpenerService: no user config → step 3b
3. Browser plugin registered `{ schemes: ["http", "https"] }` → scheme matches
4. `canOpenExternalUri()` returns true → `openExternalUri()` opens in browser view

Example: user configured `{ "*.github.com": "default" }`:

1. OpenerService → step 3
2. ExternalUriOpenerService: user config matches `*.github.com` → `"default"` → return false
3. OpenerService fallback → `window.open()` → system browser

### URI

Use the standard [URL API](https://developer.mozilla.org/en-US/docs/Web/API/URL). VS Code uses a custom `URI` class for historical reasons (predates widespread `URL` API availability, locked into the public extension API). No reason to replicate that.

| Resource       | Input                   | URL                                 |
| -------------- | ----------------------- | ----------------------------------- |
| Web link       | `https://docs.rs/tokio` | `new URL("https://docs.rs/tokio")`  |
| File path      | `/src/main.ts`          | `new URL("file:///src/main.ts")`    |
| File with line | `/src/main.ts:42`       | `new URL("file:///src/main.ts#42")` |

**Normalization rules** (applied by `OpenerService` before passing to openers):

- Bare paths (starting with `/`) are prefixed with `file://`
- `path:line` syntax is converted to `file://path#line`
- Already-valid URLs are passed through unchanged

**Path encoding:** Bare paths are converted to `file://` URLs using segment-wise `encodeURIComponent` to handle spaces, `#`, and other URL-reserved characters in file names. The `/` separator is preserved by splitting first, encoding each segment, then rejoining.

## Layer 1: OpenerService

The top-level URI dispatcher. Corresponds to VS Code's `IOpenerService`.

### IOpener Interface

```typescript
/**
 * A participant that can handle open() calls.
 */
interface IOpener {
  open(resource: URL | string): boolean;
}
```

### IExternalOpener Interface

```typescript
/**
 * An opener for plugin-contributed URI handlers.
 * The OpenerService delegates to this after built-in openers decline.
 */
interface IExternalOpener {
  openExternal(href: string, ctx: { sourceUri: string }): boolean;
}
```

### OpenerService

```typescript
/**
 * Top-level URI opener. Maintains a chain of IOpeners and a fallback IExternalOpener.
 */
class OpenerService {
  private openers: IOpener[] = [];
  private externalOpener: IExternalOpener | null = null;

  /**
   * Register an opener that participates in the open() chain.
   * Openers are tried in registration order.
   */
  registerOpener(opener: IOpener): Disposable {
    this.openers.push(opener);
    return { dispose: () => remove(this.openers, opener) };
  }

  /**
   * Register the external opener (typically ExternalUriOpenerService).
   * Only one external opener is active at a time.
   */
  registerExternalOpener(opener: IExternalOpener): Disposable {
    this.externalOpener = opener;
    return {
      dispose: () => {
        this.externalOpener = null;
      },
    };
  }

  /**
   * Open a resource.
   *
   * Resolution order:
   * 1. Normalize input to URL
   * 2. Try each registered IOpener in order
   * 3. If none handled it, delegate to the external opener
   * 4. Final fallback: shell.openExternal via window.open()
   */
  open(resource: string): boolean {
    const uri = this.normalize(resource);
    if (!uri) return false;

    // 1. Built-in openers
    for (const opener of this.openers) {
      if (opener.open(uri)) return true;
    }

    // 2. External opener (ExternalUriOpenerService)
    const ctx = { sourceUri: resource };
    if (this.externalOpener?.openExternal(uri.toString(), ctx)) {
      return true;
    }

    // 3. Final fallback: system browser
    const scheme = uri.protocol.replace(":", "");
    if (scheme === "https" || scheme === "http") {
      window.open(uri.toString()); // intercepted by main process → shell.openExternal
      return true;
    }
    return false;
  }

  /**
   * Encode a POSIX absolute path to a file:// URL.
   * Splits by `/`, encodes each segment with encodeURIComponent,
   * then rejoins — preserving `/` as path separator.
   */
  private pathToFileURL(path: string): URL {
    const encoded = path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return new URL(`file://${encoded}`);
  }

  private normalize(resource: string): URL | null {
    try {
      return new URL(resource);
    } catch {}

    const lineMatch = resource.match(/^(.+):(\d+)$/);
    if (lineMatch) {
      const url = this.pathToFileURL(lineMatch[1]);
      url.hash = lineMatch[2];
      return url;
    }
    if (resource.startsWith("/")) {
      return this.pathToFileURL(resource);
    }
    return null;
  }
}
```

## Layer 2: ExternalUriOpenerService

Manages plugin-contributed openers. Registers itself into `OpenerService` as an `IExternalOpener`. Corresponds to VS Code's `IExternalUriOpenerService`.

In VS Code this layer only handles http/https (extensions are "external"). In Neovate, all openers are plugins — including the editor — so this layer handles all plugin-contributed schemes (http, https, file, etc.).

### ExternalUriOpener Interface

```typescript
/**
 * Handles opening URIs via plugin-contributed openers.
 *
 * Plugins can implement an ExternalUriOpener to open links inside the app
 * instead of having the link be opened by the system browser.
 */
interface ExternalUriOpener {
  /**
   * Check if the opener can open a URI.
   *
   * @param uri The URI being opened. This is the URI that the user clicked on.
   * @returns true if this opener can handle the URI.
   *
   * Note: VS Code returns ExternalUriOpenerPriority instead of boolean.
   * Changing to Priority in the future is a minor breaking change — existing
   * implementations would need to return Priority values instead of boolean.
   */
  canOpenExternalUri(uri: URL): boolean;

  /**
   * Open a URI.
   *
   * @param resolvedUri The URI to open.
   * @param ctx Additional information about the URI being opened.
   * @returns true if the URI was successfully opened.
   */
  openExternalUri(resolvedUri: URL, ctx: OpenExternalUriContext): boolean;
}

/**
 * Additional information about the URI being opened.
 */
interface OpenExternalUriContext {
  /** The original URI string that triggered the open. */
  readonly sourceUri: string;
}

/**
 * Additional metadata about a registered ExternalUriOpener.
 */
interface ExternalUriOpenerMetadata {
  /**
   * List of URI schemes the opener is triggered for.
   * Used to pre-filter openers before calling canOpenExternalUri.
   */
  readonly schemes: readonly string[];

  /**
   * Text displayed to the user that explains what the opener does.
   *
   * For example, 'Open in browser preview'
   */
  readonly label: string;
}
```

### ExternalUriOpener Contribution

```typescript
interface ExternalUriOpenerContribution {
  readonly id: string;
  readonly opener: ExternalUriOpener;
  readonly metadata: ExternalUriOpenerMetadata;
}
```

Registered via `configContributions(ctx)`:

```typescript
interface PluginContributions {
  // ... existing fields
  externalUriOpeners?: ExternalUriOpenerContribution[];
}

// configContributions signature change — receives PluginContext
configContributions(ctx: PluginContext): PluginContributions;
```

**Why `configContributions` and not `activate`?**

VS Code registers openers in `activate()` because extensions are process-isolated and lazily activated. Neovate plugins are same-process, so this constraint doesn't apply. `configContributions` is the natural place for all plugin contributions — both declarative (views, items) and behavioral (openers). `configContributions` will be split in the future: view-related contributions move to `configViewContributions`, while behavioral registrations like `externalUriOpeners` stay in `configContributions`.

**Lifecycle note:** Opener functions (e.g. `openExternalUri`) capture `ctx.app.workbench` via closure but are only invoked at runtime (when the user clicks a link), not during contribution collection. By that time `initWorkbench()` has completed and `ctx.app.workbench` is fully initialized.

### ExternalUriOpenerService

```typescript
/**
 * Manages plugin-contributed ExternalUriOpeners.
 * Registers itself as an IExternalOpener in OpenerService.
 */
class ExternalUriOpenerService implements IExternalOpener {
  private openers = new Map<
    string,
    { opener: ExternalUriOpener; metadata: ExternalUriOpenerMetadata }
  >();

  constructor(openerService: OpenerService) {
    openerService.registerExternalOpener(this);
  }

  /**
   * Register a plugin-contributed opener.
   */
  registerExternalUriOpener(
    id: string,
    opener: ExternalUriOpener,
    metadata: ExternalUriOpenerMetadata,
  ): Disposable {
    this.openers.set(id, { opener, metadata });
    return { dispose: () => this.openers.delete(id) };
  }

  /**
   * Called by OpenerService when built-in openers don't handle the URI.
   *
   * Resolution order:
   * 1. Check user-configured opener for this URI pattern
   *    - If configured as "default" → return false (fall through to system browser)
   *    - If configured as an opener id → use that opener directly (skip canOpenExternalUri)
   * 2. If no user config matches, iterate all openers filtered by scheme
   *    - Call canOpenExternalUri on each
   *    - First that returns true gets openExternalUri called
   */
  openExternal(href: string, ctx: { sourceUri: string }): boolean {
    let uri: URL;
    try {
      uri = new URL(href);
    } catch {
      return false;
    }

    const openCtx: OpenExternalUriContext = { sourceUri: ctx.sourceUri };

    // 1. Check user configuration
    const configuredOpener = this.getConfiguredOpenerForUri(uri);
    if (configuredOpener === "default") {
      return false; // Fall through to system browser
    }
    if (configuredOpener) {
      return configuredOpener.openExternalUri(uri, openCtx);
    }

    // 2. Iterate openers by scheme + canOpenExternalUri
    const scheme = uri.protocol.replace(":", "");
    for (const [, { opener, metadata }] of this.openers) {
      if (!metadata.schemes.includes(scheme)) continue;
      if (opener.canOpenExternalUri(uri)) {
        if (opener.openExternalUri(uri, openCtx)) return true;
      }
    }

    return false;
  }

  /**
   * Look up user-configured opener for a URI.
   * Matches URI hostname against configured patterns using minimatch,
   * returns the opener or "default".
   */
  private getConfiguredOpenerForUri(uri: URL): ExternalUriOpener | "default" | undefined {
    const config = this.getConfiguration();
    for (const [hostPattern, openerId] of Object.entries(config)) {
      if (minimatch(uri.hostname, hostPattern)) {
        if (openerId === "default") {
          return "default";
        }
        const entry = this.openers.get(openerId);
        if (entry) {
          return entry.opener;
        }
      }
    }
    return undefined;
  }

  /**
   * Get the externalUriOpeners configuration.
   * Returns a map of host pattern → opener id.
   */
  private getConfiguration(): Record<string, string> {
    // TODO: Read from settings store when user configuration is implemented
    return {};
  }
}
```

## Plugin Examples

### Browser Plugin

Factory function with optional `includeHosts` configuration. Follows VS Code Simple Browser's pattern where the plugin itself decides which hosts to handle via `canOpenExternalUri`.

- No `includeHosts` → don't handle any URLs (opener not registered)
- With `includeHosts` → only handle matching hosts

This is plugin-level configuration, independent of user settings. User settings (host pattern → opener id) operate at the `ExternalUriOpenerService` level and take priority over `canOpenExternalUri`.

```typescript
// plugins/browser/index.tsx

interface BrowserPluginOptions {
  /**
   * Host glob patterns to open in the built-in browser.
   * Matched against `url.hostname` using minimatch.
   *
   * Pattern syntax:
   * - `"localhost"` — exact match
   * - `"*.github.com"` — matches `api.github.com`, `raw.github.com`, etc.
   * - `"192.168.0.*"` — matches `192.168.0.1`, `192.168.0.100`, etc.
   * - `"**"` — matches all hosts
   *
   * If not provided, no opener is registered (links open in system browser).
   * Future: add `excludeHosts` for deny-list filtering.
   */
  includeHosts?: string[];
}

export default function browserPlugin(options?: BrowserPluginOptions): RendererPlugin {
  return {
    name: "plugin-browser",

    configContributions(ctx) {
      return {
        contentPanelViews: [{ viewType: "browser", ... }],
        externalUriOpeners: options?.includeHosts ? [{
          id: "browser.preview",
          opener: {
            canOpenExternalUri(uri) {
              return options.includeHosts!.some((pattern) => minimatch(uri.hostname, pattern));
            },
            openExternalUri(resolvedUri) {
              ctx.app.workbench.contentPanel.openView("browser", {
                state: { url: resolvedUri.toString() },
              });
              return true;
            },
          },
          metadata: {
            schemes: ["http", "https"],
            label: "Open in browser preview",
          },
        }] : [],
      };
    },
  };
}
```

Usage in `app.tsx`:

```typescript
const BUILTIN_PLUGINS: RendererPlugin[] = [
  browserPlugin(), // no opener registered, links open in system browser
  // or:
  browserPlugin({ includeHosts: ["localhost", "127.0.0.1", "*.github.com"] }), // only these hosts open in-app
];
```

### Editor Plugin

```typescript
// plugins/editor/index.tsx
configContributions(ctx) {
  return {
    contentPanelViews: [{ viewType: "editor", ... }],
    externalUriOpeners: [{
      id: "editor.file",
      opener: {
        canOpenExternalUri() {
          return true;
        },
        openExternalUri(resolvedUri) {
          ctx.app.workbench.contentPanel.openView("editor", {
            state: {
              filePath: decodeURIComponent(resolvedUri.pathname),
              line: resolvedUri.hash ? Number(resolvedUri.hash.slice(1)) : undefined,
            },
          });
          return true;
        },
      },
      metadata: {
        schemes: ["file"],
        label: "Open in editor",
      },
    }],
  };
}
```

**Note:** The editor view is `singleton: true`. The first `openView("editor", { state })` creates the tab with initial state. Subsequent calls activate the existing tab — how to update the editor's target file in that case is a separate concern to be designed later.

## Wiring

**App surface:**

`opener` lives on the concrete `RendererApp` class only — **not** on the `IRendererApp` interface. This is intentional:

- `IRendererApp` is the plugin-facing contract (`PluginContext.app`). Plugins are URI **handlers** (they register openers via `configContributions`), not URI **dispatchers**. They should not call `opener.open()`.
- `RendererApp` is the concrete class returned by `useRendererApp()`. React components (e.g. `MarkdownLink`) are the actual callers and access `app.opener` with full type safety.
- If plugins need to dispatch URIs in the future, adding `opener` to `IRendererApp` is a non-breaking change.

This mirrors VS Code where `IOpenerService` is in `platform/` (general-purpose), not `workbench/` (UI-specific).

```typescript
// RendererApp class — NOT on IRendererApp interface
class RendererApp implements IRendererApp {
  readonly opener = new OpenerService(); // new
  // ...
}
```

**Initialization** (in `RendererApp.initWorkbench`):

```typescript
// Wire ExternalUriOpenerService with plugin-contributed openers
const externalUriOpenerService = new ExternalUriOpenerService(this.opener);

for (const { id, opener, metadata } of this.pluginManager.contributions.externalUriOpeners) {
  externalUriOpenerService.registerExternalUriOpener(id, opener, metadata);
}

// Future: register built-in openers into OpenerService directly
// this.opener.registerOpener(new CommandOpener(...));
```

## Callers

All link-opening callsites use a single entry point:

```typescript
// MarkdownLink component
function MarkdownLink({ className, children, ...props }: MarkdownAnchorProps) {
  const app = useRendererApp();
  return (
    <a
      className={cn("text-primary transition-colors underline-offset-2 hover:underline", className)}
      {...props}
      onClick={(e) => {
        if (props.href) {
          e.preventDefault();
          app.opener.open(props.href);
        }
      }}
    >
      {children}
    </a>
  );
}

// Terminal links, settings links, etc. — all call app.opener.open(url)
```

## Changes to `openView`

`openView` needs to accept initial state so openers can set URL/filePath in one call:

```typescript
openView(viewType: string, options?: {
  activate?: boolean;
  state?: Record<string, unknown>;  // new: initial view state
}): string {
  // ... existing logic ...
  const tab: Tab = {
    id: crypto.randomUUID(),
    viewType,
    state: options?.state ?? {},  // was: {}
  };
  // ...
}
```

## User Configuration (Deferred)

Users can configure which opener handles which hosts via settings:

```json
{
  "externalUriOpeners": {
    "*.github.com": "browser.preview",
    "localhost": "browser.preview",
    "example.com": "default"
  }
}
```

- Keys are host glob patterns matched using minimatch (same DSL as plugin `includeHosts`)
- Values are opener `id`s, or `"default"` to force the system browser

When a URI is opened, `ExternalUriOpenerService` checks user config first:

1. Match URI hostname against configured patterns using minimatch
2. If a pattern matches and points to an opener `id` → use that opener directly (skip `canOpenExternalUri`)
3. If a pattern matches `"default"` → use system browser
4. If no pattern matches → fall through to normal `canOpenExternalUri` resolution

This is why `id` exists on `ExternalUriOpenerContribution` — it's the key users reference in settings. Not used in the current implementation, but the field is required now to avoid a breaking change when user configuration is added.

## What This Design Intentionally Defers

| Concern                                                          | VS Code has it | Why defer                                                    |
| ---------------------------------------------------------------- | -------------- | ------------------------------------------------------------ |
| `ExternalUriOpenerPriority` enum (None/Option/Default/Preferred) | Yes            | Single opener per scheme for now; no conflicts to resolve    |
| User configuration (host patterns in settings)                   | Yes            | No settings UI for this yet                                  |
| `IValidator` (block opening)                                     | Yes            | No security/policy requirements yet                          |
| `CancellationToken`                                              | Yes            | Same-process openers are synchronous                         |
| `async canOpenExternalUri / openExternalUri`                     | Yes            | All current openers are sync; change return type when needed |
| Activation events (`onOpenExternalUri:https`)                    | Yes            | Plugins are always loaded, no lazy activation needed         |
| User prompt when multiple openers match                          | Yes            | Single opener per scheme for now                             |
| Singleton view state update on reuse                             | Yes            | Editor singleton reuse semantics to be designed separately   |

Adding Priority or async support would be minor breaking changes to the `ExternalUriOpener` interface (return type changes). Plan for a migration path when needed.

## File Changes Summary

| File                                                                   | Change                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/src/core/opener.ts`                                      | **New** — `IOpener`, `IExternalOpener`, `OpenerService`                                                                                           |
| `src/renderer/src/core/external-uri-opener.ts`                         | **New** — `ExternalUriOpener`, `ExternalUriOpenerMetadata`, `OpenExternalUriContext`, `ExternalUriOpenerContribution`, `ExternalUriOpenerService` |
| `src/renderer/src/core/types.ts`                                       | No change — `opener` only on `RendererApp` class                                                                                                  |
| `src/renderer/src/core/plugin/types.ts`                                | Add `ctx` param to `configContributions`                                                                                                          |
| `src/renderer/src/core/plugin/contributions.ts`                        | Add `externalUriOpeners` to `PluginContributions`, merge in `buildContributions`                                                                  |
| `src/renderer/src/core/plugin/plugin-manager.ts`                       | Pass `PluginContext` to `configContributions`                                                                                                     |
| `src/renderer/src/core/app.tsx`                                        | Add `opener` field on `RendererApp` class, wire `ExternalUriOpenerService` in initWorkbench                                                       |
| `src/renderer/src/features/content-panel/content-panel.ts`             | Add `state` option to `openView`                                                                                                                  |
| `src/renderer/src/plugins/browser/index.tsx`                           | Convert to factory function with `includeHosts` option (future: `excludeHosts`), register http/https `ExternalUriOpener`                          |
| `src/renderer/src/components/ai-elements/markdown-base-components.tsx` | `MarkdownLink` calls `app.opener.open()`                                                                                                          |
