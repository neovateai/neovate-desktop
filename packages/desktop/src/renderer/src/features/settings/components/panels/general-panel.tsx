import createDebug from "debug";
import { Settings } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import type { ThemeStyle } from "../../../../../../shared/features/config/types";

import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Spinner } from "../../../../components/ui/spinner";
import { Switch } from "../../../../components/ui/switch";
import { ToggleOptions } from "../../../../components/ui/toggle-options";
import { useRendererApp } from "../../../../core/app";
import { localeOptions, type Locales } from "../../../../core/i18n";
import { formatKeyForDisplay } from "../../../../lib/keybindings";
import { cn } from "../../../../lib/utils";
import { client } from "../../../../orpc";
import { useConfigStore } from "../../../config/store";
import { SettingsGroup } from "../settings-group";
import { SettingsRow } from "../settings-row";
import { ThemeStylePicker } from "../theme-style-picker";

// Check if a standalone binary (not .js) is configured — Network Inspector not supported
function useIsStandaloneBinary() {
  const claudeCodeBinPath = useConfigStore((s) => s.claudeCodeBinPath);
  return !!claudeCodeBinPath && !claudeCodeBinPath.trim().endsWith(".js");
}

const log = createDebug("neovate:settings");

export const GeneralPanel = () => {
  const { t } = useTranslation();
  const app = useRendererApp();
  const { setTheme } = useTheme();

  const {
    theme,
    themeStyle,
    locale,
    runOnStartup,
    multiProjectSupport,
    appFontSize,
    terminalFontSize,
    terminalFont,
    developerMode,
    showSessionInitStatus,
    claudeCodeBinPath,
    networkInspector,
    popupWindowEnabled,
    popupWindowShortcut,
    popupWindowStayOpen,
  } = useConfigStore(
    useShallow((s) => ({
      theme: s.theme,
      themeStyle: s.themeStyle,
      locale: s.locale,
      runOnStartup: s.runOnStartup,
      multiProjectSupport: s.multiProjectSupport,
      appFontSize: s.appFontSize,
      terminalFontSize: s.terminalFontSize,
      terminalFont: s.terminalFont,
      developerMode: s.developerMode,
      showSessionInitStatus: s.showSessionInitStatus,
      claudeCodeBinPath: s.claudeCodeBinPath,
      networkInspector: s.networkInspector,
      popupWindowEnabled: s.popupWindowEnabled,
      popupWindowShortcut: s.popupWindowShortcut,
      popupWindowStayOpen: s.popupWindowStayOpen,
    })),
  );

  const isStandaloneBinary = useIsStandaloneBinary();
  const setConfig = useConfigStore((s) => s.setConfig);
  const loaded = useConfigStore((s) => s.loaded);

  const handleThemeChange = (newTheme: string) => {
    if (newTheme === theme) return;
    setTheme(newTheme);
    setConfig("theme", newTheme as any);
  };

  const handleLocaleChange = (newLocale: string) => {
    setConfig("locale", newLocale as Locales);
    app.i18nManager.applyUILocale(newLocale as Locales);
  };

  const handleThemeStyleChange = (newStyle: ThemeStyle) => {
    if (newStyle === themeStyle) return;
    setConfig("themeStyle", newStyle);
  };

  // Debounced terminal font input
  const [localTerminalFont, setLocalTerminalFont] = useState(terminalFont);
  const terminalFontTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Debounced Claude Code binary path input
  const [localClaudeCodeBinPath, setLocalClaudeCodeBinPath] = useState(claudeCodeBinPath);
  const claudeCodeBinPathTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Debounced npm registry input with validation
  const npmRegistry = useConfigStore((s) => s.npmRegistry);
  const [localNpmRegistry, setLocalNpmRegistry] = useState(npmRegistry);
  const [npmRegistryError, setNpmRegistryError] = useState(false);
  const npmRegistryTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    setLocalTerminalFont(terminalFont);
  }, [terminalFont]);

  useEffect(() => {
    setLocalClaudeCodeBinPath(claudeCodeBinPath);
  }, [claudeCodeBinPath]);

  useEffect(() => {
    setLocalNpmRegistry(npmRegistry);
    setNpmRegistryError(false);
  }, [npmRegistry]);

  useEffect(() => {
    if (localTerminalFont === terminalFont) return;
    terminalFontTimerRef.current = setTimeout(() => {
      setConfig("terminalFont", localTerminalFont);
    }, 500);
    return () => {
      if (terminalFontTimerRef.current) clearTimeout(terminalFontTimerRef.current);
    };
  }, [localTerminalFont]);

  useEffect(() => {
    if (localClaudeCodeBinPath === claudeCodeBinPath) return;
    claudeCodeBinPathTimerRef.current = setTimeout(() => {
      setConfig("claudeCodeBinPath", localClaudeCodeBinPath.trim());
    }, 500);
    return () => {
      if (claudeCodeBinPathTimerRef.current) clearTimeout(claudeCodeBinPathTimerRef.current);
    };
  }, [localClaudeCodeBinPath]);

  useEffect(() => {
    if (localNpmRegistry === npmRegistry) {
      setNpmRegistryError(false);
      return;
    }
    npmRegistryTimerRef.current = setTimeout(() => {
      const trimmed = localNpmRegistry.replace(/\/+$/, "");
      if (trimmed === "") {
        setNpmRegistryError(false);
        setConfig("npmRegistry", "");
        return;
      }
      try {
        new URL(trimmed);
        setNpmRegistryError(false);
        setConfig("npmRegistry", trimmed);
      } catch {
        setNpmRegistryError(true);
      }
    }, 500);
    return () => {
      if (npmRegistryTimerRef.current) clearTimeout(npmRegistryTimerRef.current);
    };
  }, [localNpmRegistry]);

  const handleRunOnStartupChange = async (enabled: boolean) => {
    setConfig("runOnStartup", enabled);
    try {
      await client.utils.setLoginItem({ openAtLogin: enabled });
    } catch (error) {
      log("Failed to set login item:", error);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-8 flex items-center gap-3 text-foreground">
        <span className="flex items-center justify-center size-9 rounded-xl bg-primary/10">
          <Settings className="size-5 text-primary" />
        </span>
        {t("settings.general")}
      </h1>

      <div className="space-y-5">
        {/* Appearance */}
        <SettingsGroup title={t("settings.general.group.appearance")}>
          <SettingsRow
            title={t("settings.general.language")}
            description={t("settings.general.language.description")}
          >
            <ToggleOptions value={locale} onChange={handleLocaleChange} options={localeOptions} />
          </SettingsRow>

          <SettingsRow title={t("settings.theme")} description={t("settings.theme.description")}>
            <ToggleOptions
              value={theme}
              onChange={handleThemeChange}
              options={[
                { value: "light", label: t("settings.theme.light") },
                { value: "dark", label: t("settings.theme.dark") },
                { value: "system", label: t("settings.theme.system") },
              ]}
            />
          </SettingsRow>

          <SettingsRow
            title={t("settings.themeStyle")}
            description={t("settings.themeStyle.description")}
          >
            <ThemeStylePicker value={themeStyle} onChange={handleThemeStyleChange} />
          </SettingsRow>

          <SettingsRow
            title={t("settings.general.appFontSize")}
            description={t("settings.general.appFontSize.description")}
          >
            <Input
              type="number"
              min={12}
              max={20}
              value={appFontSize}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (Number.isNaN(n) || n < 12 || n > 20) return;
                setConfig("appFontSize", n);
              }}
              className="w-24"
            />
          </SettingsRow>
        </SettingsGroup>

        {/* Terminal */}
        <SettingsGroup title={t("settings.general.group.terminal")}>
          <SettingsRow
            title={t("settings.general.terminalFontSize")}
            description={t("settings.general.terminalFontSize.description")}
          >
            <Input
              type="number"
              min={8}
              max={32}
              value={terminalFontSize}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (Number.isNaN(n) || n < 8 || n > 32) return;
                setConfig("terminalFontSize", n);
              }}
              className="w-24"
            />
          </SettingsRow>

          <SettingsRow
            title={t("settings.general.terminalFont")}
            description={t("settings.general.terminalFont.description")}
          >
            <Input
              type="text"
              value={localTerminalFont}
              onChange={(e) => setLocalTerminalFont(e.target.value)}
              placeholder={t("settings.general.terminalFont.default")}
              className="w-40"
            />
          </SettingsRow>
        </SettingsGroup>

        {/* System */}
        <SettingsGroup title={t("settings.general.group.system")}>
          <SettingsRow
            title={t("settings.general.runOnStartup")}
            description={t("settings.general.runOnStartup.description")}
          >
            <Switch checked={runOnStartup} onCheckedChange={handleRunOnStartupChange} />
          </SettingsRow>

          <SettingsRow
            title={t("settings.general.multiProjectSupport")}
            description={t("settings.general.multiProjectSupport.description")}
          >
            <Switch
              checked={multiProjectSupport}
              onCheckedChange={(v) => setConfig("multiProjectSupport", v)}
            />
          </SettingsRow>

          <SettingsRow
            title={t("settings.general.popupWindow")}
            description={t("settings.general.popupWindow.description")}
          >
            <Switch
              checked={popupWindowEnabled}
              onCheckedChange={(v) => setConfig("popupWindowEnabled", v)}
            />
          </SettingsRow>

          {popupWindowEnabled && (
            <>
              <SettingsRow
                title={t("settings.general.popupWindowShortcut")}
                description={t("settings.general.popupWindowShortcut.description")}
              >
                <div className="flex items-center gap-1.5">
                  {formatKeyForDisplay(popupWindowShortcut).map((key, i) => (
                    <kbd
                      key={i}
                      className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-muted px-1.5 text-xs font-medium text-muted-foreground"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </SettingsRow>

              <SettingsRow
                title={t("settings.general.popupWindowStayOpen")}
                description={t("settings.general.popupWindowStayOpen.description")}
              >
                <Switch
                  checked={popupWindowStayOpen}
                  onCheckedChange={(v) => setConfig("popupWindowStayOpen", v)}
                />
              </SettingsRow>
            </>
          )}
        </SettingsGroup>

        {/* Developer */}
        <SettingsGroup title={t("settings.general.group.developer")}>
          <SettingsRow
            title={t("settings.general.developerMode")}
            description={t("settings.general.developerMode.description")}
          >
            <Switch
              checked={developerMode}
              onCheckedChange={(v) => setConfig("developerMode", v)}
            />
          </SettingsRow>

          <SettingsRow
            title={t("settings.general.claudeCodeBinPath")}
            description={t("settings.general.claudeCodeBinPath.description")}
          >
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={localClaudeCodeBinPath}
                onChange={(e) => setLocalClaudeCodeBinPath(e.target.value)}
                placeholder="Bundled (default)"
                className="w-64"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const result = await client.electron.dialog.showOpenDialog({
                    properties: ["openFile", "showHiddenFiles"],
                    filters: [{ name: "All Files", extensions: ["*"] }],
                  });
                  if (!result.canceled && result.filePaths[0]) {
                    setLocalClaudeCodeBinPath(result.filePaths[0]);
                  }
                }}
              >
                {t("settings.general.claudeCodeBinPath.browse")}
              </Button>
            </div>
          </SettingsRow>

          <SettingsRow
            title={t("settings.general.showSessionInitStatus")}
            description={t("settings.general.showSessionInitStatus.description")}
          >
            <Switch
              checked={showSessionInitStatus}
              onCheckedChange={(v) => setConfig("showSessionInitStatus", v)}
            />
          </SettingsRow>

          <SettingsRow
            title={t("settings.agents.networkInspector")}
            description={
              isStandaloneBinary
                ? t("settings.agents.networkInspector.unsupported")
                : t("settings.agents.networkInspector.description")
            }
          >
            <Switch
              checked={networkInspector && !isStandaloneBinary}
              onCheckedChange={(v) => setConfig("networkInspector", v)}
              disabled={isStandaloneBinary}
            />
          </SettingsRow>

          <SettingsRow
            title={t("settings.general.npmRegistry")}
            description={
              npmRegistryError ? (
                <span className="text-destructive">
                  {t("settings.general.npmRegistry.invalidUrl")}
                </span>
              ) : (
                t("settings.general.npmRegistry.description")
              )
            }
          >
            <Input
              type="text"
              value={localNpmRegistry}
              onChange={(e) => setLocalNpmRegistry(e.target.value)}
              placeholder="https://registry.npmmirror.com"
              className={cn("w-64", npmRegistryError && "border-destructive")}
            />
          </SettingsRow>
        </SettingsGroup>
      </div>
    </div>
  );
};
