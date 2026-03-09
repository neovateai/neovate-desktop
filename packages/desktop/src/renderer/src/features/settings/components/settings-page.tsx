import { useEffect } from "react";

import { matchesBinding } from "../../../lib/keybindings";
import { useConfigStore } from "../../config/store";
import { useSettingsStore } from "../store";
import { AboutPanel } from "./panels/about-panel";
import { ChatPanel } from "./panels/chat-panel";
import { GeneralPanel } from "./panels/general-panel";
import { KeybindingsPanel } from "./panels/keybindings-panel";
import { MCPPanel } from "./panels/mcp-panel";
import { RulesPanel } from "./panels/rules-panel";
import { SkillsPanel } from "./panels/skills-panel";
import { SettingsMenu } from "./settings-menu";

export const SettingsPage = () => {
  // UI state from useSettingsStore
  const activeMenu = useSettingsStore((state) => state.activeTab);
  const setActiveMenu = useSettingsStore((state) => state.setActiveTab);
  const setShowSettings = useSettingsStore((state) => state.setShowSettings);

  // Persistent config from useConfigStore
  const keybindings = useConfigStore((state) => state.keybindings);

  // Cmd+Esc to close settings and go back to app
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesBinding(e, keybindings.closeSettings)) {
        e.preventDefault();
        setShowSettings(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setShowSettings, keybindings]);

  return (
    <div className="flex h-full bg-card">
      {/* Left Sidebar */}
      <SettingsMenu activeMenu={activeMenu} onMenuSelect={setActiveMenu} />

      {/* Right Content */}
      <div className="flex-1 overflow-y-auto bg-card">
        {/* Draggable header area */}
        <div
          className="h-12"
          style={{
            // @ts-expect-error - Electron specific CSS property
            WebkitAppRegion: "drag",
          }}
        />
        <div className="px-8 pb-8">
          {activeMenu === "chat" && <ChatPanel />}
          {activeMenu === "rules" && <RulesPanel />}
          {activeMenu === "general" && <GeneralPanel />}
          {activeMenu === "keybindings" && <KeybindingsPanel />}
          {activeMenu === "mcp" && <MCPPanel />}
          {activeMenu === "skills" && <SkillsPanel />}
          {activeMenu === "about" && <AboutPanel />}
        </div>
      </div>
    </div>
  );
};
