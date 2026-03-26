import type { ReactNode } from "react";

import { cn } from "../../../lib/utils";

type GradientBorderWrapperProps = {
  children: ReactNode;
  innerClassName?: string;
};

export function GradientBorderWrapper({ children, innerClassName }: GradientBorderWrapperProps) {
  return (
    <div
      className="rounded-[12px] shadow-[0_4px_4px_rgba(0,0,0,0.04)]"
      style={{
        border: "3px solid transparent",
        background:
          "linear-gradient(var(--color-background), var(--color-background)) padding-box,linear-gradient(180deg,var(--color-background) 0%, color-mix(in srgb, var(--color-background) 50%, transparent) 100%) border-box",
      }}
    >
      <div
        className={cn("overflow-hidden rounded-lg", innerClassName)}
        style={{
          border: "2px solid transparent",
          color: "var(--foreground)",
          transition: "border-color 0.2s, background 0.2s",
          background:
            "linear-gradient(var(--background-secondary)) padding-box,linear-gradient(0deg,color-mix(in srgb, var(--primary) 30%, transparent) 0,transparent 80%,transparent)border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}
