import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { isOnlineEvent, categorizeEventByRegion } from '../lib/locationUtils';

let events: any[] = [];

beforeAll(async () => {
  const raw = await fs.readFile(path.resolve(__dirname, './fixtures/events.fixture.json'), 'utf-8');
  events = JSON.parse(raw);
});

describe('locationUtils tests using real events from events.fixture.json', () => {
  it('classifies events with explicit "Online event" venue as online', () => {
    const e = events.find(ev => ev.venue_name && String(ev.venue_name).toLowerCase().includes('online'));
    expect(e).toBeTruthy();
    if (e) expect(isOnlineEvent(e)).toBe(true);
  });

  it('does not classify clearly physical events as online (address in location)', () => {
    const e = events.find(ev => ev.location && /\d/.test(String(ev.location)));
    expect(e).toBeTruthy();
    if (e) expect(isOnlineEvent(e)).toBe(false);
  });

  it('does not classify hybrid events (venue + online link in description) as online when venue contains physical address', () => {
    // Use an example that contains both a physical venue and an online link in the description
    const e = events.find(ev => {
      const hasVenue = ev.venue_name && ev.location;
      const hasLinkInDesc = ev.description && /https?:\/\//.test(ev.description);
      return hasVenue && hasLinkInDesc;
    });

    expect(e).toBeTruthy();
    if (e) {
      // because the venue contains a physical address we expect our heuristics to prefer in-person
      expect(isOnlineEvent(e)).toBe(false);
    }
  });

  it('categorizes known Salt Lake County event correctly', () => {
    // Look for an event that explicitly mentions 'Salt Lake City' in location
    const e = events.find(ev => ev.location && String(ev.location).toLowerCase().includes('salt lake'));
    expect(e).toBeTruthy();
    if (e) expect(categorizeEventByRegion(e)).toBe('Salt Lake County');
  });
});
