import { useLayoutStore } from "./store";

export function FullRightPanel() {
  const fullRightPanelId = useLayoutStore((s) => s.fullRightPanelId);

  if (!fullRightPanelId) return null;

  return (
    <div
      data-slot="full-right-panel"
      className="z-10 flex items-center justify-center bg-background"
      style={{ gridColumn: "3 / -1", gridRow: "1 / -1" }}
    >
      <p className="text-sm text-muted-foreground">Panel: {fullRightPanelId}</p>
    </div>
  );
}
