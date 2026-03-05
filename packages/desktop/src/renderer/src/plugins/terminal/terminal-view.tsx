import { useContentPanelViewContext } from "../../features/content-panel";

export default function TerminalView() {
  const { viewId, viewState } = useContentPanelViewContext();

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="text-center text-xs text-muted-foreground">
        <p>Terminal Stub</p>
        <p>Instance: {viewId}</p>
        <p>State: {JSON.stringify(viewState)}</p>
      </div>
    </div>
  );
}
