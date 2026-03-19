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
    <div className={cn("rounded-[0.625rem] border border-border", className)}>
      <div className="px-4 pt-3 pb-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </div>
        {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}
