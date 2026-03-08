import { useState, useEffect, useRef } from "react";
import { Progress } from "../../components/ui/progress";
import { client } from "../../orpc";
import { useUpdaterState } from "./hooks";

export function UpdaterToast() {
  const state = useUpdaterState();
  const [dismissed, setDismissed] = useState(false);
  const prevStatus = useRef(state.status);

  useEffect(() => {
    if (state.status !== prevStatus.current) {
      prevStatus.current = state.status;
      setDismissed(false);
    }
  }, [state]);

  if (dismissed) return null;

  if (state.status === "available" || state.status === "downloading") {
    const percent = state.status === "downloading" ? state.percent : 0;
    return (
      <div className="fixed bottom-4 right-4 z-50 w-72 rounded-lg border bg-popover p-4 shadow-lg">
        <p className="mb-2 text-sm">Downloading {state.version}...</p>
        <Progress value={percent} max={100} />
      </div>
    );
  }

  if (state.status === "ready") {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-72 rounded-lg border bg-popover p-4 shadow-lg">
        <p className="mb-3 text-sm">Update {state.version} ready</p>
        <div className="flex justify-end gap-2">
          <button
            className="rounded px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => setDismissed(true)}
          >
            Later
          </button>
          <button
            className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
            onClick={() => client.updater.install()}
          >
            Restart
          </button>
        </div>
      </div>
    );
  }

  return null;
}
