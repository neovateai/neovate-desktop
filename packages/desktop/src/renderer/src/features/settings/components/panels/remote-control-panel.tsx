import { AlertTriangle, CheckCircle, Radio, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  PlatformStatus,
  PlatformStatusEvent,
} from "../../../../../../shared/features/remote-control/types";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Switch } from "../../../../components/ui/switch";
import { client } from "../../../../orpc";
import { SettingsGroup } from "../settings-group";
import { SettingsRow } from "../settings-row";

export const RemoteControlPanel = () => {
  const { t } = useTranslation();
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlatforms = useCallback(async () => {
    try {
      const result = await client.remoteControl.getPlatforms();
      setPlatforms(result);
    } catch {
      // Service may not be ready yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlatforms();
  }, [loadPlatforms]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-8 flex items-center gap-3 text-foreground">
        <span className="flex items-center justify-center size-9 rounded-xl bg-primary/10">
          <Radio className="size-5 text-primary" />
        </span>
        {t("settings.remoteControl")}
      </h1>

      {/* Content sensitivity warning */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
        <AlertTriangle className="size-4 mt-0.5 shrink-0 text-amber-500" />
        <span>
          Messages sent via remote control platforms are stored on third-party servers. Avoid using
          remote control for sessions that handle sensitive credentials.
        </span>
      </div>

      <div className="space-y-5">
        {platforms.map((platform) => (
          <PlatformCard key={platform.id} platform={platform} onRefresh={loadPlatforms} />
        ))}
        {!loading && platforms.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No remote control platforms available.
          </div>
        )}
      </div>
    </div>
  );
};

function PlatformCard({
  platform,
  onRefresh,
}: {
  platform: PlatformStatus;
  onRefresh: () => void;
}) {
  const [botToken, setBotToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [pairing, setPairing] = useState(false);
  const [pairingRequest, setPairingRequest] = useState<
    PlatformStatusEvent["pairingRequest"] | null
  >(null);

  const handleToggle = async (enabled: boolean) => {
    await client.remoteControl.togglePlatform({ platformId: platform.id, enabled });
    onRefresh();
  };

  const handleSaveToken = async () => {
    if (!botToken.trim()) return;
    setSaving(true);
    try {
      await client.remoteControl.configurePlatform({
        platformId: platform.id,
        config: { botToken: botToken.trim(), allowedChatIds: [], enabled: true },
      });
      setBotToken("");
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await client.remoteControl.testConnection({ platformId: platform.id });
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: String(err) });
    } finally {
      setTesting(false);
    }
  };

  const handleStartPairing = async () => {
    setPairing(true);
    setPairingRequest(null);
    try {
      await client.remoteControl.startPairing({ platformId: platform.id });
    } catch {
      setPairing(false);
    }
  };

  const handleApprovePairing = async () => {
    if (!pairingRequest?.chatId) return;
    await client.remoteControl.approvePairing({
      platformId: platform.id,
      chatId: pairingRequest.chatId,
    });
    setPairing(false);
    setPairingRequest(null);
    onRefresh();
  };

  const handleRejectPairing = async () => {
    if (!pairingRequest?.chatId) return;
    await client.remoteControl.rejectPairing({
      platformId: platform.id,
      chatId: pairingRequest.chatId,
    });
    setPairingRequest(null);
  };

  const handleStopPairing = async () => {
    await client.remoteControl.stopPairing({ platformId: platform.id });
    setPairing(false);
    setPairingRequest(null);
  };

  return (
    <SettingsGroup title={platform.displayName}>
      {/* Enable/disable */}
      <SettingsRow title="Enabled" description="Start the bot when Neovate launches">
        <div className="flex items-center gap-3">
          <StatusBadge connected={platform.connected} pairing={platform.pairing} />
          <Switch checked={platform.enabled} onCheckedChange={handleToggle} />
        </div>
      </SettingsRow>

      {/* Bot token */}
      <SettingsRow title="Bot Token" description="From @BotFather on Telegram">
        <div className="flex items-center gap-2">
          <Input
            type="password"
            placeholder={platform.connected ? "••••••••" : "Paste bot token"}
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            className="w-56"
            size="sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveToken}
            disabled={!botToken.trim() || saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </SettingsRow>

      {/* Test connection */}
      {platform.enabled && (
        <SettingsRow title="Connection" description="Verify bot token and connectivity">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleTestConnection} disabled={testing}>
              {testing ? "Testing..." : "Test Connection"}
            </Button>
            {testResult && (
              <span className="text-sm">
                {testResult.ok ? (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle className="size-3.5" /> Connected
                  </span>
                ) : (
                  <span className="text-red-500 flex items-center gap-1">
                    <XCircle className="size-3.5" /> {testResult.error ?? "Failed"}
                  </span>
                )}
              </span>
            )}
          </div>
        </SettingsRow>
      )}

      {/* Pairing */}
      {platform.enabled && platform.connected && (
        <SettingsRow
          title="Pair Chat"
          description="Link a Telegram chat to receive remote control access"
        >
          <div className="flex flex-col gap-2 items-end">
            {!pairing ? (
              <Button size="sm" variant="outline" onClick={handleStartPairing}>
                <Radio className="size-3.5 mr-1.5" />
                Start Pairing
              </Button>
            ) : pairingRequest ? (
              <div className="flex flex-col gap-2 text-sm">
                <span className="text-muted-foreground">
                  Request from <strong>@{pairingRequest.username ?? "unknown"}</strong>
                  {pairingRequest.chatTitle && ` (${pairingRequest.chatTitle})`}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleApprovePairing}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleRejectPairing}>
                    Reject
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Send /start to your bot from Telegram...
                </span>
                <Button size="sm" variant="outline" onClick={handleStopPairing}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </SettingsRow>
      )}
    </SettingsGroup>
  );
}

function StatusBadge({ connected, pairing }: { connected: boolean; pairing: boolean }) {
  if (pairing) {
    return (
      <Badge variant="warning" size="sm">
        Pairing
      </Badge>
    );
  }
  if (connected) {
    return (
      <Badge variant="success" size="sm">
        Connected
      </Badge>
    );
  }
  return <Badge size="sm">Offline</Badge>;
}
