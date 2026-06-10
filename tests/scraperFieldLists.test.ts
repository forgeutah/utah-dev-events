import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Regression guard: scrapers must never write to recording_url or recording_status.
// Those columns hold user-submitted video links; re-scraping would clobber them.
// See docs/plans/2026-04-19-002-feat-past-events-video-recordings-plan.md.
const SCRAPER_FILES = [
  'supabase/functions/scrape-meetup-events/index.ts',
  'supabase/functions/scrape-single-meetup/index.ts',
  'supabase/functions/scrape-university-events/index.ts',
  'supabase/functions/scrape-misc-websites/index.ts',
];

const FORBIDDEN = ['recording_url', 'recording_status'];

// Strip comments (// and /* */) so the DO-NOT-add reminder comments pass.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('scraper field lists', () => {
  for (const relPath of SCRAPER_FILES) {
    it(`${relPath} does not assign recording columns`, () => {
      const src = stripComments(readFileSync(join(process.cwd(), relPath), 'utf-8'));
      for (const key of FORBIDDEN) {
        expect(src, `${key} must not appear in ${relPath}`).not.toContain(key);
      }
    });
  }
});
