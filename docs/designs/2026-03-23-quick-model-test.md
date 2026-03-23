# Quick Model Test for Provider Settings

## Problem

The current "Test" button runs a full benchmark (streams 100 tokens, measures TTFT/TPOT/TPS). This takes several seconds per model — too slow when you just want to verify your API key and models are configured correctly.

## Solution

Add a **quick connectivity check** alongside the existing benchmark. The default "Test" click does a fast check (~200-500ms per model). The full benchmark is still accessible via the dropdown menu.

## Contract Change

New `quickCheck` endpoint in `providerContract`:

```ts
quickCheck: oc
  .input(z.object({
    baseURL: z.string().url(),
    apiKey: z.string().min(1),
    modelId: z.string(),
  }))
  .output(z.object({
    success: z.boolean(),
    error: z.string().optional(),
  })),
```

## Backend (`router.ts`)

New `quickCheck` handler:

- Creates an Anthropic client with the given baseURL/apiKey
- Sends a non-streaming `messages.create` with `max_tokens: 1` and a minimal prompt (e.g. `"hi"`)
- 10s timeout (vs 30s for benchmark)
- Returns `{ success: true }` or `{ success: false, error: "401 — invalid_api_key" }`
- Same error formatting as the existing benchmark error handler

## Types (`types.ts`)

No standalone `QuickCheckResult` type — the contract zod schema defines the wire format, and the store maps it directly to the unified `ModelTestResult` (see below).

## Types (`types.ts`) — Unified Result

Replace separate result types with a single discriminated union:

```ts
export type ModelTestResult =
  | { type: "quick"; success: boolean; error?: string }
  | {
      type: "benchmark";
      success: boolean;
      error?: string;
      ttftMs: number;
      tpot: number;
      tps: number;
      totalTimeMs: number;
      tokensGenerated: number;
    };
```

The existing `BenchmarkResult` type is removed in favor of `ModelTestResult`.

## Store (`store.ts`)

Unified state (replaces separate `benchmarkResults` / `benchmarkingModels`):

- `modelTestResults: Record<string, ModelTestResult>` — keyed by `baseURL:modelId`
- `testingModels: Record<string, boolean>` — loading state per model

New/changed actions:

- `quickCheckAll(baseURL, apiKey, modelIds)` — **parallel** check of all models via `Promise.all` (fast, ~500ms for 5 models)
- `checkAll(baseURL, apiKey, modelIds)` — unchanged (sequential benchmark, streams tokens)
- `clearTestResults(baseURL)` — replaces `clearBenchmarkResults`
- `cancelTests()` — replaces `cancelBenchmarks`

Quick check results and benchmark results share the same map. Running a full benchmark on a model overwrites its previous quick check result.

## UI Changes (`benchmark-button.tsx`)

The `BenchmarkButton` component changes behavior:

1. **Default click** (main button) -> calls `quickCheckAll` instead of `checkAll`
2. **Dropdown menu** gains a new structure:
   - "Full Benchmark" (all models) — calls existing `checkAll`
   - Per-model items like "Test: model-a" — calls `quickCheckAll` for single model
3. Single-model providers always show the split button (dropdown with "Full Benchmark") so users can access the full benchmark regardless of model count.

## UI Changes (`providers-panel.tsx`)

Per-model row display:

- **Quick check running**: spinner (same as now)
- **Quick check success**: green `Check` icon (lucide)
- **Quick check failure**: red error badge + error text (same as current benchmark failure)
- **Benchmark results**: same TTFT/TPOT/TPS badges as today (shown when a full benchmark completes, overrides the quick check display)

Both result types live in a single `modelTestResults` map — a benchmark result naturally supersedes a quick check result since they share the same `baseURL:modelId` key.

## Key Design Decision: Parallel Quick Checks

Quick checks use `Promise.all` instead of sequential execution. Since each check is a single non-streaming request (`max_tokens: 1`), there's no reason to serialize them. This means testing 5 models completes in ~500ms (one round-trip) rather than ~2.5s (five sequential round-trips).

Full benchmarks remain sequential because they stream tokens and measuring TPOT/TPS accurately requires dedicated bandwidth.

## Files Changed

| File                                                                       | Change                                                                                                                                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/features/provider/contract.ts`                                 | Add `quickCheck` endpoint                                                                                                                                                   |
| `src/shared/features/provider/types.ts`                                    | Add `ModelTestResult` union, remove `BenchmarkResult`                                                                                                                       |
| `src/main/features/provider/router.ts`                                     | Add `quickCheck` handler (non-streaming, `max_tokens: 1`)                                                                                                                   |
| `src/renderer/src/features/provider/store.ts`                              | Replace `benchmarkResults`/`benchmarkingModels` with unified `modelTestResults`/`testingModels`; add parallel `quickCheckAll`; update `checkAll` to write `ModelTestResult` |
| `src/renderer/src/features/provider/benchmark-button.tsx`                  | Default click -> quick check; dropdown adds "Full Benchmark"                                                                                                                |
| `src/renderer/src/features/provider/benchmark-metrics.tsx`                 | Accept `ModelTestResult` instead of `BenchmarkResult`                                                                                                                       |
| `src/renderer/src/features/provider/benchmark-tooltip.tsx`                 | Accept `ModelTestResult` instead of `BenchmarkResult`                                                                                                                       |
| `src/renderer/src/features/settings/components/panels/providers-panel.tsx` | Show quick check results (check icon / error) per model row; read from unified `modelTestResults`                                                                           |

No new files needed. New i18n keys: `settings.providers.benchmark.quickTest` and `settings.providers.benchmark.fullBenchmark` for the dropdown labels.
