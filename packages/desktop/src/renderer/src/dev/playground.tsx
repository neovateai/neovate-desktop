import { lazy, Suspense, useState } from "react";
import { cn } from "../lib/utils";
import { ErrorBoundary } from "../components/ui/error-boundary";

const PLAYGROUNDS = [
  {
    id: "ai-elements",
    label: "AI Elements",
    component: lazy(() => import("./playgrounds/ai-elements")),
  },
] as const;

type PlaygroundId = (typeof PLAYGROUNDS)[number]["id"];

export default function Playground() {
  const [active, setActive] = useState<PlaygroundId>(PLAYGROUNDS[0].id);
  const Current = PLAYGROUNDS.find((p) => p.id === active)!.component;

  return (
    <div className="flex h-screen flex-col">
      {/* Draggable title bar */}
      <div className="[-webkit-app-region:drag] relative flex h-11 shrink-0 select-none items-center justify-center border-b">
        <span className="[-webkit-app-region:no-drag] text-xs font-medium text-muted-foreground">
          Playground
        </span>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r p-2">
          {PLAYGROUNDS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(p.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                active === p.id
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="min-w-0 flex-1">
          <ErrorBoundary key={active}>
            <Suspense>
              <Current />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
