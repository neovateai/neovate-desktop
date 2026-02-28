import { Files, GitBranch, Search, Terminal } from "lucide-react"
import { cn } from "../../lib/utils"
import { useLayoutStore } from "./use-layout-store"

type ActivityBarItemProps = {
  icon: React.ReactNode
  label: string
  panelId: string
}

function ActivityBarItem({ icon, label, panelId }: ActivityBarItemProps) {
  const collapsed = useLayoutStore((s) => s.panels[panelId]?.collapsed)
  const togglePanel = useLayoutStore((s) => s.togglePanel)

  return (
    <button
      type="button"
      onClick={() => togglePanel(panelId)}
      className={cn(
        "flex h-10 w-full items-center justify-center text-muted-foreground hover:text-foreground",
        !collapsed && "text-foreground",
      )}
      aria-label={label}
      aria-pressed={!collapsed}
    >
      {icon}
    </button>
  )
}

export function ActivityBar() {
  return (
    <nav data-slot="activity-bar" className="flex flex-col items-center pt-1">
      <ActivityBarItem icon={<Files className="h-5 w-5" />} label="Files" panelId="secondarySidebar" />
      <ActivityBarItem icon={<Search className="h-5 w-5" />} label="Search" panelId="secondarySidebar" />
      <ActivityBarItem icon={<GitBranch className="h-5 w-5" />} label="Git" panelId="secondarySidebar" />
      <ActivityBarItem icon={<Terminal className="h-5 w-5" />} label="Terminal" panelId="contentPanel" />
    </nav>
  )
}
