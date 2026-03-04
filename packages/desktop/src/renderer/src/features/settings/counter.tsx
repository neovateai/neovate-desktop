import { useRendererApp } from "../../core";
import { Button } from "../../components/ui/button";
import { useSettings } from "./hooks";

export function Counter({ className }: { className?: string }) {
  const app = useRendererApp();
  const prefs = app.settings.scoped("preferences");
  const count = useSettings((s) => s.preferences?.count ?? 0);

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <Button variant="ghost" size="icon-sm" onClick={() => prefs.set("count", count - 1)}>
        -
      </Button>
      <span className="min-w-[2ch] text-center text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
      <Button variant="ghost" size="icon-sm" onClick={() => prefs.set("count", count + 1)}>
        +
      </Button>
    </div>
  );
}
