import type { ReactNode } from "react";

import { cn } from "../../../lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  unit?: string;
  description?: string;
  icon: ReactNode;
  color?: "emerald" | "blue" | "violet" | "amber";
}

const colorClasses = {
  emerald: "text-emerald-500 bg-emerald-500/10",
  blue: "text-blue-500 bg-blue-500/10",
  violet: "text-violet-500 bg-violet-500/10",
  amber: "text-amber-500 bg-amber-500/10",
};

export function StatCard({ title, value, unit, description, icon, color = "blue" }: StatCardProps) {
  return (
    <div className="rounded-lg bg-background/50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className={cn("rounded-lg p-2", colorClasses[color])}>{icon}</div>
      </div>
      <div className="mt-2">
        <span className="text-2xl font-semibold">{value}</span>
        {unit && <span className="ml-1 text-sm text-muted-foreground">{unit}</span>}
      </div>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
