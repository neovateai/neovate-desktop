import { useEffect } from "react";
import { matchesBinding, DEFAULT_KEYBINDINGS } from "../lib/keybindings";
import { useSettingsStore } from "../features/settings/store";
import { useConfigStore } from "../features/config/store";
import { useAgentStore } from "../features/agent/store";
import { useProjectStore } from "../features/project/store";
import { useTheme } from "next-themes";
import { toastManager } from "../components/ui/toast";

/**
 * Global keybinding handler for app-wide shortcuts.
 * All shortcuts are handled in renderer process for instant updates without restart.
 */
export function useGlobalKeybindings(): void {
  const showSettings = useSettingsStore((state) => state.showSettings);
  const setShowSettings = useSettingsStore((state) => state.setShowSettings);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const config = useConfigStore.getState();
      const keybindings = { ...DEFAULT_KEYBINDINGS, ...config.keybindings };

      // Open Settings
      if (matchesBinding(e, keybindings.openSettings)) {
        e.preventDefault();
        setShowSettings(!showSettings);
        return;
      }

      // Close Settings: Cmd+Esc (only when settings is open)
      if (showSettings && matchesBinding(e, keybindings.closeSettings)) {
        e.preventDefault();
        setShowSettings(false);
        return;
      }

      // Don't handle other shortcuts when in settings
      if (showSettings) return;

      // New Chat
      if (matchesBinding(e, keybindings.newChat)) {
        e.preventDefault();
        useAgentStore.getState().setActiveSession(null);
        // Dispatch focus event for ChatInput
        window.dispatchEvent(new CustomEvent("chat-input:focus"));
        return;
      }

      // Toggle Theme
      if (matchesBinding(e, keybindings.toggleTheme)) {
        e.preventDefault();
        const { resolvedTheme, setTheme } = useTheme();
        const newTheme = resolvedTheme === "dark" ? "light" : "dark";
        setTheme(newTheme);
        config.setConfig("theme", newTheme);
        return;
      }

      // Copy Path
      if (matchesBinding(e, keybindings.copyPath)) {
        e.preventDefault();
        const activeProject = useProjectStore.getState().activeProject;
        if (activeProject?.path) {
          navigator.clipboard.writeText(activeProject.path);
          toastManager.add({
            type: "success",
            title: "Path copied",
            description: activeProject.path,
          });
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSettings, setShowSettings]);
}
