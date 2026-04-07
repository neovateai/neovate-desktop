const SESSION_TTL = 25 * 60_000; // 25 min (DingTalk webhooks valid ~30 min)
const CLEANUP_INTERVAL = 60_000;

interface SessionInfo {
  url: string;
  expiry: number;
}

export class SessionWebhookStore {
  private sessions = new Map<string, SessionInfo>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
  }

  stop(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.sessions.clear();
  }

  store(chatId: string, webhookUrl: string): void {
    this.sessions.set(chatId, { url: webhookUrl, expiry: Date.now() + SESSION_TTL });
  }

  get(chatId: string): string | null {
    const session = this.sessions.get(chatId);
    if (!session || session.expiry < Date.now()) return null;
    return session.url;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [k, s] of this.sessions) {
      if (s.expiry < now) this.sessions.delete(k);
    }
  }
}
