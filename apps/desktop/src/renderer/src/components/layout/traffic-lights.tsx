import { PanelLeft } from "lucide-react"
import { useLayoutStore } from "./use-layout-store"

export function AppLayoutTrafficLights() {
  const collapsed = useLayoutStore((s) => s.panels.primarySidebar?.collapsed)
  const togglePanel = useLayoutStore((s) => s.togglePanel)

  return (
    <div data-slot="traffic-lights" className="flex w-[76px] shrink-0 items-center justify-end pr-1">
      <button
        type="button"
        onClick={() => togglePanel("primarySidebar")}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
      >
        <PanelLeft className="h-4 w-4" />
      </button>
    </div>
  )
}
