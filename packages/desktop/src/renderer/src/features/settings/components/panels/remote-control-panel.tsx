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
  // Telegram fields
  const [botToken, setBotToken] = useState("");
  // DingTalk fields
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [robotCode, setRobotCode] = useState("");
  const [allowFrom, setAllowFrom] = useState("");

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

  const handleSaveDingTalk = async () => {
    if (!appKey.trim() || !appSecret.trim() || !robotCode.trim()) return;
    setSaving(true);
    try {
      await client.remoteControl.configurePlatform({
        platformId: platform.id,
        config: {
          clientId: appKey.trim(),
          clientSecret: appSecret.trim(),
          robotCode: robotCode.trim(),
          allowFrom: allowFrom
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          enabled: true,
        },
      });
      setAppKey("");
      setAppSecret("");
      setRobotCode("");
      setAllowFrom("");
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

  // WeChat fields
  const [wechatAllowFrom, setWechatAllowFrom] = useState("");
  const [wechatSaving, setWechatSaving] = useState(false);

  const handleSaveWechatAllowFrom = async () => {
    setWechatSaving(true);
    try {
      await client.remoteControl.configurePlatform({
        platformId: platform.id,
        config: {
          allowFrom: wechatAllowFrom
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          enabled: true,
        },
      });
      setWechatAllowFrom("");
      onRefresh();
    } finally {
      setWechatSaving(false);
    }
  };

  const isDingTalk = platform.id === "dingtalk";
  const isWeChat = platform.id === "wechat";

  return (
    <SettingsGroup title={platform.displayName}>
      {/* Enable/disable */}
      <SettingsRow
        title={t("settings.remoteControl.enabled")}
        description={t("settings.remoteControl.enabled.description")}
      >
        <div className="flex items-center gap-3">
          <StatusBadge
            connected={platform.connected}
            pairing={platform.pairing}
            error={statusEvent?.status === "error" ? statusEvent.error : undefined}
          />
          <Switch checked={platform.enabled} onCheckedChange={handleToggle} />
        </div>
      </SettingsRow>

      {/* Platform-specific config */}
      {isWeChat ? (
        <>
          {/* WeChat QR login / connect */}
          <SettingsRow
            title={t("settings.remoteControl.wechat.connection")}
            description={t("settings.remoteControl.wechat.connection.description")}
          >
            <div className="flex flex-col gap-3 items-end">
              {pairing ? (
                <div className="flex flex-col gap-2 items-center">
                  {statusEvent?.qrCodeData && !statusEvent?.qrScanned && (
                    <img
                      src={statusEvent.qrCodeData}
                      alt="WeChat QR Code"
                      className="size-48 rounded-lg border"
                    />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {statusEvent?.qrScanned
                      ? t("settings.remoteControl.wechat.qrScanned")
                      : t("settings.remoteControl.wechat.scanQR")}
                  </span>
                  <Button size="sm" variant="outline" onClick={handleStopPairing}>
                    {t("settings.remoteControl.cancel")}
                  </Button>
                </div>
              ) : platform.connected ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle className="size-3.5" />
                    {t("settings.remoteControl.connected")}
                  </span>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={handleStartPairing}>
                  {statusEvent?.error === "session_expired"
                    ? t("settings.remoteControl.wechat.reconnect")
                    : t("settings.remoteControl.wechat.connect")}
                </Button>
              )}
            </div>
          </SettingsRow>

          {/* WeChat allowed senders */}
          {platform.connected && (
            <SettingsRow
              title={t("settings.remoteControl.wechat.allowFrom")}
              description={t("settings.remoteControl.wechat.allowFrom.description")}
            >
              <div className="flex items-center gap-2">
                <Input
                  placeholder={t("settings.remoteControl.wechat.allowFrom.placeholder")}
                  value={wechatAllowFrom}
                  onChange={(e) => setWechatAllowFrom(e.target.value)}
                  className="w-56"
                  size="sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveWechatAllowFrom}
                  disabled={wechatSaving}
                >
                  {wechatSaving
                    ? t("settings.remoteControl.saving")
                    : t("settings.remoteControl.save")}
                </Button>
              </div>
            </SettingsRow>
          )}
        </>
      ) : isDingTalk ? (
        <>
          <SettingsRow
            title={t("settings.remoteControl.dingtalk.appKey")}
            description={t("settings.remoteControl.dingtalk.appKey.description")}
          >
            <Input
              placeholder={
                platform.connected
                  ? t("settings.remoteControl.dingtalk.configured")
                  : t("settings.remoteControl.dingtalk.appKey.placeholder")
              }
              value={appKey}
              onChange={(e) => setAppKey(e.target.value)}
              className="w-56"
              size="sm"
            />
          </SettingsRow>
          <SettingsRow
            title={t("settings.remoteControl.dingtalk.appSecret")}
            description={t("settings.remoteControl.dingtalk.appSecret.description")}
          >
            <Input
              type="password"
              placeholder={
                platform.connected
                  ? t("settings.remoteControl.dingtalk.configured")
                  : t("settings.remoteControl.dingtalk.appSecret.placeholder")
              }
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              className="w-56"
              size="sm"
            />
          </SettingsRow>
          <SettingsRow
            title={t("settings.remoteControl.dingtalk.robotCode")}
            description={t("settings.remoteControl.dingtalk.robotCode.description")}
          >
            <div className="flex items-center gap-2">
              <Input
                placeholder={
                  platform.connected
                    ? t("settings.remoteControl.dingtalk.configured")
                    : t("settings.remoteControl.dingtalk.robotCode.placeholder")
                }
                value={robotCode}
                onChange={(e) => setRobotCode(e.target.value)}
                className="w-56"
                size="sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveDingTalk}
                disabled={!appKey.trim() || !appSecret.trim() || !robotCode.trim() || saving}
              >
                {saving ? t("settings.remoteControl.saving") : t("settings.remoteControl.save")}
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow
            title={t("settings.remoteControl.dingtalk.allowFrom")}
            description={t("settings.remoteControl.dingtalk.allowFrom.description")}
          >
            <Input
              placeholder={t("settings.remoteControl.dingtalk.allowFrom.placeholder")}
              value={allowFrom}
              onChange={(e) => setAllowFrom(e.target.value)}
              className="w-56"
              size="sm"
            />
          </SettingsRow>
        </>
      ) : (
        /* Telegram: Bot token */
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
      )}

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

      {/* Pairing — Telegram only (WeChat handles pairing in its own section) */}
      {!isDingTalk && !isWeChat && platform.enabled && platform.connected && (
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

function StatusBadge({
  connected,
  pairing,
  error,
}: {
  connected: boolean;
  pairing: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  if (error === "session_expired") {
    return (
      <Badge variant="destructive" size="sm">
        {t("settings.remoteControl.status.expired")}
      </Badge>
    );
  }
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
