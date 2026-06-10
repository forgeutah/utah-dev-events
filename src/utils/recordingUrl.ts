export const ALLOWED_RECORDING_HOSTS: ReadonlySet<string> = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'vimeo.com',
  'www.vimeo.com',
  'player.vimeo.com',
  'loom.com',
  'www.loom.com',
]);

export function isValidRecordingUrl(url: string): boolean {
  if (!url || url.length > 2000) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return ALLOWED_RECORDING_HOSTS.has(parsed.hostname.toLowerCase());
}

export function parseRecordingHostname(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
