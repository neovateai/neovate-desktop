export function PrimaryTitleBar() {
  return (
    <div
      data-slot="primary-titlebar"
      className="flex flex-1 items-center px-3"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <span className="text-xs font-medium text-muted-foreground" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        Neovate Desktop
      </span>
    </div>
  )
}
