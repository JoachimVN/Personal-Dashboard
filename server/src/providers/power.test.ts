import { describe, expect, it } from 'vitest';
import { mapPriceHours, priceDayPath } from './power.js';

const osloHourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hour12: false });
const osloDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' });

describe('mapPriceHours', () => {
  it('labels each hour in the dashboard timezone', () => {
    const hours = mapPriceHours(
      [
        { NOK_per_kWh: 0.83721, time_start: '2026-07-18T00:00:00+02:00' },
        { NOK_per_kWh: 0.92086, time_start: '2026-07-18T07:00:00+02:00' },
      ],
      osloHourFmt,
    );
    expect(hours).toEqual([
      { time: '2026-07-18T00:00:00+02:00', hourLabel: '00', priceNokPerKwh: 0.83721 },
      { time: '2026-07-18T07:00:00+02:00', hourLabel: '07', priceNokPerKwh: 0.92086 },
    ]);
  });
});

describe('priceDayPath', () => {
  it('splits the local date into hvakosterstrommen path segments', () => {
    expect(priceDayPath(new Date('2026-07-18T12:00:00+02:00'), osloDateFmt, 'NO3')).toBe('2026/07-18_NO3.json');
  });

  it('uses the Oslo-local date, not UTC, near midnight', () => {
    // 23:30 UTC on the 18th is already the 19th in Oslo (summer, UTC+2).
    expect(priceDayPath(new Date('2026-07-18T23:30:00Z'), osloDateFmt, 'NO1')).toBe('2026/07-19_NO1.json');
  });
});
