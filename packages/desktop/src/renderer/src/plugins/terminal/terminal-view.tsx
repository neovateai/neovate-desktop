import { useInstanceId, useViewState } from "../../features/content-panel";

export default function TerminalView() {
  const instanceId = useInstanceId();
  const state = useViewState();

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="text-center text-xs text-muted-foreground">
        <p>Terminal Stub</p>
        <p>Instance: {instanceId}</p>
        <p>State: {JSON.stringify(state)}</p>
      </div>
    </div>
  );
}
