# Model Benchmark Feature Design

## Overview

Add benchmark testing functionality to Provider settings for measuring model performance metrics:

- **TTFT (Time To First Token)** - Latency to first response token
- **TPOT (Time Per Output Token)** - Average time per generated token
- **TPS (Tokens Per Second)** - Throughput rate (calculated as `1000 / TPOT`)

## Architecture

### Data Flow

```
UI (BenchmarkButton)
  ↓ onClick
  ↓ onBeforeBenchmark (auto-save provider)
  ↓
Store (benchmarkModel action)
  ↓ RPC call
Backend (runBenchmark)
  ↓ Anthropic SDK streaming
Collect timing metrics
  ↓ Return BenchmarkResult
  ↓
Store (update benchmarkResults)
  ↓
UI (display TTFT/TPOT/TPS badges)
```

## Implementation

### 1. Types (`shared/features/provider/types.ts`)

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

### 2. Backend Calculation (`main/features/provider/router.ts`)

The benchmark uses Anthropic SDK streaming to collect precise timing:

```typescript
async function runBenchmark(provider: Provider, modelId: string): Promise<BenchmarkResult> {
  const startTime = performance.now();
  let firstTokenTime: number | null = null;
  const tpotValues: number[] = [];
  let lastTokenTime: number | null = null;

  // Stream via Anthropic SDK
  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      const now = performance.now();

      // Record TTFT
      if (firstTokenTime === null) {
        firstTokenTime = now;
      }

      // Record TPOT for each subsequent token
      if (lastTokenTime !== null) {
        tpotValues.push(now - lastTokenTime);
      }
      lastTokenTime = now;
    }
  }

  // Calculate metrics following ModelService logic
  const tpot = calculateAvg(tpotValues) ?? 0;
  const tps = tpot > 0 ? 1000 / tpot : 0;

  return { ttftMs, tpot, tps, ... };
}
```

Key design decisions:

- **TPOT**: Average of inter-token intervals from streaming events
- **TPS**: Derived from TPOT using `1000 / tpot` (consistent with ModelService)
- **calculateAvg**: Filters out zero values (handles vector(0) fallback)

### 3. Frontend Components

#### BenchmarkButton (`renderer/features/provider/benchmark-button.tsx`)

Reusable button component with:

- `onBeforeBenchmark` callback for pre-test actions (auto-save)
- Loading state indicator
- Disabled state when no models available

```typescript
interface BenchmarkButtonProps {
  providerId: string;
  modelIds: string[];
  onBeforeBenchmark?: () => Promise<void>; // Auto-save before test
  onComplete?: () => void;
}
```

#### BenchmarkMetrics (`renderer/features/provider/benchmark-metrics.tsx`)

Unified display component for three metrics with color-coded badges:

```typescript
interface BenchmarkMetricsProps {
  ttftMs: number;
  tpot: number;
  tps: number;
  size?: "sm" | "md";
}
```

Color coding rules (from `benchmark-utils.ts`):

- **TTFT**: Green (<500ms) → Yellow (<2000ms) → Red (>5000ms)
- **TPOT**: Green (<20ms) → Yellow (<60ms) → Red (>100ms)
- **TPS**: Green (>100) → Yellow (>20) → Red (<5)

### 4. Provider Panel Integration

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

## Usage Flow

1. **Create Provider**: Add provider with models → Save → Test (all models testable)
2. **Edit Provider**: Add new model → Test (auto-saves then tests)
3. **View Results**: Hover test button to see tooltip with all metrics
4. **Batch Test**: Single button tests all models in parallel

## Files Modified

| File                                               | Changes                                |
| -------------------------------------------------- | -------------------------------------- |
| `shared/features/provider/types.ts`                | Add `tpot` to `BenchmarkResult`        |
| `shared/features/provider/contract.ts`             | Add `tpot` to schema                   |
| `main/features/provider/router.ts`                 | TPOT/TPS calculation logic             |
| `renderer/features/provider/benchmark-button.tsx`  | `onBeforeBenchmark` callback           |
| `renderer/features/provider/benchmark-metrics.tsx` | New component (TTFT/TPOT/TPS)          |
| `renderer/features/provider/benchmark-tooltip.tsx` | Add TPOT display                       |
| `renderer/features/provider/benchmark-utils.ts`    | TPOT color/formatting                  |
| `renderer/features/provider/store.ts`              | `clearProviderBenchmarkResults` action |
| `renderer/.../providers-panel.tsx`                 | Auto-save integration                  |
| `locales/en-US.json` / `zh-CN.json`                | i18n strings                           |
