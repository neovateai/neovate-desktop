import { useTheme } from "next-themes";
import { useRendererApp } from "../../core/app";

export default function DemoWindow() {
  const { theme } = useTheme();
  const { windowId, windowType } = useRendererApp();

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Demo Window</h1>
        <p className="text-muted-foreground">Window ID: {windowId}</p>
        <p className="text-muted-foreground">Window Type: {windowType}</p>
        <p className="text-muted-foreground">Theme: {theme}</p>
      </div>
    </div>
  );
}
