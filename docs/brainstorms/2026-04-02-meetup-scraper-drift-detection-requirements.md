---
date: 2026-04-02
topic: meetup-scraper-drift-detection
---

# Meetup Scraper Drift Detection & Auto-Fix

## Problem Frame

The Meetup scraper (`functions/scraping-events/src/scraping_events/scrape_meetup.py`) uses DOM selectors that break when Meetup changes their site structure. When this happens, events silently stop being collected until someone manually diagnoses and fixes the selectors. We want the system to detect this automatically and produce a ready-to-merge code fix without requiring manual intervention.

## Requirements

**Detection**
- R1. A scheduled CI/CD workflow runs weekly and executes a smoke test against the Meetup scraper using a known, active Utah Meetup group URL.
- R2. The smoke test passes if the scraper successfully returns at least one upcoming event without errors.
- R3. If the smoke test passes, the workflow exits with no action taken.

**Auto-Fix**
- R4. If the smoke test fails, an automated agent uses browser automation to navigate to a live Meetup group page and a live Meetup event detail page.
- R5. The agent reads the current `scrape_meetup.py` and identifies which selectors or DOM interactions no longer match the live page structure.
- R6. The agent updates `scrape_meetup.py` with selectors and interaction patterns that work against the current live site.
- R7. After making changes, the agent re-runs the smoke test to verify the fix works before opening a PR.

**Pull Request**
- R8. The agent opens a GitHub PR containing the code changes and a description summarizing what structural changes Meetup made and what was updated in the scraper.
- R9. The PR does not auto-merge; a human reviews and merges it.

## Success Criteria

- When Meetup changes their site structure, a PR with a working code fix is automatically opened within one week (next scheduled run).
- The fix PR is ready to merge with minimal or no additional human modification.

## Scope Boundaries

- Covers only `scrape_meetup.py`; other scrapers (Luma, Eventbrite, university sites) are out of scope.
- Does not auto-merge; human review is always required before merging.
- Does not alert or page anyone — the PR itself is the notification mechanism.

## Key Decisions

- **Weekly schedule over real-time monitoring:** Fits the side-project cadence; a one-week lag on detecting drift is acceptable.
- **AI-generated fix over diagnostic-only PR:** A fix PR is more actionable than a report that still requires manual selector work.
- **Meetup-only scope for now:** Other scrapers can be brought into this pattern if/when they break.

## Outstanding Questions

### Resolve Before Planning
- None.

### Deferred to Planning
- [Affects R1, R4][Technical] What mechanism triggers a Claude agent from CI? Options include the `claude` CLI in non-interactive/headless mode, direct Claude API calls, or another agentic runner.
- [Affects R1][Needs research] Which known Utah Meetup group URL should be used as the smoke test target? Should it be configurable via an env var or hardcoded as a CI input?
- [Affects R4][Technical] The existing scraper runs inside Docker with Playwright. Should the CI agent reuse this Docker environment for browser automation, or use a separate browser tool?
- [Affects R7][Technical] How should the smoke test be re-run from within the agent (subprocess call, API call to the local service, etc.)?

## Next Steps

→ `/ce:plan` for structured implementation planning
