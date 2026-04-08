const MSG_ID_TTL = 5 * 60_000;
const CONTENT_TTL = 5_000;
const OUTBOUND_TTL = 5_000;
const CLEANUP_INTERVAL = 60_000;

export class DedupFilter {
  private processedMsgs = new Map<string, number>();
  private lastInbound = new Map<string, number>();
  private lastOutbound = new Map<string, number>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
  }

  stop(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.processedMsgs.clear();
    this.lastInbound.clear();
    this.lastOutbound.clear();
  }

  /** Returns true if this msgId was already seen. */
  isDuplicateMsg(msgId: string): boolean {
    if (this.processedMsgs.has(msgId)) return true;
    this.processedMsgs.set(msgId, Date.now());
    return false;
  }

  /** Returns true if same content from same sender/chat was seen within 5s. */
  isDuplicateContent(senderId: string, chatId: string, text: string): boolean {
    const key = `${senderId}:${chatId}:${text}`;
    const last = this.lastInbound.get(key);
    if (last && Date.now() - last < CONTENT_TTL) return true;
    this.lastInbound.set(key, Date.now());
    return false;
  }

  /** Returns true if same outbound content was sent to same chatId within 5s. */
  isDuplicateOutbound(chatId: string, content: string): boolean {
    const key = `${chatId}:${content}`;
    const last = this.lastOutbound.get(key);
    if (last && Date.now() - last < OUTBOUND_TTL) return true;
    this.lastOutbound.set(key, Date.now());
    return false;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [k, t] of this.processedMsgs) {
      if (now - t > MSG_ID_TTL) this.processedMsgs.delete(k);
    }
    for (const [k, t] of this.lastInbound) {
      if (now - t > CONTENT_TTL * 2) this.lastInbound.delete(k);
    }
    for (const [k, t] of this.lastOutbound) {
      if (now - t > OUTBOUND_TTL * 2) this.lastOutbound.delete(k);
    }
  }
}
