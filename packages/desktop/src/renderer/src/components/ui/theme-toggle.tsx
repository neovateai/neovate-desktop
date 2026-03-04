import { Moon01Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { useConfigStore } from "../../features/config/store";
import { Button } from "./button";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const setConfig = useConfigStore((s) => s.setConfig);

  const handleToggle = () => {
    const newTheme = resolvedTheme === "dark" ? "light" : "dark";
    setConfig("theme", newTheme);
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      className={className}
      onClick={handleToggle}
    >
      {resolvedTheme === "dark" ? (
        <HugeiconsIcon icon={Sun01Icon} aria-hidden={true} />
      ) : (
        <HugeiconsIcon icon={Moon01Icon} aria-hidden={true} />
      )}
    </Button>
  );
}
