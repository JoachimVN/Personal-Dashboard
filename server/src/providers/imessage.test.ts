import { describe, expect, it } from 'vitest';
import { mapRows, type RawIMessageRow } from './imessage.js';

function row(overrides: Partial<RawIMessageRow> = {}): RawIMessageRow {
  return {
    chatId: 1n,
    displayName: null,
    chatIdentifier: '+15551234567',
    text: 'hey, are we still on for tonight?',
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

  it('shows a placeholder when text is null (e.g. attributedBody-only rich messages)', () => {
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
