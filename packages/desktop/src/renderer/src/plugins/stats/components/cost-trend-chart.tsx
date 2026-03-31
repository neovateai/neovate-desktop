import { useTranslation } from "react-i18next";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { CostDataPoint } from "../../../../../shared/features/stats/types";

type CostTrendChartProps = {
  data: CostDataPoint[];
};

const MONTH_KEYS = [
  "stats.month.jan",
  "stats.month.feb",
  "stats.month.mar",
  "stats.month.apr",
  "stats.month.may",
  "stats.month.jun",
  "stats.month.jul",
  "stats.month.aug",
  "stats.month.sep",
  "stats.month.oct",
  "stats.month.nov",
  "stats.month.dec",
] as const;

export function CostTrendChart({ data }: CostTrendChartProps) {
  const { t } = useTranslation();

  const formatDateLabel = (date: string): string => {
    if (date.includes(":")) {
      return date.split(" ")[1] ?? date;
    }
    if (date.length === 7) {
      const [, month] = date.split("-");
      const monthIndex = parseInt(month ?? "1", 10) - 1;
      return t(MONTH_KEYS[monthIndex]);
    }
    const parts = date.split("-");
    if (parts.length === 3) {
      const monthIndex = parseInt(parts[1] ?? "1", 10) - 1;
      const month = t(MONTH_KEYS[monthIndex]);
      return `${month} ${parseInt(parts[2] ?? "1", 10)}`;
    }
    return date;
  };

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground/60">{t("stats.noData")}</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          className="fill-muted-foreground/50"
          tickFormatter={formatDateLabel}
          tickMargin={8}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          className="fill-muted-foreground/50"
          tickFormatter={(value) => `$${Number(value).toFixed(2)}`}
          width={50}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 500, marginBottom: 4 }}
          formatter={(value) => [`$${Number(value).toFixed(4)}`, t("stats.cost")]}
          labelFormatter={(label) => formatDateLabel(String(label))}
        />
        <Area
          type="monotone"
          dataKey="cost"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#costGradient)"
          dot={false}
          activeDot={{
            r: 4,
            fill: "hsl(var(--primary))",
            stroke: "hsl(var(--background))",
            strokeWidth: 2,
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
