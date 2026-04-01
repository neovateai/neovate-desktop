# Customizable Feedback URL

**Date:** 2026-04-01  
**Status:** Ready for planning

## What We're Building

Allow enterprise deployments to override the feedback button URL in the Settings → About panel. Currently the URL is hardcoded to the public GitHub issues page. Enterprise versions embed this repo as a submodule and need to point users to their internal issue tracker instead.

Scope: URL replacement only. No UI structure changes, no custom button injection.

## Context

- Feedback button lives in `about-panel.tsx:67–69`, opens a hardcoded GitHub URL
- Enterprise uses this repo as a submodule and instantiates `RendererApp` with their own config
- `RendererApp` already accepts a constructor `options` object (including `plugins`)

## Approaches Considered

### A. Plugin `configContributions` (rejected)

Add `appOverrides` as a plugin contribution type. Enterprise plugin declares `feedbackUrl` in `configContributions()`.

**Why rejected:** Plugin system is designed for registering new capabilities (provider templates, sidebar views, URI handlers), not for overriding static config values. This approach requires a first-write-wins conflict resolution rule and adds unnecessary indirection for what is fundamentally a deployment-time constant.

### B. `RendererApp` constructor option (chosen)

Add `vendor?: { feedbackUrl?: string }` to `RendererApp` options. Enterprise passes it at instantiation time alongside their plugins.

**Why chosen:**

- Semantically correct: "vendor" clearly distinguishes deployer-injected config from user preferences (`AppConfig`)
- Single unambiguous source — one constructor call, no conflict resolution needed
- Enterprise already owns the `RendererApp` instantiation point
- Scales cleanly: adding `docsUrl`, `supportEmail`, etc. is additive with no new machinery

## Key Decisions

| Decision                  | Choice                            | Reason                                                                                           |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Where to put the override | `RendererApp` constructor options | Static deployment config belongs at the instantiation boundary, not in the plugin behavior layer |
| Conflict resolution       | N/A                               | Only one `RendererApp` instance, no conflict possible                                            |
| Fallback                  | Default to public GitHub URL      | Open-source users get the existing experience unchanged                                          |
| UI changes                | None                              | Only the URL changes; button text, placement, and structure stay the same                        |
| Future overrides          | Extend `appOverrides` object      | `docsUrl`, `supportEmail`, etc. all go in the same place                                         |

## Design

```typescript
// RendererApp options (new field)
interface RendererAppOptions {
  plugins?: RendererPlugin[];
  vendor?: {
    feedbackUrl?: string;
  };
}

// Enterprise instantiation
new RendererApp({
  plugins: [EnterprisePlugin],
  vendor: {
    feedbackUrl: "https://jira.example.com/projects/SUPPORT",
  },
});

// AboutPanel reads it
const DEFAULT_FEEDBACK_URL = "https://github.com/neovateai/neovate-desktop/issues";
const { feedbackUrl } = useRendererApp().vendor ?? {};

const handleSendFeedback = () => {
  window.open(feedbackUrl ?? DEFAULT_FEEDBACK_URL, "_blank");
};
```

## Files to Change

| File                                                                   | Change                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/renderer/src/core/app.tsx`                                        | Add `appOverrides` to options type and store on instance         |
| `src/renderer/src/features/settings/components/panels/about-panel.tsx` | Read `feedbackUrl` from `useRendererApp()`, fall back to default |

## Open Questions

- Should `appOverrides` be typed in `src/shared/` for potential reuse in main process config? Likely no — this is renderer-only vendor config, not user config.
- Should the feedback row be hidden entirely when `feedbackUrl` is not set and the app is an enterprise build? Out of scope for now; URL replacement is sufficient.
