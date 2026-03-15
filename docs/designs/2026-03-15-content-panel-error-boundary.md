# Content Panel View Error Boundary

## Problem

Content panel views (terminal, review, git, etc.) crash the entire app when an error occurs. The most common trigger is HMR during development: when a view file is hot-updated, `ViewIdContext` (created by `createContext()` in `view-context.tsx`) can get a new object identity, causing a provider/consumer mismatch. `useContentPanelViewContext` throws, React has no error boundary to catch it, and the whole renderer crashes and reloads.

Observed in `/tmp/dev.log`:

```
[renderer:error] Uncaught Error: useContentPanelViewContext must be used within ContentPanelViewContextProvider
[renderer:warning] An error occurred in the <ReviewView> component.
```

## Solution

Wrap each content panel view in the existing `ErrorBoundary` component (`components/ui/error-boundary.tsx`), placed **outside** the `Suspense` and `ContentPanelViewContextProvider` so it catches both context failures and view-level errors.

## Change

**File**: `packages/desktop/src/renderer/src/features/content-panel/components/content-panel.tsx`

Add `ErrorBoundary` import and wrap each tab's subtree:

Before:

```tsx
<TabViewWithActivity key={tab.id} isActive={...} deactivation={...}>
  <Suspense>
    <ContentPanelViewContextProvider viewId={tab.id}>
      <LazyComponent />
    </ContentPanelViewContextProvider>
  </Suspense>
</TabViewWithActivity>
```

After:

```tsx
<TabViewWithActivity key={tab.id} isActive={...} deactivation={...}>
  <ErrorBoundary
    fallback={(error, reset) => (
      <ViewErrorFallback
        error={error}
        onRetry={reset}
        onClose={() => contentPanel.closeView(tab.id)}
      />
    )}
  >
    <Suspense>
      <ContentPanelViewContextProvider viewId={tab.id}>
        <LazyComponent />
      </ContentPanelViewContextProvider>
    </Suspense>
  </ErrorBoundary>
</TabViewWithActivity>
```

`ViewErrorFallback` is a small local component in the same file:

```tsx
function ViewErrorFallback({
  error,
  onRetry,
  onClose,
}: {
  error: Error;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium text-destructive">Something went wrong</p>
      <pre className="max-w-md overflow-auto rounded-md bg-muted px-4 py-3 text-left text-xs text-muted-foreground">
        {error.message}
      </pre>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
        >
          Try Again
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
        >
          Close Tab
        </button>
      </div>
    </div>
  );
}
```

## Behavior

- When any content panel view crashes, the affected tab shows the error message with two actions:
  - **Try Again** - resets the error state and re-mounts the provider + lazy component (recovers from transient HMR issues)
  - **Close Tab** - dismisses the broken tab (escape hatch for persistent errors)
- Other tabs remain unaffected.
- `useContentPanelViewContext` keeps its throw behavior (correct for catching real bugs during development).

## Scope

- 1 file changed (`content-panel.tsx`): add `ErrorBoundary` import, `ViewErrorFallback` component, and wrapper element
- No API contract changes
- Existing tests pass unchanged
