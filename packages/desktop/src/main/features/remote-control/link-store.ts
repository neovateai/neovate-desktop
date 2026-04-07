import type Store from "electron-store";

import debug from "debug";

import type { ConversationRef, PersistedLink } from "../../../shared/features/remote-control/types";

const log = debug("neovate:remote-control:links");

const LINKS_KEY = "links";

function refKey(ref: ConversationRef): string {
  return `${ref.platformId}:${ref.chatId}:${ref.threadId ?? ""}`;
}

export class LinkStore {
  private links = new Map<string, PersistedLink>();
  private sessionIndex = new Map<string, string>(); // sessionId -> refKey

  constructor(private store: Store) {
    this.load();
  }

  private load(): void {
    const persisted = (this.store.get(LINKS_KEY) ?? []) as PersistedLink[];
    for (const link of persisted) {
      const key = refKey(link.ref);
      this.links.set(key, link);
      this.sessionIndex.set(link.sessionId, key);
    }
    log("loaded %d persisted links", persisted.length);
  }

  private persist(): void {
    this.store.set(LINKS_KEY, [...this.links.values()]);
  }

  save(ref: ConversationRef, sessionId: string): void {
    // Remove any existing link for this conversation
    const key = refKey(ref);
    const existing = this.links.get(key);
    if (existing) {
      this.sessionIndex.delete(existing.sessionId);
    }

    // Remove any existing link for this session (one session = one conversation)
    const existingKey = this.sessionIndex.get(sessionId);
    if (existingKey) {
      this.links.delete(existingKey);
    }

    const link: PersistedLink = { ref, sessionId, linkedAt: Date.now() };
    this.links.set(key, link);
    this.sessionIndex.set(sessionId, key);
    this.persist();
    log("saved link: %s -> session %s", key, sessionId);
  }

  remove(ref: ConversationRef): void {
    const key = refKey(ref);
    const link = this.links.get(key);
    if (link) {
      this.sessionIndex.delete(link.sessionId);
      this.links.delete(key);
      this.persist();
      log("removed link: %s (was session %s)", key, link.sessionId);
    }
  }

  removeBySessionId(sessionId: string): void {
    const key = this.sessionIndex.get(sessionId);
    if (key) {
      this.links.delete(key);
      this.sessionIndex.delete(sessionId);
      this.persist();
      log("removed link by sessionId: %s (was %s)", sessionId, key);
    }
  }

  getSessionId(ref: ConversationRef): string | null {
    return this.links.get(refKey(ref))?.sessionId ?? null;
  }

  getRef(sessionId: string): ConversationRef | null {
    const key = this.sessionIndex.get(sessionId);
    if (!key) return null;
    return this.links.get(key)?.ref ?? null;
  }

  getAllLinks(): PersistedLink[] {
    return [...this.links.values()];
  }
}
