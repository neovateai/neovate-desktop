import { Settings } from "lucide-react"

export function SecondaryTitleBar() {
  return (
    <div
      data-slot="secondary-titlebar"
      className="flex shrink-0 items-center gap-1 px-2"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        aria-label="Settings"
      >
        <Settings className="h-4 w-4" />
      </button>
    </div>
  )
}
