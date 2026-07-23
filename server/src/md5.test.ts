import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { md5Hex } from './md5.js';

describe('md5Hex', () => {
  it.each([
    '',
    'a',
    'abc',
    'message digest',
    'abcdefghijklmnopqrstuvwxyz',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
    'CannonCardEvolution.png',
    'x'.repeat(1000),
    'ünïcödé and emoji 🔥 test',
  ])('matches node:crypto for %j', (input) => {
    expect(md5Hex(input)).toBe(createHash('md5').update(input).digest('hex'));
  });
});
