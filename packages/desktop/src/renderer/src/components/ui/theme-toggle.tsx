import { Moon01Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { useConfigStore } from "../../features/config/store";
import { Button } from "./button";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const setTheme = useConfigStore((s) => s.setTheme);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      className={className}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {resolvedTheme === "dark" ? (
        <HugeiconsIcon icon={Sun01Icon} aria-hidden={true} />
      ) : (
        <HugeiconsIcon icon={Moon01Icon} aria-hidden={true} />
      )}
    </Button>
  );
}
