import { useState, useEffect, useRef } from "react";
import { Button } from "../../components/ui/button";
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
        <p className="mb-2 text-sm">Downloading update {state.version}...</p>
        <Progress value={percent} max={100} />
      </div>
    );
  }

  if (state.status === "ready") {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-72 rounded-lg border bg-popover p-4 shadow-lg">
        <p className="text-sm font-medium">Update {state.version} ready to install</p>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          Neovate will quit and reopen to finish updating.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            data-testid="updater-later"
            variant="ghost"
            size="xs"
            onClick={() => setDismissed(true)}
          >
            Not now
          </Button>
          <Button
            data-testid="updater-restart"
            variant="default"
            size="xs"
            onClick={() => client.updater.install()}
          >
            Restart to Update
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
