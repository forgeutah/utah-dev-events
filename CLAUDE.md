# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server on port 8080
npm run build      # Production build
npm run lint       # Run ESLint
npm test           # Run Vitest tests
npm run preview    # Preview production build
```

To run a single test file:
```bash
npx vitest run tests/locationUtils.test.ts
```

To deploy Supabase Edge Functions:
```bash
supabase functions deploy <function-name>
```

## Architecture

This is a Utah developer events discovery app. It aggregates tech events from multiple external sources and provides a searchable, filterable calendar interface.

### Frontend (`src/`)

React 18 + Vite + TypeScript SPA. UI is built with **shadcn-ui** (Radix UI primitives + Tailwind CSS). Data fetching uses **TanStack React Query** with the Supabase JS client.

- `src/pages/Index.tsx` — main event discovery page; all filtering/display happens here
- `src/hooks/useEventFiltering.ts` — client-side filtering logic (regions, tags, dates)
- `src/utils/` — event deduplication, iCal/RSS URL generation, misc helpers
- `src/integrations/supabase/` — generated Supabase client and TypeScript types

### Backend (`supabase/`)

**Supabase** provides PostgreSQL and Deno-based Edge Functions. JWT verification is disabled on all functions (`config.toml`).

**Database schema** (see `supabase/migrations/`):
- `events` — id, title, event_date, start_time, location, venue_name, address, city, state, postal_code, country, link, description, tags[], group_id, status
- `groups` — id, name, tags[], status

**Edge Functions** (`supabase/functions/`):
- `scrape-meetup-events`, `scrape-single-meetup` — Meetup.com scrapers
- `scrape-university-events` — university event scrapers
- `scrape-misc-websites` — other event source scrapers
- `generate-ical` — iCal export with filter params
- `generate-rss` — RSS feed generation with filter params

### Shared Utilities (`lib/`)

`lib/locationUtils.ts` is shared between the frontend and all Deno Edge Functions. It handles Utah region categorization and online event detection. When editing this file, the same logic applies to both environments. Tests live in `tests/`.

### Data Flow

1. Edge Function scrapers populate the `events` and `groups` tables from external sources (Meetup, universities, Eventbrite, misc sites)
2. Frontend fetches events/groups via Supabase client; React Query handles caching
3. `useEventFiltering` applies client-side filters
4. Users can subscribe to filtered event feeds via iCal or RSS URLs, which hit the corresponding Edge Functions

### Meetup Scraper (`functions/scraping-events/`)

Standalone Python 3.13 service (uv + pdm-backend). Scrapes Meetup.com event pages using Playwright (async, headless Chromium). Always set `DEBUG=false` when running — `playwright_utils.py` reads this at import time to decide headless mode.

```bash
# Run from functions/scraping-events/
DEBUG=false uv run python -m scraping_events.main_cli <meetup_url> --max-events 2
# Success: exit 0, stdout is {"events": [...]}
# Failure: exit 1, stdout is {"type": "error", ...}

SMOKE_TEST_URL=<meetup_url> DEBUG=false uv run pytest tests/smoke/ -v   # live-network smoke tests
```

Three URL routing cases handled by `scrape_meetup.py`:
- **Group URL** (e.g. `meetup.com/utahjs/`) — collects upcoming events from the group page
- **Recurring event URL** — `__NEXT_DATA__.event.series` non-null → normalised to group URL
- **Non-recurring event URL** — `series` is null → scrapes that single event directly

Past/ended events don't render attend buttons; venue type falls back to `eventType` from `__NEXT_DATA__` (`"PHYSICAL"` / `"ONLINE"`).

When Meetup's site structure drifts and the scraper breaks, run the fix agent:
```bash
# From repo root — reads SMOKE_TEST_URL from env, never hardcode it
SMOKE_TEST_URL=<meetup_group_url> claude -p "$(cat functions/scraping-events/scripts/meetup_fix_prompt.txt)" \
  --allowedTools "Bash,Read,Edit,Write" --max-turns 20
```

CI: `.github/workflows/weekly-meetup-smoke-test.yml` runs smoke tests every Monday; on failure it invokes the Claude fix agent and opens a PR. Requires "Allow GitHub Actions to create and approve pull requests" enabled in Settings → Actions → General, plus these repository secrets:

- `ANTHROPIC_API_KEY` — for the Claude fix agent
- `SMOKE_TEST_GROUP_URL` — Meetup group page URL
- `SMOKE_TEST_EVENT_URL` — specific Meetup event URL
- `SMOKE_TEST_ONLINE_ONLY_EVENT_URL` — online-only event URL
- `SMOKE_TEST_HYBRID_EVENT_URL` — hybrid (IRL + online) event URL
- `SMOKE_TEST_IN_PERSON_EVENT_URL` — in-person event URL
- `SMOKE_TEST_GROUP_EVENTS_PAGE_URL` — group events listing page URL
- `SMOKE_TEST_LUMA_EVENT_URL` — Luma event URL (lu.ma or luma.com)

## Environment

Requires a `.env` file with:
```
VITE_SUPABASE_PROJECT_ID=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```
