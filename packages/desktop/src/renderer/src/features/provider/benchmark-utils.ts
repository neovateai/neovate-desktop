/**
 * Benchmark utility functions for performance metrics display
 * Inspired by the Rust CLI color coding implementation
 */

/**
 * Get Tailwind color class for TTFT (Time To First Token)
 * Lower is better
 */
export function getTtftColorClass(ms: number): string {
  if (ms < 500) return "bg-green-600 text-white";
  if (ms < 1000) return "bg-green-400 text-green-950";
  if (ms < 2000) return "bg-yellow-400 text-yellow-950";
  if (ms < 3000) return "bg-orange-400 text-orange-950";
  if (ms < 5000) return "bg-red-500 text-white";
  return "bg-red-700 text-white";
}

/**
 * Get Tailwind color class for TPOT (Time Per Output Token)
 * Lower is better
 */
export function getTpotColorClass(ms: number): string {
  if (ms < 20) return "bg-green-600 text-white";
  if (ms < 40) return "bg-green-400 text-green-950";
  if (ms < 60) return "bg-yellow-400 text-yellow-950";
  if (ms < 80) return "bg-orange-400 text-orange-950";
  if (ms < 100) return "bg-red-500 text-white";
  return "bg-red-700 text-white";
}

/**
 * Get Tailwind color class for TPS (Tokens Per Second)
 * Higher is better
 */
export function getTpsColorClass(tps: number): string {
  if (tps >= 100) return "bg-green-600 text-white";
  if (tps >= 50) return "bg-green-400 text-green-950";
  if (tps >= 20) return "bg-yellow-400 text-yellow-950";
  if (tps >= 10) return "bg-orange-400 text-orange-950";
  if (tps >= 5) return "bg-red-500 text-white";
  return "bg-red-700 text-white";
}

/**
 * Get performance rating label for TTFT
 */
export function getTtftRating(ms: number): string {
  if (ms < 500) return "Excellent";
  if (ms < 1000) return "Good";
  if (ms < 2000) return "Fair";
  if (ms < 3000) return "Slow";
  if (ms < 5000) return "Very Slow";
  return "Extremely Slow";
}

/**
 * Get performance rating label for TPS
 */
export function getTpsRating(tps: number): string {
  if (tps >= 100) return "Excellent";
  if (tps >= 50) return "Good";
  if (tps >= 20) return "Fair";
  if (tps >= 10) return "Slow";
  if (tps >= 5) return "Very Slow";
  return "Extremely Slow";
}

/**
 * Format milliseconds to human-readable string
 */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Format TPOT to human-readable string
 */
export function formatTpot(ms: number): string {
  return `${ms.toFixed(1)}ms/t`;
}

/**
 * Format TPS to human-readable string
 */
export function formatTps(tps: number): string {
  return `${tps.toFixed(1)}t/s`;
}
