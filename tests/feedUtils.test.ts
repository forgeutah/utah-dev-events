import { describe, it, expect } from 'vitest';
import { formatRssDate, formatICalDate } from '../lib/feedUtils';

describe('formatRssDate', () => {
  it('formats date with HH:MM time without Invalid Date', () => {
    const result = formatRssDate('2026-04-07', '18:30');
    expect(result).not.toBe('Invalid Date');
    expect(result).not.toBe('');
    expect(result).toMatch(/2026/);
  });

  it('formats date with HH:MM:SS time (PostgreSQL format)', () => {
    const result = formatRssDate('2026-04-07', '18:30:00');
    expect(result).not.toBe('Invalid Date');
    expect(result).not.toBe('');
    // HH:MM and HH:MM:SS should produce the same result
    expect(result).toBe(formatRssDate('2026-04-07', '18:30'));
  });

  it('defaults to midnight when time is undefined', () => {
    const result = formatRssDate('2026-04-07');
    expect(result).not.toBe('Invalid Date');
    expect(result).not.toBe('');
  });

  it('returns empty string for completely invalid date', () => {
    expect(formatRssDate('not-a-date')).toBe('');
  });

  it('falls back to date-only parse when time causes invalid date', () => {
    const result = formatRssDate('2026-04-07', 'bad-time');
    expect(result).not.toBe('Invalid Date');
    expect(result).not.toBe('');
    expect(result).toMatch(/2026/);
  });
});

describe('formatICalDate', () => {
  it('formats date with HH:MM time', () => {
    expect(formatICalDate('2026-04-07', '18:30')).toBe('20260407T183000');
  });

  it('formats date with HH:MM:SS time (PostgreSQL format)', () => {
    expect(formatICalDate('2026-04-07', '18:30:00')).toBe('20260407T183000');
  });

  it('defaults to midnight when time is undefined', () => {
    expect(formatICalDate('2026-04-07')).toBe('20260407T000000');
  });

  it('handles single-digit hours', () => {
    expect(formatICalDate('2026-04-07', '09:00:00')).toBe('20260407T090000');
  });
});
