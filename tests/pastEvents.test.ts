import { describe, it, expect } from 'vitest';
import { todayInDenver, isPastEvent } from '../src/utils/pastEvents';

describe('todayInDenver', () => {
  it('returns yyyy-mm-dd format', () => {
    const date = new Date('2026-04-19T12:00:00Z'); // noon UTC, 6am MDT
    expect(todayInDenver(date)).toBe('2026-04-19');
  });

  it('returns Mountain Time date at 9pm MDT (prevents UTC day-rollover bug)', () => {
    // 2026-04-20 03:00 UTC = 2026-04-19 21:00 MDT (Utah is still April 19)
    const date = new Date('2026-04-20T03:00:00Z');
    expect(todayInDenver(date)).toBe('2026-04-19');
  });

  it('correctly rolls to next day at midnight MDT', () => {
    // 2026-04-20 06:00 UTC = 2026-04-20 00:00 MDT
    const date = new Date('2026-04-20T06:00:00Z');
    expect(todayInDenver(date)).toBe('2026-04-20');
  });

  it('handles DST spring-forward correctly', () => {
    // 2026-03-08 is the second Sunday of March — DST begins 02:00 local.
    // 2026-03-08 10:00 UTC = 04:00 MDT (post-DST).
    const date = new Date('2026-03-08T10:00:00Z');
    expect(todayInDenver(date)).toBe('2026-03-08');
  });

  it('handles DST fall-back correctly', () => {
    // 2026-11-01 is the first Sunday of November — DST ends 02:00 local.
    // 2026-11-01 10:00 UTC = 03:00 MST (post-fallback).
    const date = new Date('2026-11-01T10:00:00Z');
    expect(todayInDenver(date)).toBe('2026-11-01');
  });
});

describe('isPastEvent', () => {
  it('yesterday is past', () => {
    expect(isPastEvent({ event_date: '2026-04-18' }, '2026-04-19')).toBe(true);
  });

  it('today is NOT past (excluded)', () => {
    expect(isPastEvent({ event_date: '2026-04-19' }, '2026-04-19')).toBe(false);
  });

  it('tomorrow is NOT past', () => {
    expect(isPastEvent({ event_date: '2026-04-20' }, '2026-04-19')).toBe(false);
  });
});
