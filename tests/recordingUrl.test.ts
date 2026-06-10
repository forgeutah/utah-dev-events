import { describe, it, expect } from 'vitest';
import { isValidRecordingUrl, parseRecordingHostname } from '../src/utils/recordingUrl';

describe('isValidRecordingUrl', () => {
  it('accepts youtube.com watch URL', () => {
    expect(isValidRecordingUrl('https://youtube.com/watch?v=abc123')).toBe(true);
  });

  it('accepts www.youtube.com', () => {
    expect(isValidRecordingUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
  });

  it('accepts youtu.be short URL', () => {
    expect(isValidRecordingUrl('https://youtu.be/abc123')).toBe(true);
  });

  it('accepts vimeo.com', () => {
    expect(isValidRecordingUrl('https://vimeo.com/12345')).toBe(true);
  });

  it('accepts player.vimeo.com embed URL', () => {
    expect(isValidRecordingUrl('https://player.vimeo.com/video/12345')).toBe(true);
  });

  it('accepts loom.com', () => {
    expect(isValidRecordingUrl('https://www.loom.com/share/abc')).toBe(true);
  });

  it('rejects http (non-https)', () => {
    expect(isValidRecordingUrl('http://youtube.com/watch?v=abc')).toBe(false);
  });

  it('rejects Unicode-homograph hosts', () => {
    // "youtübe.com" — U+00FC. new URL() punycodes this; allowlist rejects.
    expect(isValidRecordingUrl('https://youtübe.com/watch?v=abc')).toBe(false);
  });

  it('rejects non-allowlisted hosts', () => {
    expect(isValidRecordingUrl('https://notavideohost.com/watch')).toBe(false);
  });

  it('rejects javascript: protocol', () => {
    expect(isValidRecordingUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isValidRecordingUrl('data:text/html,hi')).toBe(false);
  });

  it('rejects file: URLs', () => {
    expect(isValidRecordingUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidRecordingUrl('')).toBe(false);
  });

  it('rejects URLs > 2000 chars', () => {
    const long = 'https://youtube.com/watch?v=' + 'a'.repeat(2000);
    expect(isValidRecordingUrl(long)).toBe(false);
  });

  it('rejects malformed URL', () => {
    expect(isValidRecordingUrl('not a url')).toBe(false);
  });
});

describe('parseRecordingHostname', () => {
  it('strips www prefix', () => {
    expect(parseRecordingHostname('https://www.youtube.com/foo')).toBe('youtube.com');
  });

  it('returns null for null input', () => {
    expect(parseRecordingHostname(null)).toBeNull();
  });

  it('returns null for malformed URL', () => {
    expect(parseRecordingHostname('not a url')).toBeNull();
  });

  it('returns hostname for youtu.be', () => {
    expect(parseRecordingHostname('https://youtu.be/abc')).toBe('youtu.be');
  });
});
