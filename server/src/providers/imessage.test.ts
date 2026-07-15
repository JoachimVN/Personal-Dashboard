import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  CONVERSATIONS_QUERY,
  createContactResolver,
  decodeAttributedBody,
  mapRows,
  type RawContactRow,
  type RawIMessageRow,
} from './imessage.js';

function row(overrides: Partial<RawIMessageRow> = {}): RawIMessageRow {
  return {
    chatId: 1n,
    displayName: null,
    chatIdentifier: '+15551234567',
    text: 'hey, are we still on for tonight?',
    attributedBody: null,
    isFromMe: 0n,
    // 2024-01-01T00:00:00Z in nanoseconds since the Apple/Core Data epoch (2001-01-01T00:00:00Z).
    dateNs: 725760000000000000n,
    unreadCount: 2n,
    ...overrides,
  };
}

describe('mapRows', () => {
  it('prefers the chat display name, falling back to the raw handle', () => {
    expect(mapRows([row({ displayName: 'Group Chat' })])[0].label).toBe('Group Chat');
    expect(mapRows([row({ displayName: null })])[0].label).toBe('+15551234567');
  });

  it('converts the bigint nanosecond timestamp to an ISO string without losing precision', () => {
    expect(mapRows([row()])[0].timestamp).toBe('2024-01-01T00:00:00.000Z');
  });

  it('decodes attributedBody when the plain-text column is null', () => {
    const attributedBody = typedStream('still on for tonight?');
    expect(mapRows([row({ text: null, attributedBody })])[0].lastMessage).toBe('still on for tonight?');
  });

  it('labels the object replacement character as an attachment', () => {
    const attributedBody = typedStream('\uFFFC');
    expect(mapRows([row({ text: null, attributedBody })])[0].lastMessage).toBe('[attachment]');
  });

  it('shows a placeholder when neither text representation can be decoded', () => {
    expect(mapRows([row({ text: null })])[0].lastMessage).toBe('[message]');
  });

  it('truncates long snippets', () => {
    const long = 'a'.repeat(200);
    const mapped = mapRows([row({ text: long })])[0].lastMessage;
    expect(mapped.length).toBeLessThan(200);
    expect(mapped.endsWith('…')).toBe(true);
  });

  it('maps bigint isFromMe/unreadCount to boolean/number', () => {
    const mapped = mapRows([row({ isFromMe: 1n, unreadCount: 0n })])[0];
    expect(mapped.isFromMe).toBe(true);
    expect(mapped.unreadCount).toBe(0);
  });
});

describe('conversation query', () => {
  it('previews the newest unread incoming message instead of a later sent reply', () => {
    const db = new DatabaseSync(':memory:', { readBigInts: true });
    try {
      db.exec(`
        CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, display_name TEXT, chat_identifier TEXT);
        CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, attributedBody BLOB, is_from_me INTEGER, date INTEGER, is_read INTEGER);
        CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
        INSERT INTO chat VALUES (1, NULL, '+15550100000');
        INSERT INTO message VALUES (1, 'Meet at the library?', NULL, 0, 725760000000000000, 0);
        INSERT INTO message VALUES (2, 'Sounds good', NULL, 1, 725760060000000000, 1);
        INSERT INTO chat_message_join VALUES (1, 1);
        INSERT INTO chat_message_join VALUES (1, 2);
      `);

      const result = db.prepare(CONVERSATIONS_QUERY).get() as unknown as RawIMessageRow;
      expect(result.text).toBe('Meet at the library?');
      expect(result.isFromMe).toBe(0n);
      expect(result.unreadCount).toBe(1n);
    } finally {
      db.close();
    }
  });
});

function typedStream(text: string): Uint8Array {
  const payload = Buffer.from(text);
  const length = payload.length < 0x80
    ? Buffer.from([payload.length])
    : Buffer.from([0x81, payload.length & 0xff, payload.length >> 8]);
  return Buffer.concat([
    Buffer.from('040bstreamtyped'),
    Buffer.from('NSString'),
    Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
    length,
    payload,
  ]);
}

function contact(overrides: Partial<RawContactRow> = {}): RawContactRow {
  return {
    handle: '+1 (555) 123-4567',
    firstName: 'Ada',
    middleName: null,
    lastName: 'Lovelace',
    nickname: null,
    organization: null,
    name: null,
    ...overrides,
  };
}

describe('decodeAttributedBody', () => {
  it('decodes short UTF-8 NSString payloads', () => {
    expect(decodeAttributedBody(typedStream('Hei 👋'))).toBe('Hei 👋');
  });

  it('decodes multi-byte typedstream lengths', () => {
    const text = 'a'.repeat(200);
    expect(decodeAttributedBody(typedStream(text))).toBe(text);
  });

  it('finds the payload after an earlier NSString class marker', () => {
    const body = Buffer.concat([
      Buffer.from('NSString'),
      Buffer.from([0x00, 0x84, 0x84]),
      typedStream('actual message'),
    ]);
    expect(decodeAttributedBody(body)).toBe('actual message');
  });
});

describe('createContactResolver', () => {
  it('resolves formatted phone numbers and email addresses', () => {
    const resolve = createContactResolver([
      contact(),
      contact({ handle: 'ada@example.com' }),
    ]);
    expect(resolve('+15551234567')).toBe('Ada Lovelace');
    expect(resolve('ADA@example.com')).toBe('Ada Lovelace');
  });

  it('matches a country-prefixed Messages handle to a local eight-digit number', () => {
    const resolve = createContactResolver([
      contact({ handle: '99 88 77 66', firstName: 'Jo', lastName: null }),
    ]);
    expect(resolve('+47 998 87 766')).toBe('Jo');
  });

  it('does not use an ambiguous phone suffix', () => {
    const resolve = createContactResolver([
      contact({ handle: '+47 998 87 766', firstName: 'First', lastName: null }),
      contact({ handle: '+1 998 87 766', firstName: 'Second', lastName: null }),
    ]);
    expect(resolve('99887766')).toBeUndefined();
  });

  it('prefers the fuller name when the same number is duplicated across synced Contacts sources', () => {
    const resolve = createContactResolver([
      contact({ handle: '+47 998 87 766', firstName: 'Ada', lastName: null }),
      contact({ handle: '+4799887766', firstName: 'Ada', lastName: 'Lovelace' }),
    ]);
    expect(resolve('+4799887766')).toBe('Ada Lovelace');
  });

  it('uses organization names when a personal name is unavailable', () => {
    const resolve = createContactResolver([
      contact({ firstName: null, lastName: null, organization: 'Example AS' }),
    ]);
    expect(resolve('+15551234567')).toBe('Example AS');
  });
});
