import { Moon01Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";

import { cn } from "../../lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      className={cn(
        "inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-transparent text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background sm:size-7",
        className,
      )}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {resolvedTheme === "dark" ? (
        <HugeiconsIcon icon={Sun01Icon} className="size-4 sm:size-3.5 opacity-80" aria-hidden={true} />
      ) : (
        <HugeiconsIcon icon={Moon01Icon} className="size-4 sm:size-3.5 opacity-80" aria-hidden={true} />
      )}
    </button>
  );
}
