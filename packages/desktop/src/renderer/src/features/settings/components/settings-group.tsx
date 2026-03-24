import type { ReactNode } from "react";

import { cn } from "../../../lib/utils";

interface SettingsGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsGroup({ title, description, children, className }: SettingsGroupProps) {
  return (
    <div className={cn("rounded-xl bg-muted/30 border border-border/50", className)}>
      <div className="px-5 pt-4 pb-2">
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        {description && (
          <div className="text-xs text-muted-foreground/70 mt-0.5">{description}</div>
        )}
      </div>
      <div className="px-5 pb-2">{children}</div>
    </div>
  );
}
