import { ChevronDown, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import type { App } from "../../../../../shared/features/utils/types";

import antigravityIcon from "../../../assets/icons/antigravity.png";
import cursorIcon from "../../../assets/icons/cursor.png";
import finderIcon from "../../../assets/icons/finder.png";
import itermIcon from "../../../assets/icons/iterm.png";
import sourcetreeIcon from "../../../assets/icons/sourcetree.png";
import terminalIcon from "../../../assets/icons/terminal.png";
import vscodeInsidersIcon from "../../../assets/icons/vscode-insiders.png";
import vscodeIcon from "../../../assets/icons/vscode.png";
import warpIcon from "../../../assets/icons/warp.png";
import windsurfIcon from "../../../assets/icons/windsurf.png";
import zedIcon from "../../../assets/icons/zed.png";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../../components/ui/menu";
import { DEFAULT_KEYBINDINGS, formatKeyForDisplay } from "../../../lib/keybindings";
import { client } from "../../../orpc";
import { useConfigStore } from "../../config/store";

const APP_NAMES: Record<App, string> = {
  cursor: "Cursor",
  vscode: "VS Code",
  "vscode-insiders": "VS Code Insiders",
  zed: "Zed",
  windsurf: "Windsurf",
  iterm: "iTerm",
  warp: "Warp",
  terminal: "Terminal",
  antigravity: "Antigravity",
  finder: "Finder",
  sourcetree: "Sourcetree",
  fork: "Fork",
};

const APP_ICON_SRC: Partial<Record<App, string>> = {
  cursor: cursorIcon,
  vscode: vscodeIcon,
  "vscode-insiders": vscodeInsidersIcon,
  zed: zedIcon,
  windsurf: windsurfIcon,
  iterm: itermIcon,
  warp: warpIcon,
  terminal: terminalIcon,
  finder: finderIcon,
  sourcetree: sourcetreeIcon,
  antigravity: antigravityIcon,
};

const STORAGE_KEY = "neovate:defaultOpenApp";

interface OpenAppButtonProps {
  cwd: string;
}

export function OpenAppButton({ cwd }: OpenAppButtonProps) {
  const [apps, setApps] = useState<App[]>([]);
  const [hasDetected, setHasDetected] = useState(false);
  const [defaultOpenApp, setDefaultOpenApp] = useState<App | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored as App | null;
  });

  // Get keybindings from config
  const keybindings = useConfigStore((s) => s.keybindings);
  const copyPathBinding = keybindings.copyPath ?? DEFAULT_KEYBINDINGS.copyPath;
  const copyPathDisplay = formatKeyForDisplay(copyPathBinding);

  useEffect(() => {
    if (!defaultOpenApp && apps.length === 0) {
      client.utils.detectApps().then((response) => {
        setApps(response.apps);
        setHasDetected(true);
      });
    }
  }, [defaultOpenApp, apps.length]);

  const effectiveDefault = defaultOpenApp ?? apps[0] ?? null;
  const effectiveIcon = effectiveDefault ? APP_ICON_SRC[effectiveDefault] : null;

  const handleOpenChange = async (open: boolean) => {
    if (open) {
      try {
        const response = await client.utils.detectApps();
        setApps(response.apps);
        setHasDetected(true);
      } catch (error) {
        console.error("Failed to detect apps:", error);
      }
    }
  };

  const handleOpenApp = async (app: App) => {
    try {
      await client.utils.openIn({ cwd, app });
    } catch (error) {
      console.error("Failed to open app:", error);
    }
  };

  const handleSelectApp = async (app: App) => {
    setDefaultOpenApp(app);
    localStorage.setItem(STORAGE_KEY, app);
    await handleOpenApp(app);
  };

  const handleLeftClick = async () => {
    if (effectiveDefault) {
      await handleOpenApp(effectiveDefault);
    }
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(cwd);
  };

  return (
    <div className="flex">
      <Button
        variant="outline"
        size="sm"
        className="h-7 rounded-r-none border-r-0 px-2"
        onClick={handleLeftClick}
        disabled={!effectiveDefault}
      >
        {effectiveIcon ? (
          <img alt="" className="pointer-events-none size-4 shrink-0" src={effectiveIcon} />
        ) : (
          <span className="text-xs">Open</span>
        )}
      </Button>
      <DropdownMenu onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="h-7 rounded-l-none px-1">
              <ChevronDown className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {apps.length === 0 && hasDetected ? (
            <div className="px-4 py-2">
              <span className="text-sm text-muted-foreground">No apps detected</span>
            </div>
          ) : (
            apps.map((app) => {
              const iconSrc = APP_ICON_SRC[app];
              return (
                <DropdownMenuItem key={app} onClick={() => handleSelectApp(app)}>
                  {iconSrc ? (
                    <img alt="" className="pointer-events-none size-4 shrink-0" src={iconSrc} />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <span>{APP_NAMES[app]}</span>
                </DropdownMenuItem>
              );
            })
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCopyPath} className="pl-3">
            <Copy className="size-4 shrink-0" />
            <span>Copy path</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {copyPathDisplay.join("")}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
