import { accessSync, constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { iMessageDataSchema, type IMessageConversation, type IMessageData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

const dbPath = path.join(os.homedir(), 'Library', 'Messages', 'chat.db');

// Apple's message.date is nanoseconds since 2001-01-01T00:00:00Z (the "Core Data" epoch).
const APPLE_EPOCH_MS = 978307200000;
const SNIPPET_MAX_LENGTH = 120;

/**
 * One most-recent-message-per-chat row, as returned by the query in fetch(). With
 * `readBigInts: true` every integer column comes back as a bigint, not just the date.
 */
export interface RawIMessageRow {
  chatId: bigint;
  displayName: string | null;
  chatIdentifier: string;
  text: string | null;
  isFromMe: bigint;
  dateNs: bigint;
  unreadCount: bigint;
}

function truncate(text: string): string {
  return text.length > SNIPPET_MAX_LENGTH ? `${text.slice(0, SNIPPET_MAX_LENGTH - 1)}…` : text;
}

/** Pure row → schema mapping, kept separate from DB I/O so it can be unit-tested against a fixture. */
export function mapRows(rows: RawIMessageRow[]): IMessageConversation[] {
  return rows.map((row) => {
    // Divide the bigint nanosecond timestamp down to milliseconds before converting to Number —
    // going through Number at nanosecond scale loses precision.
    const dateMs = APPLE_EPOCH_MS + Number(row.dateNs / 1_000_000n);
    return {
      id: row.chatId.toString(),
      label: row.displayName || row.chatIdentifier,
      lastMessage: row.text ? truncate(row.text) : '[message]',
      isFromMe: row.isFromMe !== 0n,
      timestamp: new Date(dateMs).toISOString(),
      unreadCount: Number(row.unreadCount),
    };
  });
}

const CONVERSATIONS_QUERY = `
  SELECT
    c.ROWID AS chatId,
    c.display_name AS displayName,
    c.chat_identifier AS chatIdentifier,
    m.text AS text,
    m.is_from_me AS isFromMe,
    m.date AS dateNs,
    (
      SELECT COUNT(*) FROM message m2
      JOIN chat_message_join cmj2 ON cmj2.message_id = m2.ROWID
      WHERE cmj2.chat_id = c.ROWID AND m2.is_from_me = 0 AND m2.is_read = 0
    ) AS unreadCount
  FROM chat c
  JOIN chat_message_join cmj ON cmj.chat_id = c.ROWID
  JOIN message m ON m.ROWID = cmj.message_id
  WHERE m.ROWID = (
    SELECT MAX(cmj3.message_id) FROM chat_message_join cmj3 WHERE cmj3.chat_id = c.ROWID
  )
  ORDER BY m.date DESC
  LIMIT 15
`;

function isReadable(): boolean {
  try {
    accessSync(dbPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function createIMessageProvider(): Provider<IMessageData> {
  return {
    id: 'imessage',
    schema: iMessageDataSchema,
    refreshMs: 30_000,
    timeoutMs: 5_000,
    // False until Full Disk Access is granted — the widget then shows "not configured" rather
    // than a fetch error. Requires a server restart after granting access (checked once here,
    // at registration, not on every poll — see the scheduler's register()).
    isConfigured: () => process.platform === 'darwin' && isReadable(),
    async fetch(): Promise<IMessageData> {
      // node:sqlite is synchronous — the scheduler's AbortSignal can't interrupt a blocking
      // query, so this stays a small, indexed, LIMIT-bounded read instead of relying on cancellation.
      const db = new DatabaseSync(dbPath, { readOnly: true, readBigInts: true, timeout: 1_000 });
      try {
        const rows = db.prepare(CONVERSATIONS_QUERY).all() as unknown as RawIMessageRow[];
        return { conversations: mapRows(rows) };
      } finally {
        db.close();
      }
    },
  };
}
