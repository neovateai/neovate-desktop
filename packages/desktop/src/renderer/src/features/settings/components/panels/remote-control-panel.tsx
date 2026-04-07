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
  const [statusEvents, setStatusEvents] = useState<Record<string, PlatformStatusEvent>>({});

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

  // Single subscription for all platform status events
  useEffect(() => {
    let iter: AsyncIterableIterator<PlatformStatusEvent> | undefined;
    let cancelled = false;

    (async () => {
      try {
        iter = await client.remoteControl.subscribeStatus();
        for await (const event of iter) {
          if (cancelled) break;
          setStatusEvents((prev) => ({ ...prev, [event.platformId]: event }));
        }
      } catch {
        // Connection lost — refresh to get latest state
        void loadPlatforms();
      }
    })();

    return () => {
      cancelled = true;
      iter?.return?.(undefined);
    };
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
        <span>{t("settings.remoteControl.securityWarning")}</span>
      </div>

      <div className="space-y-5">
        {platforms.map((platform) => (
          <PlatformCard
            key={platform.id}
            platform={platform}
            statusEvent={statusEvents[platform.id]}
            onRefresh={loadPlatforms}
          />
        ))}
        {!loading && platforms.length === 0 && (
          <div className="text-sm text-muted-foreground">
            {t("settings.remoteControl.noPlatforms")}
          </div>
        )}
      </div>
    </div>
  );
};

function PlatformCard({
  platform,
  statusEvent,
  onRefresh,
}: {
  platform: PlatformStatus;
  statusEvent?: PlatformStatusEvent;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [botToken, setBotToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [pairing, setPairing] = useState(platform.pairing);
  const [pairingRequest, setPairingRequest] = useState<
    PlatformStatusEvent["pairingRequest"] | null
  >(platform.pairingRequest ?? null);

  // React to real-time status events
  useEffect(() => {
    if (!statusEvent) return;

    switch (statusEvent.status) {
      case "pairing-request":
        setPairingRequest(statusEvent.pairingRequest ?? null);
        break;
      case "pairing":
        setPairing(true);
        break;
      case "connected":
        setPairing(false);
        setPairingRequest(null);
        onRefresh();
        break;
      case "disconnected":
      case "error":
        setPairing(false);
        setPairingRequest(null);
        onRefresh();
        break;
    }
  }, [statusEvent, onRefresh]);

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
      <SettingsRow
        title={t("settings.remoteControl.enabled")}
        description={t("settings.remoteControl.enabled.description")}
      >
        <div className="flex items-center gap-3">
          <StatusBadge connected={platform.connected} pairing={platform.pairing} />
          <Switch checked={platform.enabled} onCheckedChange={handleToggle} />
        </div>
      </SettingsRow>

      {/* Bot token */}
      <SettingsRow
        title={t("settings.remoteControl.botToken")}
        description={t("settings.remoteControl.botToken.description")}
      >
        <div className="flex items-center gap-2">
          <Input
            type="password"
            placeholder={
              platform.connected
                ? t("settings.remoteControl.botToken.configured")
                : t("settings.remoteControl.botToken.placeholder")
            }
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
            {saving ? t("settings.remoteControl.saving") : t("settings.remoteControl.save")}
          </Button>
        </div>
      </SettingsRow>

      {/* Test connection */}
      {platform.enabled && (
        <SettingsRow
          title={t("settings.remoteControl.connection")}
          description={t("settings.remoteControl.connection.description")}
        >
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleTestConnection} disabled={testing}>
              {testing
                ? t("settings.remoteControl.testing")
                : t("settings.remoteControl.testConnection")}
            </Button>
            {testResult && (
              <span className="text-sm">
                {testResult.ok ? (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle className="size-3.5" /> {t("settings.remoteControl.connected")}
                  </span>
                ) : (
                  <span className="text-red-500 flex items-center gap-1">
                    <XCircle className="size-3.5" />{" "}
                    {testResult.error ?? t("settings.remoteControl.failed")}
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
          title={t("settings.remoteControl.pairChat")}
          description={t("settings.remoteControl.pairChat.description")}
        >
          <div className="flex flex-col gap-2 items-end">
            {!pairing ? (
              <Button size="sm" variant="outline" onClick={handleStartPairing}>
                <Radio className="size-3.5 mr-1.5" />
                {t("settings.remoteControl.startPairing")}
              </Button>
            ) : pairingRequest ? (
              <div className="flex flex-col gap-2 text-sm">
                <span className="text-muted-foreground">
                  {t("settings.remoteControl.pairingRequest")}{" "}
                  <strong>@{pairingRequest.username ?? "unknown"}</strong>
                  {pairingRequest.chatTitle && ` (${pairingRequest.chatTitle})`}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleApprovePairing}>
                    {t("settings.remoteControl.approve")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleRejectPairing}>
                    {t("settings.remoteControl.reject")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {t("settings.remoteControl.pairingInstruction")}
                </span>
                <Button size="sm" variant="outline" onClick={handleStopPairing}>
                  {t("settings.remoteControl.cancel")}
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
  const { t } = useTranslation();
  if (pairing) {
    return (
      <Badge variant="warning" size="sm">
        {t("settings.remoteControl.status.pairing")}
      </Badge>
    );
  }
  if (connected) {
    return (
      <Badge variant="success" size="sm">
        {t("settings.remoteControl.status.connected")}
      </Badge>
    );
  }
  return <Badge size="sm">{t("settings.remoteControl.status.offline")}</Badge>;
}
