import { useTheme } from "next-themes";

export default function DemoWindow() {
  const { theme } = useTheme();

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Demo Window</h1>
        <p className="text-muted-foreground">Theme: {theme}</p>
      </div>
    </div>
  );
}
