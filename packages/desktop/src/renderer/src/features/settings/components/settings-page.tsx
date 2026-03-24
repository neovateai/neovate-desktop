import { useEffect, useMemo } from "react";

import { matchesBinding, DEFAULT_KEYBINDINGS } from "../../../lib/keybindings";
import { useConfigStore } from "../../config/store";
import { useSettingsStore } from "../store";
import { AboutPanel } from "./panels/about-panel";
import { ChatPanel } from "./panels/chat-panel";
import { GeneralPanel } from "./panels/general-panel";
import { KeybindingsPanel } from "./panels/keybindings-panel";
import { ProvidersPanel } from "./panels/providers-panel";
import { RulesPanel } from "./panels/rules-panel";
import { SkillsPanel } from "./panels/skills-panel";
import { SettingsMenu } from "./settings-menu";

export const SettingsPage = () => {
  // UI state from useSettingsStore
  const activeMenu = useSettingsStore((state) => state.activeTab);
  const setActiveMenu = useSettingsStore((state) => state.setActiveTab);
  const setShowSettings = useSettingsStore((state) => state.setShowSettings);

  // Persistent config from useConfigStore
  const rawKeybindings = useConfigStore((state) => state.keybindings);
  const keybindings = useMemo(
    () => ({ ...DEFAULT_KEYBINDINGS, ...rawKeybindings }),
    [rawKeybindings],
  );

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
    <div className="absolute inset-0 z-50 flex bg-background">
      {/* Left Sidebar */}
      <SettingsMenu activeMenu={activeMenu} onMenuSelect={setActiveMenu} />

      {/* Right Content */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-card to-background">
        {/* Draggable header area */}
        <div
          className="h-10"
          style={{
            // @ts-expect-error - Electron specific CSS property
            WebkitAppRegion: "drag",
          }}
        />
        <div className="mx-auto max-w-3xl px-8 pb-12">
          {activeMenu === "chat" && <ChatPanel />}
          {activeMenu === "rules" && <RulesPanel />}
          {activeMenu === "general" && <GeneralPanel />}
          {activeMenu === "keybindings" && <KeybindingsPanel />}
          {activeMenu === "providers" && <ProvidersPanel />}
          {activeMenu === "skills" && <SkillsPanel />}
          {activeMenu === "about" && <AboutPanel />}
        </div>
      </div>
    </div>
  );
};
