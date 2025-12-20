import { randomUUID } from "node:crypto";

export type BusMessage = {
  id: string;
  from: string;
  to: string;
  topic?: string;
  text: string;
  createdAt: number;
};

const MAX_MESSAGES_PER_INBOX = 200;

export class MessageBus {
  private inboxes = new Map<string, BusMessage[]>();

  send(input: Omit<BusMessage, "id" | "createdAt">): BusMessage {
    const msg: BusMessage = { id: randomUUID(), createdAt: Date.now(), ...input };
    const arr = this.inboxes.get(msg.to) ?? [];
    arr.push(msg);
    if (arr.length > MAX_MESSAGES_PER_INBOX) {
      arr.splice(0, arr.length - MAX_MESSAGES_PER_INBOX);
    }
    this.inboxes.set(msg.to, arr);
    return msg;
  }

  list(to: string, options?: { limit?: number; after?: number }): BusMessage[] {
    const limit = Math.max(1, options?.limit ?? 50);
    const after = options?.after ?? 0;
    const arr = this.inboxes.get(to) ?? [];
    return arr.filter((m) => m.createdAt > after).slice(-limit);
  }

  clear(to: string, upToCreatedAt?: number): number {
    const arr = this.inboxes.get(to) ?? [];
    if (!upToCreatedAt) {
      this.inboxes.delete(to);
      return arr.length;
    }
    const next = arr.filter((m) => m.createdAt > upToCreatedAt);
    this.inboxes.set(to, next);
    return arr.length - next.length;
  }
}

export const messageBus = new MessageBus();
