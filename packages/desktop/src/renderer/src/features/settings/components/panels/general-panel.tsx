import createDebug from "debug";
import { Settings } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import { Input } from "../../../../components/ui/input";
import { Spinner } from "../../../../components/ui/spinner";
import { Switch } from "../../../../components/ui/switch";
import { ToggleOptions } from "../../../../components/ui/toggle-options";
import { useRendererApp } from "../../../../core";
import { localeOptions, type Locales } from "../../../../core/i18n";
import { client } from "../../../../orpc";
import { useConfigStore } from "../../../config/store";
import { SettingsRow } from "../settings-row";

const log = createDebug("neovate:settings");

export const GeneralPanel = () => {
  const { t } = useTranslation();
  const app = useRendererApp();
  const { setTheme } = useTheme();

  const {
    theme,
    locale,
    runOnStartup,
    multiProjectSupport,
    terminalFontSize,
    terminalFont,
    developerMode,
  } = useConfigStore(
    useShallow((s) => ({
      theme: s.theme,
      locale: s.locale,
      runOnStartup: s.runOnStartup,
      multiProjectSupport: s.multiProjectSupport,
      terminalFontSize: s.terminalFontSize,
      terminalFont: s.terminalFont,
      developerMode: s.developerMode,
    })),
  );
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

  // Debounced terminal font input
  const [localTerminalFont, setLocalTerminalFont] = useState(terminalFont);
  const terminalFontTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    setLocalTerminalFont(terminalFont);
  }, [terminalFont]);

  useEffect(() => {
    if (localTerminalFont === terminalFont) return;
    terminalFontTimerRef.current = setTimeout(() => {
      setConfig("terminalFont", localTerminalFont);
    }, 500);
    return () => {
      if (terminalFontTimerRef.current) clearTimeout(terminalFontTimerRef.current);
    };
  }, [localTerminalFont]);

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
      <h1 className="text-xl font-semibold mb-6 flex items-center gap-2 text-foreground">
        <Settings className="size-[22px]" />
        {t("settings.general")}
      </h1>

      <div className="space-y-0">
        {/* Language */}
        <SettingsRow
          title={t("settings.general.language")}
          description={t("settings.general.language.description")}
        >
          <ToggleOptions value={locale} onChange={handleLocaleChange} options={localeOptions} />
        </SettingsRow>

        {/* Theme */}
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

        {/* Run on Startup */}
        <SettingsRow
          title={t("settings.general.runOnStartup")}
          description={t("settings.general.runOnStartup.description")}
        >
          <Switch checked={runOnStartup} onCheckedChange={handleRunOnStartupChange} />
        </SettingsRow>

        {/* Multi-Project Support */}
        <SettingsRow
          title={t("settings.general.multiProjectSupport")}
          description={t("settings.general.multiProjectSupport.description")}
        >
          <Switch
            checked={multiProjectSupport}
            onCheckedChange={(v) => setConfig("multiProjectSupport", v)}
          />
        </SettingsRow>

        {/* Terminal Font Size */}
        <SettingsRow
          title={t("settings.general.terminalFontSize")}
          description={t("settings.general.terminalFontSize.description")}
        >
          <Input
            type="number"
            min={8}
            max={32}
            value={terminalFontSize}
            onChange={(e) => setConfig("terminalFontSize", Number(e.target.value))}
            className="w-24"
          />
        </SettingsRow>

        {/* Terminal Font */}
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

        {/* Developer Mode */}
        <SettingsRow
          title={t("settings.general.developerMode")}
          description={t("settings.general.developerMode.description")}
        >
          <Switch checked={developerMode} onCheckedChange={(v) => setConfig("developerMode", v)} />
        </SettingsRow>
      </div>
    </div>
  );
};
