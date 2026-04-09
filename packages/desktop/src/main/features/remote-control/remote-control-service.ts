import type Store from "electron-store";

import debug from "debug";
import { safeStorage } from "electron";

import type {
  ConversationRef,
  InboundMessage,
  PlatformConfig,
  PlatformStatus,
  PlatformStatusEvent,
  TelegramConfig,
} from "../../../shared/features/remote-control/types";
import type { IStorageService } from "../../core/storage-service";
import type { RequestTracker } from "../agent/request-tracker";
import type { SessionManager } from "../agent/session-manager";
import type { ConfigStore } from "../config/config-store";
import type { ProjectStore } from "../project/project-store";
import type { RemoteControlPlatformAdapter } from "./platforms/types";

import { APP_NAME } from "../../../shared/constants";
import { CommandHandler } from "./command-handler";
import { LinkStore } from "./link-store";
import { PlatformAdapterRegistry } from "./platforms/registry";
import { SessionBridge } from "./session-bridge";

const log = debug("neovate:remote-control");

type StatusListener = (event: PlatformStatusEvent) => void;

export class RemoteControlService {
  readonly registry = new PlatformAdapterRegistry();
  readonly linkStore: LinkStore;
  readonly bridge: SessionBridge;

  private commandHandler: CommandHandler;
  private configStore: Store;
  private statusListeners: StatusListener[] = [];
  private inboundDedup = new Map<string, number>();
  private pairingState = new Map<
    string,
    {
      timeout?: ReturnType<typeof setTimeout>;
      request?: { chatId: string; senderId: string; username?: string; chatTitle?: string };
    }
  >();

  constructor(
    private sessionManager: SessionManager,
    private projectStore: ProjectStore,
    storage: IStorageService,
    requestTracker: RequestTracker,
    appConfigStore: ConfigStore,
  ) {
    this.configStore = storage.scoped("remote-control");
    this.linkStore = new LinkStore(storage.scoped("remote-control-links"));
    this.bridge = new SessionBridge(sessionManager, this.linkStore);
    this.commandHandler = new CommandHandler(
      sessionManager,
      projectStore,
      this.linkStore,
      requestTracker,
      appConfigStore,
      this.bridge,
    );
  }

  registerAdapter(adapter: RemoteControlPlatformAdapter): void {
    this.registry.register(adapter);
    log("registered adapter: %s", adapter.id);
  }

  /** Start all adapters that have valid config and are enabled. Non-blocking. */
  async startEnabledAdapters(): Promise<void> {
    for (const adapter of this.registry.getAll()) {
      const config = this.loadConfig(adapter.id);
      if (config?.enabled) {
        try {
          await this.startAdapter(adapter, config);
          this.restoreLinks(adapter);
        } catch (err) {
          log("failed to start adapter %s: %O", adapter.id, err);
          this.emitStatus({ platformId: adapter.id, status: "error", error: String(err) });
        }
      }
    }
  }

  /** Notify all linked conversations that the app is shutting down. */
  async notifyShutdown(): Promise<void> {
    const links = this.linkStore.getAllLinks();
    for (const link of links) {
      const adapter = this.registry.get(link.ref.platformId);
      if (adapter?.isRunning()) {
        try {
          await adapter.sendMessage({ ref: link.ref, text: `${APP_NAME} going offline.` });
        } catch {
          // Best effort
        }
      }
    }
  }

  /** Stop all running adapters. */
  async stopAll(): Promise<void> {
    this.bridge.dispose();
    for (const adapter of this.registry.getAll()) {
      if (adapter.isRunning()) {
        try {
          await adapter.stop();
        } catch (err) {
          log("error stopping adapter %s: %O", adapter.id, err);
        }
      }
    }
  }

  /** Called when config changes from the router. Restarts the affected adapter. */
  async onConfigChanged(platformId: string): Promise<void> {
    const config = this.loadConfig(platformId);
    const adapter = this.registry.get(platformId);
    if (!adapter) return;

    if (!config?.enabled) {
      if (adapter.isRunning()) await this.stopAdapter(adapter);
      this.emitStatus({ platformId, status: "disconnected" });
      return;
    }

    // Restart
    if (adapter.isRunning()) await this.stopAdapter(adapter);
    try {
      await this.startAdapter(adapter, config);
    } catch (err) {
      log("restart failed for %s: %O", platformId, err);
      this.emitStatus({ platformId, status: "error", error: String(err) });
    }
  }

  // ── Pairing ──

  async startPairing(platformId: string): Promise<void> {
    const adapter = this.registry.get(platformId);
    if (!adapter) throw new Error(`Unknown platform: ${platformId}`);

    adapter.enterPairingMode();

    // Stop and restart in pairing mode
    if (adapter.isRunning()) await this.stopAdapter(adapter);

    const config = this.loadConfig(platformId) ?? { enabled: true };
    await this.startAdapter(adapter, config);

    // Auto-cancel after 5 minutes
    const timeout = setTimeout(() => {
      void this.stopPairing(platformId);
    }, 5 * 60_000);
    this.pairingState.set(platformId, { timeout });
    this.emitStatus({ platformId, status: "pairing" });
    log("pairing started for %s (5min timeout)", platformId);
  }

  async stopPairing(platformId: string): Promise<void> {
    log("pairing stopped for %s", platformId);
    const state = this.pairingState.get(platformId);
    if (state?.timeout) clearTimeout(state.timeout);
    this.pairingState.delete(platformId);

    const adapter = this.registry.get(platformId);
    if (!adapter) return;

    adapter.exitPairingMode();

    // Restart in normal mode if config exists and is enabled
    if (adapter.isRunning()) await this.stopAdapter(adapter);
    const config = this.loadConfig(platformId);
    if (config?.enabled) {
      await this.startAdapter(adapter, config);
    }
  }

  async approvePairing(platformId: string, chatId: string): Promise<void> {
    const config = this.loadConfig(platformId) as TelegramConfig | null;
    if (!config) throw new Error(`No config for platform: ${platformId}`);

    // Add chat to allowed list
    const allowed = new Set(config.allowedChatIds);
    allowed.add(chatId);
    config.allowedChatIds = [...allowed];
    this.saveConfig(platformId, config);
    log("pairing approved: %s chat %s (total allowed: %d)", platformId, chatId, allowed.size);

    // Send confirmation
    const adapter = this.registry.get(platformId);
    if (adapter?.isRunning()) {
      try {
        await adapter.sendMessage({
          ref: { platformId, chatId },
          text: "Paired successfully! Use /help to get started.",
        });
      } catch {
        // Best effort
      }
    }

    // Exit pairing mode
    await this.stopPairing(platformId);
  }

  async rejectPairing(platformId: string, chatId: string): Promise<void> {
    const adapter = this.registry.get(platformId);
    if (adapter?.isRunning()) {
      try {
        await adapter.sendMessage({
          ref: { platformId, chatId },
          text: "Pairing request rejected.",
        });
      } catch {
        // Best effort
      }
    }
    // Stay in pairing mode — keep listening for other chats
    log("pairing rejected: %s chat %s", platformId, chatId);
  }

  // ── Test Connection ──

  async testConnection(
    platformId: string,
  ): Promise<{ ok: boolean; error?: string; botUsername?: string }> {
    const config = this.loadConfig(platformId);
    if (!config) return { ok: false, error: "No configuration found" };

    const adapter = this.registry.get(platformId);
    if (!adapter) return { ok: false, error: "Unknown platform" };

    // For Telegram, we can test by trying to start and immediately get bot info
    // This is adapter-specific; for now we check if the adapter is running
    if (adapter.isRunning()) {
      return { ok: true };
    }

    return { ok: false, error: "Adapter is not running" };
  }

  // ── Status ──

  getPlatforms(): PlatformStatus[] {
    return this.registry.getAll().map((adapter) => {
      const pState = this.pairingState.get(adapter.id);
      return {
        id: adapter.id,
        displayName: adapter.displayName,
        enabled: this.loadConfig(adapter.id)?.enabled ?? false,
        connected: adapter.isRunning(),
        pairing: !!pState,
        pairingRequest: pState?.request,
      };
    });
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  // ── Config ──

  loadConfig(platformId: string): PlatformConfig | null {
    const raw = this.configStore.get(platformId) as Record<string, unknown> | undefined;
    if (!raw) return null;

    if (safeStorage.isEncryptionAvailable()) {
      // Decrypt bot token (Telegram)
      if (typeof raw.encryptedToken === "string") {
        try {
          raw.botToken = safeStorage.decryptString(
            Buffer.from(raw.encryptedToken as string, "base64"),
          );
        } catch {
          log("failed to decrypt token for %s", platformId);
        }
      }
      // Decrypt client secret (DingTalk)
      if (typeof raw.encryptedSecret === "string") {
        try {
          raw.clientSecret = safeStorage.decryptString(
            Buffer.from(raw.encryptedSecret as string, "base64"),
          );
        } catch {
          log("failed to decrypt secret for %s", platformId);
        }
      }
      // Decrypt WeChat token
      if (typeof raw.encryptedWechatToken === "string") {
        try {
          raw.token = safeStorage.decryptString(
            Buffer.from(raw.encryptedWechatToken as string, "base64"),
          );
        } catch {
          log("failed to decrypt wechat token for %s", platformId);
        }
      }
    }

    return raw as PlatformConfig;
  }

  saveConfig(platformId: string, config: Record<string, unknown>): void {
    const toStore = { ...config };

    if (safeStorage.isEncryptionAvailable()) {
      // Encrypt bot token (Telegram)
      if (typeof toStore.botToken === "string") {
        toStore.encryptedToken = safeStorage
          .encryptString(toStore.botToken as string)
          .toString("base64");
        delete toStore.botToken;
      }
      // Encrypt client secret (DingTalk)
      if (typeof toStore.clientSecret === "string") {
        toStore.encryptedSecret = safeStorage
          .encryptString(toStore.clientSecret as string)
          .toString("base64");
        delete toStore.clientSecret;
      }
      // Encrypt WeChat token
      if (typeof toStore.token === "string" && platformId === "wechat") {
        toStore.encryptedWechatToken = safeStorage
          .encryptString(toStore.token as string)
          .toString("base64");
        delete toStore.token;
      }
    }

    this.configStore.set(platformId, toStore);
  }

  getPlatformConfig(platformId: string): PlatformConfig {
    const config = this.loadConfig(platformId);
    if (!config) return { enabled: false };

    // Strip sensitive fields for renderer
    const safe = { ...config };
    delete (safe as any).botToken;
    delete (safe as any).encryptedToken;
    delete (safe as any).clientSecret;
    delete (safe as any).encryptedSecret;
    delete (safe as any).token;
    delete (safe as any).encryptedWechatToken;
    return safe;
  }

  // ── Internal ──

  private async startAdapter(
    adapter: RemoteControlPlatformAdapter,
    config: PlatformConfig,
  ): Promise<void> {
    adapter.removeAllListeners();
    adapter.on("message", (msg) => void this.onMessage(adapter, msg));
    adapter.on("callback", (msg) => void this.onCallback(adapter, msg));
    adapter.on("error", (err) => {
      log("adapter error %s: %O", adapter.id, err);
      this.emitStatus({ platformId: adapter.id, status: "error", error: err.message });
    });
    adapter.on("pairing-request", (req) => {
      const state = this.pairingState.get(adapter.id);
      if (state) {
        state.request = req;
      }
      this.emitStatus({
        platformId: adapter.id,
        status: "pairing-request",
        pairingRequest: req,
      });
    });
    adapter.on("config-update", (config) => {
      this.saveConfig(adapter.id, config);
      log("config-update from adapter %s", adapter.id);
    });
    adapter.on("status", (event) => {
      this.emitStatus(event);
    });

    await adapter.start(config);
    log("started adapter: %s", adapter.id);
    this.emitStatus({ platformId: adapter.id, status: "connected" });
  }

  private async stopAdapter(adapter: RemoteControlPlatformAdapter): Promise<void> {
    await adapter.stop();
    log("stopped adapter: %s", adapter.id);
  }

  private isDuplicateInbound(adapter: RemoteControlPlatformAdapter, msg: InboundMessage): boolean {
    const now = Date.now();
    for (const [k, t] of this.inboundDedup) {
      if (now - t > 2000) this.inboundDedup.delete(k);
    }
    const identity = msg.callbackData ?? msg.text.slice(0, 80);
    const dedupKey = `${adapter.id}:${msg.ref.chatId}:${msg.timestamp}:${identity}`;
    if (this.inboundDedup.has(dedupKey)) {
      log("suppressed duplicate inbound: platform=%s chat=%s", adapter.id, msg.ref.chatId);
      return true;
    }
    this.inboundDedup.set(dedupKey, now);
    return false;
  }

  private async onMessage(
    adapter: RemoteControlPlatformAdapter,
    msg: InboundMessage,
  ): Promise<void> {
    if (this.isDuplicateInbound(adapter, msg)) return;
    log(
      "inbound message: platform=%s chat=%s text=%s",
      adapter.id,
      msg.ref.chatId,
      msg.text.slice(0, 80),
    );

    // Try command first
    const cmdResult = await this.commandHandler.handle(msg);
    if (cmdResult) {
      await adapter.sendMessage({
        ref: msg.ref,
        text: cmdResult.text,
        inlineActions: cmdResult.actions,
      });
      return;
    }

    // Forward to linked session
    const sessionId = this.linkStore.getSessionId(msg.ref);
    if (!sessionId) {
      await adapter.sendMessage({
        ref: msg.ref,
        text: "No active session linked to this chat. Use /chats to pick one.",
      });
      return;
    }

    // Verify session still exists
    const sessions = this.sessionManager.getActiveSessions();
    if (!sessions.some((s) => s.sessionId === sessionId)) {
      this.linkStore.remove(msg.ref);
      await adapter.sendMessage({
        ref: msg.ref,
        text: "Linked session no longer exists. Use /chats to pick a new one.",
      });
      return;
    }

    await this.bridge.sendToSession(sessionId, msg);
  }

  private async onCallback(
    adapter: RemoteControlPlatformAdapter,
    msg: InboundMessage,
  ): Promise<void> {
    if (this.isDuplicateInbound(adapter, msg)) return;
    if (!msg.callbackData) return;

    const [domain, action, ...idParts] = msg.callbackData.split(":");
    const id = idParts.join(":");
    log("callback: %s:%s id=%s chat=%s", domain, action, id, msg.ref.chatId);

    switch (domain) {
      case "session":
        await this.handleSessionCallback(adapter, msg.ref, action, id);
        break;
      case "project":
        await this.handleProjectCallback(adapter, msg.ref, action, id);
        break;
      case "perm":
        await this.handlePermCallback(adapter, msg.ref, action, id);
        break;
      default:
        log("unknown callback domain: %s", domain);
    }
  }

  private async handleSessionCallback(
    adapter: RemoteControlPlatformAdapter,
    ref: ConversationRef,
    action: string,
    id: string,
  ): Promise<void> {
    if (action === "unlink") {
      const sessionId = this.linkStore.getSessionId(ref);
      if (sessionId) {
        this.bridge.unsubscribeSession(sessionId);
        this.linkStore.remove(ref);
      }
      // Auto-respond with /chats list
      const cmdResult = await this.commandHandler.handle({
        ref,
        senderId: "",
        text: "/chats",
        timestamp: Date.now(),
      });
      if (cmdResult) {
        await adapter.sendMessage({
          ref,
          text: `Session unlinked.\n\n${cmdResult.text}`,
          inlineActions: cmdResult.actions,
        });
      } else {
        await adapter.sendMessage({ ref, text: "Session unlinked." });
      }
      return;
    }

    if (action === "select") {
      // Link conversation to session
      this.linkStore.save(ref, id);
      this.bridge.subscribeSession(id, ref, adapter);

      const sessions = this.sessionManager.getActiveSessions();
      const session = sessions.find((s) => s.sessionId === id);
      const cwdLabel = session?.cwd ?? "unknown";

      await adapter.sendMessage({
        ref,
        text: `Linked to session in: ${cwdLabel}\nSend a message to continue.`,
      });
    } else if (action === "new") {
      // Create new session in a project
      const project = this.projectStore.getAll().find((p) => p.id === id);
      if (!project) {
        await adapter.sendMessage({ ref, text: "Project not found." });
        return;
      }

      try {
        const result = await this.sessionManager.createSession(
          project.path,
          undefined,
          undefined,
          "remote-control",
        );
        const sessionId = result.sessionId;
        this.linkStore.save(ref, sessionId);
        this.bridge.subscribeSession(sessionId, ref, adapter);

        await adapter.sendMessage({
          ref,
          text: `New session created in: ${project.path}\nSession linked. Send a message to start.`,
        });
      } catch (err) {
        log("failed to create session: %O", err);
        await adapter.sendMessage({
          ref,
          text: `Failed to create session: ${err}`,
        });
      }
    }
  }

  private async handleProjectCallback(
    adapter: RemoteControlPlatformAdapter,
    ref: ConversationRef,
    action: string,
    id: string,
  ): Promise<void> {
    if (action === "select") {
      // Show sessions for this project, or option to create new
      const project = this.projectStore.getAll().find((p) => p.id === id);
      if (!project) {
        await adapter.sendMessage({ ref, text: "Project not found." });
        return;
      }

      const sessions = this.sessionManager
        .getActiveSessions()
        .filter((s) => s.cwd === project.path);

      if (sessions.length > 0) {
        await adapter.sendMessage({
          ref,
          text: `Sessions in ${project.path}:`,
          inlineActions: [
            ...sessions.map((s) => ({
              label: `Session ${s.sessionId.slice(0, 8)}`,
              callbackData: `session:select:${s.sessionId}`,
            })),
            { label: "New session", callbackData: `session:new:${id}` },
          ],
        });
      } else {
        await adapter.sendMessage({
          ref,
          text: `No sessions in ${project.path}. Create one?`,
          inlineActions: [{ label: "Create", callbackData: `session:new:${id}` }],
        });
      }
    }
  }

  private async handlePermCallback(
    _adapter: RemoteControlPlatformAdapter,
    ref: ConversationRef,
    action: string,
    requestId: string,
  ): Promise<void> {
    const sessionId = this.linkStore.getSessionId(ref);
    if (!sessionId) return;

    const allow = action === "approve";
    await this.bridge.respondToPermission(sessionId, requestId, allow);
  }

  private restoreLinks(adapter: RemoteControlPlatformAdapter): void {
    const links = this.linkStore.getAllLinks().filter((l) => l.ref.platformId === adapter.id);
    const activeSessions = this.sessionManager.getActiveSessions();

    for (const link of links) {
      const isActive = activeSessions.some((s) => s.sessionId === link.sessionId);
      if (isActive) {
        this.bridge.subscribeSession(link.sessionId, link.ref, adapter);
        void adapter
          .sendMessage({ ref: link.ref, text: `${APP_NAME} back online. Session reconnected.` })
          .catch(() => {});
        log("restored link: %s -> %s", link.ref.chatId, link.sessionId);
      } else {
        this.linkStore.remove(link.ref);
        log("removed stale link: %s -> %s", link.ref.chatId, link.sessionId);
      }
    }
  }

  private emitStatus(event: PlatformStatusEvent): void {
    for (const listener of this.statusListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}
