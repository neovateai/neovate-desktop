# Provider Check: Benchmark on Add Page + Single-Model Dropdown

## Summary

Replace `benchmarkModel` (requires saved provider) with `checkModel` (accepts raw credentials). This enables benchmarking on the provider add page without saving first, and unifies the check logic for both create and edit flows. Add a split button UI to support testing a single model via dropdown.

## Motivation

- Currently the test/benchmark button only appears on the edit form (provider must be saved first)
- No way to verify API key + model connectivity before saving a provider
- No way to test a single model — only "test all"

## API Change

### Replace `benchmarkModel` with `checkModel`

**Before:**

```
benchmarkModel({ providerId: string, modelId: string }) -> BenchmarkResult
```

**After:**

```
checkModel({ baseURL: string, apiKey: string, modelId: string }) -> BenchmarkResult
```

The backend no longer looks up a saved provider. The frontend always passes raw credentials from the form state, whether creating or editing.

## Files Changed

| File                                                                   | Change                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/features/provider/contract.ts`                                 | Replace `benchmarkModel` with `checkModel` (new input schema: `baseURL`, `apiKey`, `modelId`)                                                                                                |
| `main/features/provider/router.ts`                                     | Replace `benchmarkModel` handler — construct temp provider object from input, call `runBenchmark()`. Remove provider-exists/enabled checks (no longer relevant).                             |
| `renderer/src/features/provider/store.ts`                              | Replace `benchmarkModel(providerId, modelId)` with `checkModel(baseURL, apiKey, modelId)`. Replace `benchmarkAll` with `checkAll(baseURL, apiKey, modelIds)`. Key format: `baseURL:modelId`. |
| `renderer/src/features/provider/benchmark-button.tsx`                  | Accept `baseURL + apiKey` props instead of `providerId`. Add split button with dropdown for single-model test.                                                                               |
| `renderer/src/features/settings/components/panels/providers-panel.tsx` | Show benchmark button on both create and edit forms. Pass `baseURL` and `apiKey` from form state. Remove `onBeforeBenchmark` that saved models before testing.                               |

## Naming Convention

Only the RPC endpoint is renamed (`benchmarkModel` -> `checkModel`). All frontend component names stay as-is (`BenchmarkButton`, `BenchmarkMetrics`, `BenchmarkTooltipContent`, `benchmark-button.tsx`, etc.). The RPC rename is the meaningful change; component names are internal.

## Split Button UI

```
When 2+ models:
+----------------+-----+
|  (gauge) Test  |  v  |   <- main click = test all models
+----------------+-----+
                   |
                   v (dropdown)
           +----------------------------+
           | claude-sonnet-4  Sonnet    |
           | claude-haiku-4   Haiku     |
           | claude-opus-4    Opus      |
           +----------------------------+

When 1 model:
+----------------+
|  (gauge) Test  |   <- plain button, no chevron/dropdown
+----------------+

When running:
+----------------+
|  (stop) Stop   |   <- replaces entire button
+----------------+
```

## Design Decisions

### 1. Key format: `baseURL:modelId`

Use `baseURL:modelId` as the store key universally (instead of `providerId:modelId`). This is deterministic, works for both create and edit, and naturally invalidates results when the user changes the base URL.

### 2. Disable test when baseURL is invalid

Button enabled condition: `apiKey.trim() !== "" && modelKeys.length > 0 && isValidURL(baseURL)`. Prevents confusing network errors from invalid URLs.

### 3. Dropdown shows display name

Dropdown entries show `displayName` alongside model ID when available, matching the model list display.

### 4. Skip dropdown for single model

When only 1 model exists, render a plain button (no chevron, no dropdown). Split button only appears with 2+ models.

### 5. Clear previous result on re-test

When testing a single model, clear its previous result before starting so the user sees a spinner instead of stale data.

## What stays the same

- `runBenchmark()` function in router.ts — untouched
- `BenchmarkResult` type — untouched
- Benchmark result display (metrics badges, tooltips) — untouched
- `BenchmarkMetrics`, `BenchmarkTooltipContent` components — untouched
- `benchmark-utils.ts` color thresholds — untouched
