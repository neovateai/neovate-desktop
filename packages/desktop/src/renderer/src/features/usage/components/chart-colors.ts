/**
 * Chart color palette for usage statistics
 * These are direct hex colors because ECharts doesn't support CSS custom properties
 */
export const CHART_COLORS = {
  // Primary chart colors
  chart1: "#10b981", // emerald-500 - primary success/positive
  chart2: "#3b82f6", // blue-500 - secondary
  chart3: "#8b5cf6", // violet-500 - tertiary
  chart4: "#f59e0b", // amber-500 - quaternary
  chart5: "#ef4444", // red-500 - error/warning

  // Semantic colors
  success: "#10b981",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",

  // Muted colors for backgrounds
  muted: "#e5e7eb",
  border: "#e5e7eb",
} as const;

/**
 * Heatmap gradient colors (from less to more activity)
 */
export const HEATMAP_COLORS = [
  "#e5e7eb", // muted gray
  "#a7f3d0", // emerald-200
  "#6ee7b7", // emerald-300
  "#34d399", // emerald-400
  "#10b981", // emerald-500
] as const;
