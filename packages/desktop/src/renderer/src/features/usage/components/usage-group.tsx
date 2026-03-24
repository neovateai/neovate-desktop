import type { ReactNode } from "react";

import { cn } from "../../../lib/utils";

interface UsageGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function UsageGroup({ title, description, children, className }: UsageGroupProps) {
  return (
    <div className={cn("rounded-xl bg-muted/30 border border-border/50", className)}>
      <div className="px-5 pt-4 pb-2">
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        {description && (
          <div className="mt-0.5 text-xs text-muted-foreground/70">{description}</div>
        )}
      </div>
      <div className="px-5 pb-4">{children}</div>
    </div>
  );
}
