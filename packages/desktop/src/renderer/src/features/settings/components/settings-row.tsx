import type { ReactNode } from "react";

import { cn } from "../../../lib/utils";

interface SettingsRowProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsRow({ title, description, children, className }: SettingsRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-4 border-b border-border last:border-b-0",
        className,
      )}
    >
      <div className="flex-1 pr-4">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description && <div className="text-sm text-muted-foreground mt-0.5">{description}</div>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
