# Browser Preview Plugin

## Goal

Add a browser preview to the content panel, allowing developers to preview web pages (e.g., dev server output) without leaving the app. Matches VS Code Simple Browser behavior.

## Scope

### In Scope

- Address bar with URL input and Enter to navigate
- Navigation buttons: back, forward, refresh
- DevTools button (opens in detached window)
- Blank page with guidance when no URL is loaded
- URL persistence across tab switches via `viewState`
- i18n support (en-US, zh-CN)

### Out of Scope

- Zoom control
- "Shared with agent" / AI integration
- Element inspector (future enhancement)
- Main process router (no IPC needed)

## Technical Decisions

### Webview vs WebContentsView

**Decision: `<webview>` tag.**

`WebContentsView` is a native view managed by the main process. It renders above all renderer DOM content, covering dropdowns, modals, and popovers. Solving this requires complex bounds synchronization (resize, tab switch, panel collapse) and z-index hacks.

`<webview>` is a renderer-side DOM element that participates in normal DOM stacking. It supports `openDevTools({ mode: 'detach' })` for independent DevTools windows. It's simpler to implement and avoids the layering problem entirely.

### Plugin-only Architecture

All browser logic lives inside the plugin directory. The only external change is enabling `webviewTag: true` in the main process `BrowserWindow` webPreferences.

## Architecture

### File Structure

```
src/renderer/src/plugins/browser/
  index.tsx              # RendererPlugin definition
  browser-view.tsx       # Main view: NavBar + webview container
  nav-bar.tsx            # Toolbar: back/forward/refresh + address bar + DevTools
  blank-page.tsx         # Empty state when no URL loaded
  locales/
    en-US.json
    zh-CN.json
```

### Plugin Registration

```typescript
// index.tsx
const plugin: RendererPlugin = {
  name: "plugin-browser",
  configI18n() {
    /* loader for locales */
  },
  configContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "browser",
          name: { "en-US": "Browser", "zh-CN": "浏览器" },
          singleton: false, // allow multiple browser tabs
          deactivation: "offscreen", // preserve webview state when tab inactive
          icon: GlobeIcon,
          component: () => import("./browser-view"),
        },
      ],
    };
  },
};
```

### State Management

| State                         | Storage                 | Reason                              |
| ----------------------------- | ----------------------- | ----------------------------------- |
| `url` (current page URL)      | `viewState` (persisted) | Restore on tab switch / app restart |
| `inputUrl` (address bar text) | local `useState`        | Transient editing state             |
| `isLoading`                   | local `useState`        | Derived from webview events         |
| `canGoBack` / `canGoForward`  | local `useState`        | Derived from webview navigation     |

### Webview Events

```
did-start-loading  -> setIsLoading(true)
did-stop-loading   -> setIsLoading(false)
did-navigate       -> update url in viewState, sync address bar
did-navigate-in-page -> update url for SPA hash/pushState navigation
```

### NavBar Layout

```
[<] [>] [refresh] [ ________________ address bar ________________ ] [DevTools]
```

- Back/Forward: disabled when no history or loading
- Refresh: spinning icon during load
- Address bar: on Enter, normalize URL (prepend `https://` if no protocol), navigate
- DevTools: calls `webview.openDevTools({ mode: 'detach' })`

### Blank Page

Shown when `url` is empty. Centered layout with globe icon, "Browser" title, and hint text ("Enter a URL to preview"). Clicking the address bar focuses it for input.

### Main Process Change

One line in `BrowserWindow` creation:

```typescript
webPreferences: {
  webviewTag: true, // enable <webview> for browser preview plugin
  // ... existing preferences
}
```

## Design Notes

- NavBar buttons use `variant="ghost" size="icon-xs"` consistent with existing toolbars
- Address bar: subtle `bg-muted/30` background, transparent on focus
- No decorative animations; only the refresh spinner serves a functional purpose
- Follows the project's quiet, minimal aesthetic — no extra chrome
