import { type CSSProperties, useRef, useCallback } from "react";

import type { SeparatorId } from "./types";

import { cn } from "../../lib/utils";
import { separatorIdToIndex } from "./constants";
import { isSeparatorVisible } from "./layout-coordinator";
import { useLayoutStore } from "./store";

function useGradientTracker(separatorIndex: number) {
  const ref = useRef<HTMLDivElement>(null);
  const isResizing = useLayoutStore((s) => s.resizing?.separatorIndex === separatorIndex);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      el.style.setProperty("--y", `${e.clientY - e.currentTarget.getBoundingClientRect().top}px`);
      el.style.setProperty("--intensity", isResizing ? "1" : "0.5");
    },
    [isResizing],
  );

  return { ref, onPointerMove };
}

export function ResizeHandle({ id, style }: { id: SeparatorId; style?: CSSProperties }) {
  const separatorIndex = separatorIdToIndex(id);
  const visible = useLayoutStore((s) => isSeparatorVisible(s.panels, separatorIndex));
  const isActive = useLayoutStore((s) => s.resizing?.separatorIndex === separatorIndex);
  const startResize = useLayoutStore((s) => s.startResize);

  const { ref, onPointerMove } = useGradientTracker(separatorIndex);

  if (!visible) return null;

  return (
    <div
      data-slot={`resize-handle:${id}`}
      data-state={isActive ? "active" : undefined}
      style={style}
      className="group relative w-[5px] shrink-0 cursor-col-resize"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        startResize(separatorIndex, e.clientX);
      }}
      onPointerMove={onPointerMove}
    >
      {/* Expanded hit area */}
      <div className="absolute inset-y-0 -inset-x-1" />
      {/* Gradient indicator — CSS vars --y and --intensity are set by JS */}
      <div
        ref={ref}
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2",
          "bg-[radial-gradient(circle_66vh_at_50%_var(--y),_color-mix(in_oklch,var(--primary)_calc(var(--intensity)*100%),transparent)_0%,_color-mix(in_oklch,var(--primary)_calc(var(--intensity)*50%),transparent)_30%,_transparent_70%)]",
          "opacity-0 transition-opacity duration-150 ease-out",
          "group-hover:opacity-100",
          "group-data-[state=active]:opacity-100 group-data-[state=active]:transition-none",
        )}
      />
    </div>
  );
}
