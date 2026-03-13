# Model Benchmark Feature Design

## Overview

Add benchmark testing functionality to Provider settings for measuring model performance metrics:

- **TTFT (Time To First Token)** - Latency to first response token
- **TPOT (Time Per Output Token)** - Average time per generated token
- **TPS (Tokens Per Second)** - Throughput rate (calculated as `1000 / TPOT`)

> **Scope**: Only providers using the **Anthropic Messages API** format are supported for benchmarking. Providers with incompatible API formats should have the benchmark button disabled.

## Architecture

### Data Flow

```
UI (BenchmarkButton: Test / Cancel toggle)
  | onClick Test
  | onBeforeBenchmark (auto-save provider)
  |
Store (benchmarkAll -> sequential benchmarkModel calls)
  | creates AbortController (module-level, outside Immer)
  | passes signal to each RPC call
  |
Backend (runBenchmark)
  | combines external signal (client cancel) + internal timeout
  | createBenchmarkClient(provider) -> Anthropic SDK streaming
  | AbortController -> signal forwarded to SDK stream
Collect timing metrics
  | Return BenchmarkResult
  |
Store (update benchmarkResults per model)
  |
UI (display TTFT/TPOT/TPS badges per model row)
  | on error: display error badge with message

Cancel path (user clicks Cancel, or leaves settings page):
  Store.cancelBenchmarks()
    | aborts the AbortController
    | clears benchmarkingModels
    | in-flight RPC receives abort -> backend aborts SDK stream
    | loop breaks (signal.aborted check between models)
    | partial results (already completed models) are kept
```

### Provider Compatibility

Only the Anthropic Messages API format is currently supported. To make this explicit:

1. Add `apiFormat` field to `BuiltInProvider`:

```typescript
export type BuiltInProvider = {
  // ... existing fields
  apiFormat?: "anthropic"; // only "anthropic" supported; omit = assume anthropic
};
```

2. The UI disables the benchmark button when a provider's `apiFormat` is unrecognized or when the provider has no models.

3. Future formats (e.g. `"openai"`) can be added later without changing the contract.

## Implementation

### 1. Types (`packages/desktop/src/shared/features/provider/types.ts`)

```typescript
export type BenchmarkResult = {
  ttftMs: number; // Time To First Token in milliseconds
  tpot: number; // Time Per Output Token in milliseconds
  tps: number; // Tokens Per Second (1000 / tpot)
  totalTimeMs: number; // Total response time in milliseconds
  tokensGenerated: number;
  success: boolean;
  error?: string;
};
```

### 2. Backend Calculation (`packages/desktop/src/main/features/provider/router.ts`)

#### Benchmark Client Abstraction

Wrap SDK construction so `envOverrides` and future provider formats are handled in one place:

```typescript
function createBenchmarkClient(provider: Provider): Anthropic {
  // Apply envOverrides to process.env for the duration of the request if needed
  return new Anthropic({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
  });
}
```

#### Benchmark Prompt

The prompt must reliably generate enough output tokens (50-80) to produce meaningful TPOT samples. A prompt that only produces a few tokens gives too few inter-token intervals for a stable average.

```typescript
const BENCHMARK_PROMPT =
  "Write a short paragraph explaining what a benchmark test measures in software engineering.";
const BENCHMARK_MAX_TOKENS = 100;
```

A short factual question like this works well: models consistently produce 50-80 tokens, giving 40+ TPOT data points per run.

#### Stream Timing with Cancellation

Use `AbortController` to properly cancel the HTTP request on timeout (instead of leaving the stream running):

The backend accepts an optional `externalSignal` from the ORPC handler (forwarded from the client's `AbortController`). It combines this with the internal timeout into a single `AbortController` that is passed to the Anthropic SDK stream:

```typescript
async function runBenchmark(
  provider: Provider,
  modelId: string,
  externalSignal?: AbortSignal,
): Promise<BenchmarkResult> {
  const startTime = performance.now();
  let firstTokenTime: number | null = null;
  const tpotValues: number[] = [];
  let lastTokenTime: number | null = null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BENCHMARK_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);

  try {
    const client = createBenchmarkClient(provider);
    const stream = client.messages.stream(
      {
        model: modelId,
        max_tokens: BENCHMARK_MAX_TOKENS,
        messages: [{ role: "user", content: BENCHMARK_PROMPT }],
      },
      { signal: controller.signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        const now = performance.now();

        if (firstTokenTime === null) {
          firstTokenTime = now;
        }

        if (lastTokenTime !== null) {
          tpotValues.push(now - lastTokenTime);
        }
        lastTokenTime = now;
      }
    }

    // Prefer usage.output_tokens from the final message for accurate count
    const finalMessage = await stream.finalMessage();
    const tokensGenerated = finalMessage.usage?.output_tokens ?? tpotValues.length + 1;

    const tpot = calculateAvg(tpotValues) ?? 0;
    const tps = tpot > 0 ? 1000 / tpot : 0;

    return { ttftMs, tpot, tps, totalTimeMs, tokensGenerated, success: true };
  } catch (err) {
    return {
      ttftMs: 0,
      tpot: 0,
      tps: 0,
      totalTimeMs: 0,
      tokensGenerated: 0,
      success: false,
      error: String(err),
    };
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}
```

The RPC handler passes the ORPC signal through:

```typescript
benchmarkModel: handler(async ({ input, context, signal }) => {
  // ... validation ...
  return runBenchmark(provider, modelId, signal);
}),
```

Key design decisions:

- **TPOT**: Average of inter-token intervals from streaming events. Note: this is _observed_ TPOT (includes network jitter), not pure model generation time.
- **TPS**: Derived from TPOT using `1000 / tpot` (consistent with ModelService)
- **Token count**: Uses `usage.output_tokens` from the API response when available, falling back to delta event count.
- **calculateAvg**: Filters out zero values (handles vector(0) fallback)
- **AbortController**: Actually cancels the HTTP request on timeout, rather than leaving an orphaned stream.
- **Signal chaining**: External signal (client cancel) and internal timeout are combined into one controller via `addEventListener("abort", ...)`, so either trigger aborts the stream.

### 3. Frontend Components

#### BenchmarkButton (`packages/desktop/src/renderer/src/features/provider/benchmark-button.tsx`)

Toggle button that switches between Test and Cancel states:

- **Idle**: Shows gauge icon + "Test" label. Calls `onBeforeBenchmark` then `benchmarkAll`.
- **Running**: Switches to `destructive-outline` variant with stop icon + "Cancel" label. Calls `cancelBenchmarks()`.
- Disabled when no models available (idle state only).

```typescript
interface BenchmarkButtonProps {
  providerId: string;
  modelIds: string[];
  onBeforeBenchmark?: () => Promise<void>; // Auto-save before test
  onComplete?: () => void;
  disabled?: boolean; // Also disable externally
}
```

#### BenchmarkMetrics (`packages/desktop/src/renderer/src/features/provider/benchmark-metrics.tsx`)

Unified display component for three metrics with color-coded badges:

```typescript
interface BenchmarkMetricsProps {
  ttftMs: number;
  tpot: number;
  tps: number;
  size?: "sm" | "md";
}
```

Color coding rules (from `benchmark-utils.ts`), continuous 3-tier waterfall:

- **TTFT**: Green (<500ms) | Red (>2000ms) | Yellow (otherwise)
- **TPOT**: Green (<20ms) | Red (>60ms) | Yellow (otherwise)
- **TPS**: Green (>100) | Red (<20) | Yellow (otherwise)

#### Error Display

When `BenchmarkResult.success === false`:

- The model row shows a red error badge with a truncated error message
- Hovering the badge shows the full error in a tooltip
- The error clears on the next benchmark run or mode switch

### 4. Store (`packages/desktop/src/renderer/src/features/provider/store.ts`)

#### Benchmark State

Use `Record<string, boolean>` for tracking in-flight benchmarks — **not `Set<string>`**. Zustand + Immer can proxy `Set`, but React's shallow equality check on selectors won't reliably detect `.add()` / `.delete()` mutations, causing components to miss re-renders.

```typescript
type ProviderState = {
  // ...
  benchmarkResults: Record<string, BenchmarkResult>; // key: `${providerId}:${modelId}`
  benchmarkingModels: Record<string, boolean>; // key: `${providerId}:${modelId}` -> true while running
};
```

#### Cancellation

The `AbortController` is stored as a **module-level variable** outside Immer state. Immer proxies all state objects, but `AbortController` is not proxy-safe (calling `.abort()` on a proxy throws). Keeping it outside avoids this entirely.

```typescript
// Module-level, outside Immer
let benchmarkController: AbortController | null = null;
```

```typescript
benchmarkModel: async (providerId, modelId, signal?) => {
  const key = `${providerId}:${modelId}`;
  if (get().benchmarkingModels[key]) return get().benchmarkResults[key];

  set((state) => { state.benchmarkingModels[key] = true; });
  try {
    const result = await client.provider.benchmarkModel(
      { providerId, modelId },
      ...(signal ? [{ signal }] : []),
    );
    set((state) => { state.benchmarkResults[key] = result; });
    return result;
  } finally {
    set((state) => { delete state.benchmarkingModels[key]; });
  }
},
```

#### Batch Benchmark with Sequential Execution

Run models sequentially to avoid provider rate limits. A single `AbortController` governs the entire batch — only one model is in-flight at a time, and the loop checks `signal.aborted` before starting the next.

```typescript
benchmarkAll: async (providerId, modelIds) => {
  benchmarkController?.abort();
  const controller = new AbortController();
  benchmarkController = controller;

  try {
    for (const modelId of modelIds) {
      if (controller.signal.aborted) break;
      await get().benchmarkModel(providerId, modelId, controller.signal);
    }
  } finally {
    if (benchmarkController === controller) benchmarkController = null;
  }
},

cancelBenchmarks: () => {
  if (benchmarkController) {
    benchmarkController.abort();
    benchmarkController = null;
    set((state) => { state.benchmarkingModels = {}; });
  }
},
```

Each model's result updates the store immediately on completion, so the UI updates progressively. On cancel, partial results (already completed models) are kept.

### 5. Provider Panel Integration

#### Batch Progress

When benchmarking multiple models, show progress per-model rather than a single spinner. Since results arrive sequentially into the store, each model row transitions from "waiting" -> "running" -> "done/error" individually. No explicit counter is needed — the per-row state is the progress indicator:

- No entry in `benchmarkingModels` or `benchmarkResults`: idle (dimmed benchmark icon)
- Key in `benchmarkingModels`: spinner on that model row
- Key in `benchmarkResults` with `success: true`: show metrics badges
- Key in `benchmarkResults` with `success: false`: show error badge

#### Auto-Save Before Test

In `providers-panel.tsx`, the `onBeforeBenchmark` callback updates the provider with current form models:

```typescript
<BenchmarkButton
  providerId={editingId}
  modelIds={testableModelIds}
  onBeforeBenchmark={async () => {
    if (editingId) {
      await updateProvider(editingId, {
        models: form.models,
        modelMap: form.modelMap,
      });
    }
  }}
/>
```

This allows testing newly added models before explicit save.

#### Clear Results on Mode Switch

Benchmark results are cleared when entering create/edit mode to ensure fresh test data:

```typescript
const startCreate = useCallback(() => {
  // ...
  useProviderStore.setState((state) => {
    state.benchmarkResults = {}; // Clear all results
  });
}, []);

const startEdit = useCallback(
  (p: Provider) => {
    clearProviderBenchmarkResults(p.id); // Clear this provider's results
    // ...
  },
  [clearProviderBenchmarkResults],
);
```

#### Auto-Cancel on Unmount

`ProvidersPanel` calls `cancelBenchmarks()` in a `useEffect` cleanup. This fires when:

- User closes the settings page (`showSettings = false` unmounts `SettingsPage`)
- User switches to a different settings tab (conditional render unmounts `ProvidersPanel`)

```typescript
useEffect(() => {
  return () => cancelBenchmarks();
}, [cancelBenchmarks]);
```

#### Delete Confirmation

Provider deletion uses an `AlertDialog` to prevent accidental data loss:

```typescript
<AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
  <AlertDialogPopup>
    <AlertDialogHeader>
      <AlertDialogTitle>{t("settings.providers.deleteTitle")}</AlertDialogTitle>
      <AlertDialogDescription>{t("settings.providers.deleteDescription")}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogClose>{t("settings.providers.cancel")}</AlertDialogClose>
      <Button variant="destructive" onClick={handleConfirmDelete}>
        {t("settings.providers.delete")}
      </Button>
    </AlertDialogFooter>
  </AlertDialogPopup>
</AlertDialog>
```

## Key Design Decisions

### 1. Why TPOT + TPS instead of raw token count?

Following the reference ModelService implementation:

- **TPOT** directly measures per-token latency
- **TPS** calculated as `1000 / TPOT` provides normalized throughput metric
- More accurate than `tokens / totalTime` which includes TTFT overhead

### 2. Why auto-save before benchmark?

Backend validates that model exists in provider's model list. To test newly added models:

- Option A: Disable test until explicit save (poor UX)
- Option B: Auto-save before test (chosen)
- Option C: Separate temporary test endpoint (overly complex)

### 3. Why clear results on mode switch?

Benchmark data should be transient:

- Prevents confusion between old and new test runs
- Ensures user sees current environment's performance
- Avoids displaying stale data for modified providers

### 4. Why AbortController instead of Promise.race?

`Promise.race` with a timeout only ignores the stream result — the underlying HTTP connection keeps running, wasting bandwidth and server resources. `AbortController` actually cancels the request.

### 5. Why only Anthropic API format?

All current providers are Anthropic-compatible or proxied through Anthropic-compatible endpoints. Adding OpenAI-compatible streaming is deferred until a concrete need arises (YAGNI). The `apiFormat` field on `BuiltInProvider` provides the extension point without over-engineering.

### 6. Observed TPOT vs Model TPOT

The measured TPOT includes network latency between streaming chunks, not just model generation time. This is the user-perceived performance, which is what matters for a client-side benchmark. The design intentionally does not attempt to subtract network overhead.

### 7. Why sequential batch instead of parallel?

Most providers enforce concurrent request limits (2-5 streams). Firing 7 models in parallel causes rate-limit errors for multi-model providers like OpenRouter. Sequential execution is simpler, avoids failures, and gives clear per-model progress. The total wait is acceptable — benchmarks are not latency-critical UI.

### 8. Why `Record` instead of `Set` for benchmarkingModels?

Zustand + Immer can proxy `Set`, but React's shallow selector comparison (`useStore(s => s.benchmarkingModels)`) doesn't reliably detect `Set.add()` / `Set.delete()` as state changes. `Record<string, boolean>` works correctly with Immer's structural sharing and React's equality checks.

### 9. Why a longer benchmark prompt?

A 5-word response gives 3-4 TPOT samples — too few for a stable average. A prompt that reliably produces 50-80 tokens gives 40+ data points, making the TPOT average meaningful and less sensitive to individual network jitter spikes.

### 10. Why one AbortController per batch, not per model?

Sequential execution means only one model is in-flight at a time. A single controller aborts the current request and the loop checks `signal.aborted` before starting the next. Simpler than tracking N controllers.

### 11. Why keep partial results on cancel?

Models that already completed have valid data. Throwing them away wastes the time the user already waited. Only the in-flight request is aborted — its result is discarded. Completed results stay in `benchmarkResults`.

### 12. Why store AbortController outside Immer?

Immer proxies all state objects. `AbortController` is a browser API with internal slots — calling `.abort()` on an Immer proxy throws. Storing it as a module-level variable avoids this entirely while keeping the rest of the state Immer-managed.

## Usage Flow

1. **Create Provider**: Add provider with models -> Save -> Test (all models testable)
2. **Edit Provider**: Add new model -> Test (auto-saves then tests)
3. **View Results**: Metrics displayed as color-coded badges per model row
4. **Error Handling**: Failed benchmarks show red error badge with tooltip
5. **Batch Test**: Single button tests all models sequentially; each row updates as its result arrives
6. **Cancel Test**: Button toggles to "Cancel" while running; click to abort in-flight request and stop batch
7. **Auto-Cancel**: Leaving the providers panel (close settings or switch tab) automatically cancels any in-flight benchmarks
8. **Partial Results**: Cancelled benchmarks keep results from already-completed models

## Files Modified

| File                                                                                        | Changes                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `packages/desktop/src/shared/features/provider/types.ts`                                    | Add `BenchmarkResult` type                              |
| `packages/desktop/src/shared/features/provider/contract.ts`                                 | Add `benchmarkModel` RPC contract                       |
| `packages/desktop/src/shared/features/provider/built-in.ts`                                 | Add `apiFormat` field                                   |
| `packages/desktop/src/main/features/provider/router.ts`                                     | Benchmark calculation + RPC handler                     |
| `packages/desktop/src/renderer/src/features/provider/benchmark-button.tsx`                  | New: trigger component                                  |
| `packages/desktop/src/renderer/src/features/provider/benchmark-metrics.tsx`                 | New: TTFT/TPOT/TPS badge display                        |
| `packages/desktop/src/renderer/src/features/provider/benchmark-tooltip.tsx`                 | New: hover detail tooltip                               |
| `packages/desktop/src/renderer/src/features/provider/benchmark-utils.ts`                    | New: color/formatting helpers                           |
| `packages/desktop/src/renderer/src/features/provider/store.ts`                              | Add benchmark state + actions                           |
| `packages/desktop/src/renderer/src/features/settings/components/panels/providers-panel.tsx` | Auto-save, clear, delete confirm, benchmark integration |
| `packages/desktop/src/renderer/src/locales/en-US.json`                                      | i18n strings                                            |
| `packages/desktop/src/renderer/src/locales/zh-CN.json`                                      | i18n strings                                            |
