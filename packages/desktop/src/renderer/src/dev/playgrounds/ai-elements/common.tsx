import type { ReactNode } from "react";

import { useEffect, useRef } from "react";

import { ScrollArea } from "../../../components/ui/scroll-area";
import { cn } from "../../../lib/utils";

export const rendererRoot =
  "/Users/dinq/GitHub/neovateai/neovate-desktop/packages/desktop/src/renderer/src";

export const demoImageUrl = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="a" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#d97706"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" rx="24" fill="url(#a)"/>
  <circle cx="140" cy="120" r="56" fill="rgba(255,255,255,0.28)"/>
  <path d="M94 276c42-64 98-96 166-96s124 32 166 96" fill="rgba(255,255,255,0.22)"/>
  <text x="42" y="320" fill="white" font-family="ui-monospace, monospace" font-size="28">
    UI Playground Attachment
  </text>
</svg>
`)}`;

export function SidebarGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </div>
  );
}

export function SidebarButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-2 text-left text-sm transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function ScenarioButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function PreviewSurface({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const triggers = containerRef.current?.querySelectorAll<HTMLElement>(
        '[data-slot="collapsible-trigger"]',
      );

      triggers?.forEach((trigger) => {
        if (trigger.getAttribute("aria-expanded") !== "true") {
          trigger.click();
        }
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [children]);

  return (
    <div ref={containerRef} className="[--code-block-content-visibility:visible]">
      {children}
    </div>
  );
}

export function PlaygroundPage({
  title,
  summary,
  scenarioLabel,
  controls,
  children,
}: {
  title: string;
  summary: string;
  scenarioLabel: string;
  controls: ReactNode;
  children: ReactNode;
}) {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {scenarioLabel}
          </div>
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{summary}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">{controls}</div>

        <PreviewSurface>{children}</PreviewSurface>
      </div>
    </ScrollArea>
  );
}
