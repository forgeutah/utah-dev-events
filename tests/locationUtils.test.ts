import { describe, it, expect } from 'vitest';
import { categorizeEventByRegion, isOnlineEvent, UTAH_REGIONS } from '../lib/locationUtils';

describe('locationUtils shared tests', () => {
  it('categorizes Salt Lake County city', () => {
    const event = { city: 'Salt Lake City' };
    expect(categorizeEventByRegion(event)).toBe('Salt Lake County');
  });

  it('categorizes Utah County city', () => {
    const event = { city: 'Provo' };
    expect(categorizeEventByRegion(event)).toBe('Utah County');
  });

  it('returns Unknown for empty location', () => {
    const event = {};
    expect(categorizeEventByRegion(event)).toBe('Unknown');
  });

  it('detects online via title/description', () => {
    const event = { title: 'Weekly Zoom Meeting', description: 'Join via Zoom' };
    expect(isOnlineEvent(event)).toBe(true);
  });

  it('does not classify meetup in title as online when venue is unspecified', () => {
    const event = { title: 'Monthly Meetup: Project Night', description: 'An in-person social' };
    expect(isOnlineEvent(event)).toBe(false);
  });

  it('classifies online when venue explicitly mentions Zoom', () => {
    const event = { title: 'Monthly Meetup: Project Night', venue_name: 'Zoom', description: 'Online meeting' };
    expect(isOnlineEvent(event)).toBe(true);
  });

  it('classifies online when description contains a meeting URL', () => {
    const event = { title: 'Community Chat', description: 'Join at https://zoom.us/j/123456789' };
    expect(isOnlineEvent(event)).toBe(true);
  });

  it('does not detect online for physical address', () => {
    const event = { title: 'Hack Night', location: 'Salt Lake City Library', description: 'In-person' };
    expect(isOnlineEvent(event)).toBe(false);
  });

  it('exports UTAH_REGIONS array', () => {
    expect(Array.isArray(UTAH_REGIONS)).toBe(true);
    expect(UTAH_REGIONS.length).toBeGreaterThan(0);
  });
});
