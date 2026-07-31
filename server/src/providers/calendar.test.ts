import { describe, expect, it } from 'vitest';
import { parseVCardBirthday } from './calendar.js';

describe('parseVCardBirthday', () => {
  it('parses a dashed BDAY with a known year', () => {
    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Thomas Bekkevold Nilsen\nBDAY;value=date:1971-01-22\nEND:VCARD';
    expect(parseVCardBirthday(vcard)).toEqual({ name: 'Thomas Bekkevold Nilsen', month: 1, day: 22, year: 1971 });
  });

  it('parses an undashed BDAY', () => {
    const vcard = 'BEGIN:VCARD\nFN:Brooklyn\nBDAY;value=date:20060831\nEND:VCARD';
    expect(parseVCardBirthday(vcard)).toEqual({ name: 'Brooklyn', month: 8, day: 31, year: 2006 });
  });

  it('parses a year-less BDAY (RFC 6350 "--MM-DD")', () => {
    const vcard = 'BEGIN:VCARD\nFN:Anon\nBDAY;value=date:--03-15\nEND:VCARD';
    expect(parseVCardBirthday(vcard)).toEqual({ name: 'Anon', month: 3, day: 15, year: undefined });
  });

  it('returns undefined when there is no BDAY field', () => {
    const vcard = 'BEGIN:VCARD\nFN:No Birthday\nEND:VCARD';
    expect(parseVCardBirthday(vcard)).toBeUndefined();
  });

  it('returns undefined when there is no FN field', () => {
    const vcard = 'BEGIN:VCARD\nBDAY;value=date:1990-05-01\nEND:VCARD';
    expect(parseVCardBirthday(vcard)).toBeUndefined();
  });

  it('returns undefined for missing data', () => {
    expect(parseVCardBirthday(undefined)).toBeUndefined();
  });
});
