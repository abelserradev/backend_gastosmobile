import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

interface SessionRecord {
  userId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  updatedAt: number;
}

const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGES = 20;
const MAX_SESSIONS_PER_USER = 5;

@Injectable()
export class ChatSessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  appendMessage(
    userId: string,
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): void {
    this.purgeExpired();
    const key = this.key(userId, sessionId);
    let record = this.sessions.get(key);
    if (!record) {
      record = { userId, messages: [], updatedAt: Date.now() };
      this.sessions.set(key, record);
      this.enforceUserLimit(userId);
    }
    record.messages.push({ role, content });
    if (record.messages.length > MAX_MESSAGES) {
      record.messages = record.messages.slice(-MAX_MESSAGES);
    }
    record.updatedAt = Date.now();
  }

  getMessages(userId: string, sessionId: string): SessionRecord['messages'] {
    this.purgeExpired();
    return this.sessions.get(this.key(userId, sessionId))?.messages ?? [];
  }

  createSessionId(): string {
    return randomUUID();
  }

  private key(userId: string, sessionId: string): string {
    return `${userId}:${sessionId}`;
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.sessions.entries()) {
      if (now - record.updatedAt > TTL_MS) {
        this.sessions.delete(key);
      }
    }
  }

  private enforceUserLimit(userId: string): void {
    const keys = [...this.sessions.keys()].filter((k) =>
      k.startsWith(`${userId}:`),
    );
    if (keys.length <= MAX_SESSIONS_PER_USER) {
      return;
    }
    keys
      .map((k) => ({ k, t: this.sessions.get(k)?.updatedAt ?? 0 }))
      .sort((a, b) => a.t - b.t)
      .slice(0, keys.length - MAX_SESSIONS_PER_USER)
      .forEach(({ k }) => this.sessions.delete(k));
  }
}
