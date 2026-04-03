---
title: "feat: Weekly Meetup Scraper Drift Detection & Auto-Fix CI"
type: feat
status: completed
date: 2026-04-02
origin: docs/brainstorms/2026-04-02-meetup-scraper-drift-detection-requirements.md
deepened: 2026-04-02
---

# Weekly Meetup Scraper Drift Detection & Auto-Fix CI

## Overview

Add a weekly GitHub Actions workflow that smoke-tests the Meetup scraper against a live Meetup group page and, on failure, invokes a Claude agent to inspect the current Meetup DOM structure, update `scrape_meetup.py` with corrected selectors, and open a PR with the fix.

## Problem Frame

`scrape_meetup.py` uses hard-coded DOM selectors that silently break when Meetup changes their site structure. Currently there is no automated detection — events stop being collected until someone manually diagnoses and fixes the code. This workflow closes that gap: a weekly check detects structural drift and produces a ready-to-review code fix automatically. (see origin: docs/brainstorms/2026-04-02-meetup-scraper-drift-detection-requirements.md)

## Requirements Trace

- R1. Weekly CI job runs a smoke test against the Meetup scraper using a known Utah Meetup group URL.
- R2. Smoke test passes if the scraper exits successfully and returns valid JSON (event count not required — handles periods of no upcoming events).
- R3. If smoke test passes, workflow exits with no action.
- R4. If smoke test fails, an automated Claude agent uses browser automation to navigate current Meetup pages.
- R5. Agent reads `scrape_meetup.py` and identifies selectors that no longer match the live site.
- R6. Agent updates `scrape_meetup.py` with working selectors.
- R7. Agent re-runs the smoke test to verify the fix before the PR step.
- R8. Workflow opens a GitHub PR with the code changes and a summary of what changed.
- R9. No auto-merge; human reviews and merges.

## Scope Boundaries

- Only `scrape_meetup.py` is in scope; other scrapers are explicitly excluded.
- No alerting beyond the PR itself (the workflow run failure + PR is the notification).
- No auto-merge under any circumstances.
- Does not cover silent drift where Meetup changes make the scraper return 0 events without throwing an error (accepted tradeoff; the most impactful failures cause exceptions).

## Context & Research

### Relevant Code and Patterns

- Scraper entry point: `functions/scraping-events/src/scraping_events/scrape_meetup.py` — `_get_upcoming_event_urls` and `_get_event_details` are the two functions with all brittle selectors
- Browser scaffold: `functions/scraping-events/src/scraping_events/playwright_utils.py` — `launch_browser()`, `PageWrapper.open()`, `PageWrapper.navigate()` are stable and reusable; the Claude fix agent should use these rather than write raw Playwright
- CLI entry point: `functions/scraping-events/src/scraping_events/main_cli.py` — `uv run python -m scraping_events.main_cli <url> [--max-events N]` writes `{"events": [...]}` JSON to stdout, exits non-zero on any exception (note: no `[project.scripts]` entry point exists)
- Dev tooling: `functions/scraping-events/pyproject.toml` — uv + pdm-backend, Python 3.13, Playwright 1.52, task runner `poe`; no test framework exists yet
- Lockfile: `functions/scraping-events/uv.lock` — must be committed; `uv sync --frozen` will fail if not present

### Known Fragile Selectors (Targets for the Fix Agent)

| Purpose | Current selector | Fragility |
|---|---|---|
| See-all button | `#see-all-upcoming-events-button` | ID — fragile |
| Event cards | `#event-card-e-{n}` | Numbered ID — very fragile |
| Description | `#event-details .break-words` | ID + class — fragile |
| Datetime | `[data-event-label='action-bar'] [datetime]` | Data attr — medium |
| IRL check | `data-testid="attend-irl-btn"` | testid — relatively stable |
| Venue name (IRL) | `data-testid="venue-name-link"` | testid — relatively stable |

### External References

- Claude CLI headless mode: `claude --bare -p "..." --allowedTools "Bash,Read,Edit,Write" --max-turns N` — `--bare` skips all local config discovery, recommended for CI
- `astral-sh/setup-uv@v5`: official action, `enable-cache: true` with `cache-dependency-glob` for fast installs
- `peter-evans/create-pull-request@v7`: idempotent PR creation — updates existing PR if branch already exists; requires "Allow GitHub Actions to create and approve pull requests" enabled in repo settings
- `GITHUB_TOKEN` with `contents: write` + `pull-requests: write` is sufficient for same-repo PRs
- Scheduled workflow caveat: GitHub disables scheduled workflows on repos with no activity for 60 days; `workflow_dispatch` is included so it can always be triggered manually
- `if: ${{ failure() }}` — the correct conditional for the fix job; `if: needs.smoke-test.result == 'failure'` alone silently never runs due to implicit `&& success()`

## Key Technical Decisions

- **Direct `claude` CLI over `claude-code-action`**: `claude-code-action@v1` is designed for PR/issue-triggered interaction. Scheduled automation with explicit tool control is cleaner via `claude --bare -p`. Gives precise control over `--allowedTools`, `--max-turns`, and `--max-budget-usd`. (see origin: deferred to planning)

- **Agent uses existing Playwright infrastructure**: The fix agent writes and runs a temporary Python script that reuses `playwright_utils.py` (stable `launch_browser` / `PageWrapper` scaffold) rather than a separate browser tool. This keeps the agent working within the project's own tooling, avoids new dependencies, and the `playwright_utils.py` abstractions are known to work. (see origin: deferred to planning — Docker vs separate browser)

- **Smoke test via CLI subprocess (not HTTP API)**: The CLI (`uv run python -m scraping_events.main_cli`) is the simplest invocation — no HTTP server startup required, clean exit-code semantics, and it exercises the full code path. The HTTP API (Cloud Run) is the production path but requires a running server. Note: there is no `scrape-events` installed entry point (`pyproject.toml` has no `[project.scripts]`). (see origin: deferred to planning)

- **Smoke test target URL hardcoded as env var in workflow**: `https://www.meetup.com/utahjs/` is a stable, long-running Utah JS meetup group. Stored as a workflow-level `env` variable (`SMOKE_TEST_URL`) so it can be changed in one place without touching test files. (see origin: deferred to planning — which URL)

- **Smoke test asserts exit code + valid JSON, not event count**: The scraper legitimately returns `{"events": []}` when there are no upcoming events. Asserting `len(events) >= 1` would produce false positive failures. Asserting exit 0 + valid JSON catches the structural failures (exceptions) that are the primary failure mode.

- **`peter-evans/create-pull-request@v7` over `gh` CLI**: Idempotent — re-running the workflow updates an existing fix PR rather than failing or creating duplicates. Also handles the `git config` and branch management boilerplate cleanly. (see origin: deferred to planning)

- **Re-verify smoke test from within agent via Bash subprocess**: The agent runs `cd functions/scraping-events && uv run python -m scraping_events.main_cli $SMOKE_TEST_URL --max-events 2` as a Bash call at the end of its work. This validates the fix before the workflow proceeds to PR creation. (see origin: deferred to planning)

## Open Questions

### Resolved During Planning

- **How to invoke Claude from CI**: `claude --bare -p "..."` with scoped `--allowedTools`. The `--bare` flag ensures reproducible CI behavior by skipping local config discovery.
- **Which Meetup URL for smoke test**: `https://www.meetup.com/utahjs/` — stable, long-running group. Stored as `SMOKE_TEST_URL` env var in the workflow.
- **Browser in fix agent**: Agent uses Bash + the existing Python/Playwright infrastructure (`playwright_utils.py`). No separate browser tool dependency.
- **Re-running smoke test from agent**: Agent uses a Bash subprocess call to the CLI. This is the simplest and most direct verification path.
- **No installed `scrape-events` command**: The CLI has no `[project.scripts]` entry point. Invocation is `uv run python -m scraping_events.main_cli <url> [--max-events N]` — confirmed by reading `pyproject.toml` and `main_cli.py`. All workflow steps and the agent prompt must use this form.
- **Smoke test dual assertion**: Must check both exit code (0 = success, 1 = unhandled exception) AND that stdout JSON has a top-level `"events"` key. On failure the CLI prints `{"type": "error", ...}` to stdout (not just an empty events array), so key presence is a reliable discriminator.
- **`pytest-asyncio` required**: All scraper functions are `async def`. `pytest-asyncio` must be added alongside `pytest` in `[dependency-groups] dev`.
- **No `poe test` task exists**: A `test` task must be added to `[tool.poe.tasks]` in `pyproject.toml`, or the CI workflow can invoke `uv run pytest` directly — either works.

### Deferred to Implementation

- **`SMOKE_TEST_URL` format**: Determine whether the URL should include or exclude trailing slash; test both forms against the CLI to confirm it handles either.
- **Claude agent `--max-turns` tuning**: Start at 20, adjust based on observed runs. The agent needs: (1) read scraper, (2) write + run Playwright inspection script, (3) analyze output, (4) edit scraper, (5) re-run smoke test. 20 turns should be ample; reduce if costs are high.
- **Temporary script cleanup**: The agent prompt should instruct Claude to delete any temporary scripts it writes. Verify that `peter-evans/create-pull-request` is configured to only commit changes to `scrape_meetup.py` (via the `add-paths` parameter) to prevent accidental inclusion of temp files.
- **Smoke test flakiness**: The smoke test runs against a live Meetup page and inherits Playwright's network flakiness. If early runs show false-positive failures, add a retry (`continue-on-error: true` + a rerun step) or increase `PLAYWRIGHT_TIMEOUT_MS`.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Phase 0: Manual validation (one-time, before any CI)
  └─ claude --bare -p "$(cat meetup_fix_prompt.txt)" --allowedTools Bash,Read,Edit,Write
       → agent fixes current broken scraper
       → scraper works? → proceed to Phase 1 (Units 1-3)
       → scraper still broken? → diagnose failure mode, redesign approach

Weekly schedule (Monday 09:00 UTC) or workflow_dispatch
  │
  ▼
Job: smoke-test
  checkout → install uv/Python 3.13/Playwright → uv sync --frozen
  → pytest tests/smoke/ (subprocess: uv run python -m scraping_events.main_cli $SMOKE_TEST_URL --max-events 2)
  │
  ├─ exit 0 (pass) ──────────────────────────────────────► workflow ends, no action
  │
  └─ exit non-zero (fail)
       │
       ▼
Job: claude-fix  [if: failure()]
  checkout → install uv/Python 3.13/Playwright
  → npm install -g @anthropic-ai/claude-code
  → claude --bare -p "<fix prompt>" --allowedTools "Bash,Read,Edit,Write" --max-turns 20
      │
      Agent loop:
      1. Read scrape_meetup.py
      2. Write + run temp Playwright Python script (uses playwright_utils.py)
         to navigate utahjs group page + an event detail page
      3. Inspect DOM, compare to current selectors
      4. Edit scrape_meetup.py
      5. Bash: uv run python -m scraping_events.main_cli $SMOKE_TEST_URL --max-events 2
      6. If exit 0 → done; else → investigate and retry
      │
  → peter-evans/create-pull-request@v7
      branch: automated/meetup-scraper-fix
      paths: functions/scraping-events/src/scraping_events/scrape_meetup.py
      PR title + body with run ID link
```

## Implementation Units

### Phase 0: Manual Validation Gate (Prerequisite)

> **This phase must complete before any Unit begins.** It validates the core assumption of the entire plan and also fixes the scraper today.

- [ ] **Phase 0: Manually invoke the agent against the current broken scraper**

  **Goal:** Confirm the Claude agent can successfully diagnose and fix real Meetup selector drift before any CI infrastructure is built. This also restores the scraper to working state immediately.

  **Requirements:** Validates R4–R7 assumptions; prerequisite for R1–R9.

  **Dependencies:** None — run this before any other unit.

  **Approach:**
  1. Write the initial version of `functions/scraping-events/scripts/meetup_fix_prompt.txt` (can be a draft; will be refined in Unit 3)
  2. From the repo root, run:
     ```
     claude --bare -p "$(cat functions/scraping-events/scripts/meetup_fix_prompt.txt)" \
       --allowedTools "Bash,Read,Edit,Write" \
       --max-turns 20 \
       --max-budget-usd 5.00
     ```
  3. Observe whether the agent successfully navigates Meetup, identifies the changed selectors, edits `scrape_meetup.py`, and passes self-verification
  4. Manually run `cd functions/scraping-events && uv run python -m scraping_events.main_cli https://www.meetup.com/utahjs/ --max-events 2` to confirm the fix independently
  5. Commit the working `scrape_meetup.py` (this also restores event collection today)

  **Go/No-Go criteria:**
  - **Go:** Agent produces a working fix in ≤20 turns; the CLI returns events (or exits 0 cleanly with 0 events if utahjs has none); the fix is understandable and correct on inspection
  - **No-Go:** Agent fails to navigate Meetup (bot detection, login wall), produces wrong selectors, or exhausts turns without a fix → investigate the actual failure mode before building automation; the agent-based approach may need to be redesigned

  **Verification:**
  - `uv run python -m scraping_events.main_cli https://www.meetup.com/utahjs/ --max-events 2` exits 0 with valid JSON after the agent's edits

---

### Phase 1–3: Build the Automation (Gated on Phase 0)

- [ ] **Unit 1: Pytest smoke test for Meetup scraper**

  **Goal:** Add pytest to the scraper project and create a smoke test that exercises the full CLI code path against a live Meetup URL.

  **Requirements:** R1, R2, R3

  **Dependencies:** None

  **Files:**
  - Modify: `functions/scraping-events/pyproject.toml` — append `pytest>=8` and `pytest-asyncio>=0.25` to the `[dependency-groups] dev` list (existing entries: `mypy`, `python-dotenv`); add `[tool.pytest.ini_options]` with `testpaths = ["tests"]` and `asyncio_mode = "auto"` (for pytest-asyncio); optionally add a `poe test` task
  - Update: `functions/scraping-events/uv.lock` — run `uv lock` after editing `pyproject.toml` and commit the result; `uv sync --frozen` in CI will fail if this is stale
  - Create: `functions/scraping-events/tests/__init__.py`
  - Create: `functions/scraping-events/tests/smoke/__init__.py`
  - Create: `functions/scraping-events/tests/smoke/test_meetup_smoke.py`

  **Approach:**
  - The smoke test invokes `uv run python -m scraping_events.main_cli <url> --max-events 2` via `subprocess.run()`, capturing stdout and checking exit code. Pass `cwd=Path(__file__).parents[3]` (resolves to `functions/scraping-events/`) so the test is runnable from any directory, not just when pytest is invoked from `functions/scraping-events/`. **Note: there is no `scrape-events` installed entry point** — `pyproject.toml` has no `[project.scripts]` section.
  - The test URL comes from `os.environ.get("SMOKE_TEST_URL", "https://www.meetup.com/utahjs/")`
  - Assertions: (1) `returncode == 0`; (2) stdout is valid JSON; (3) parsed object has a top-level `"events"` key of type list. The `"events"` key check catches the failure case where the CLI exits 0 but printed `{"type": "error", ...}` — this cannot happen per the current code (failure always exits non-zero) but defends against future changes.
  - No assertion on `len(events) >= 1` — the scraper correctly returns 0 events during quiet periods
  - Mark the test with `@pytest.mark.smoke` for easy exclusion from fast unit test runs
  - The test function should be `def` (synchronous), not `async def`. `subprocess.run()` is blocking; no async is needed even though the scraper code is async. `pytest-asyncio` is still listed as a dev dependency because other future tests in this module may be async, but this smoke test does not need it.

  **Patterns to follow:**
  - Project has no existing Python tests; the frontend Vitest tests in `tests/` provide structural inspiration (fixture data, direct module import style)
  - uv dependency group pattern: observe existing `[dependency-groups]` structure in `pyproject.toml` before adding

  **Test scenarios:**
  - Happy path: CLI exits 0, stdout is `{"events": [...]}`, `events` is a list
  - Structure validation: stdout parses as JSON without error
  - (Negative case handled at the workflow level, not in this test — the test itself only runs against a known-live URL)

  **Verification:**
  - Run `uv lock` after editing `pyproject.toml`; confirm `uv.lock` is updated and committed
  - `cd functions/scraping-events && uv sync --frozen && uv run pytest tests/smoke/ -v` exits 0 with the test passing against the live Meetup URL
  - The JSON response has an `"events"` key (not `"type": "error"`)
  - `returncode == 0` is confirmed separately from JSON structure check

---

- [ ] **Unit 2a: Weekly smoke-test CI job**

  **Goal:** Create `.github/workflows/weekly-meetup-smoke-test.yml` with only the `smoke-test` job. This job is independently useful and verifiable without the fix agent.

  **Requirements:** R1, R2, R3

  **Dependencies:** Unit 1 (smoke test must exist before the workflow references it)

  **Files:**
  - Create: `.github/workflows/weekly-meetup-smoke-test.yml`

  **Approach:**

  *Workflow-level:*
  - Triggers: `schedule` (`0 9 * * 1` — Monday 09:00 UTC) + `workflow_dispatch`
  - Top-level `env`: `SMOKE_TEST_URL: https://www.meetup.com/utahjs/`, `DEBUG: 'false'` (prevents accidental headed Playwright launch; `playwright_utils.py` reads `DEBUG` at module import time)

  *`smoke-test` job:*
  - `defaults.run.working-directory: functions/scraping-events`
  - Steps: `actions/checkout@v4` → `astral-sh/setup-uv@v5` (with `enable-cache: true`, `cache-dependency-glob: "functions/scraping-events/uv.lock"`) → `uv python install 3.13` → `uv sync --frozen` → `uv run playwright install chromium --with-deps` → `uv run pytest tests/smoke/ -v --tb=short`
  - No special permissions needed

  **Patterns to follow:**
  - No existing GitHub Actions workflows; follow the patterns from the research (see External References above)
  - `uv sync --frozen` (not `uv sync`) for reproducible CI installs

  **Test scenarios:**
  - Happy path: smoke test passes → workflow exits green
  - Failure path: deliberately break a selector → smoke test fails → workflow fails → ready to trigger fix agent manually (Unit 2b not yet in place)
  - `workflow_dispatch` trigger: can be manually triggered

  **Verification:**
  - Trigger via `workflow_dispatch` and confirm the smoke-test job passes

---

- [ ] **Unit 2b: Claude-fix job + PR creation (gated on Phase 0)**

  **Goal:** Extend the workflow from Unit 2a with the conditional `claude-fix` job that invokes the Claude agent on smoke test failure and opens a PR.

  **Requirements:** R4–R9

  **Dependencies:** Unit 1, Unit 2a, Unit 3 (prompt file must exist before this unit), Phase 0 must have passed (agent confirmed working)

  **Files:**
  - Modify: `.github/workflows/weekly-meetup-smoke-test.yml` — add the `claude-fix` job

  **Approach:**

  *`claude-fix` job:*
  - `needs: smoke-test`
  - `if: ${{ failure() }}` — must be this exact form; `if: needs.smoke-test.result == 'failure'` alone silently never runs due to implicit `&& success()`
  - `permissions: contents: write, pull-requests: write`
  - Steps: same checkout + uv + Python + Playwright setup as `smoke-test` job (include `enable-cache: true` and same `cache-dependency-glob` on `astral-sh/setup-uv@v5` so the fix job hits a warm cache)
  - Install Claude CLI: `npm install -g @anthropic-ai/claude-code`
  - Run Claude agent (see step below)
  - A `git diff --name-only` step that logs a warning if files beyond `scrape_meetup.py` were touched (the agent's Bash access means it could modify other files; `add-paths` prevents them from being committed but a reviewer should know they happened)
  - `peter-evans/create-pull-request@v7` with `add-paths: functions/scraping-events/src/scraping_events/scrape_meetup.py` to limit committed changes to only the scraper file; `branch: automated/meetup-scraper-fix`; `delete-branch: true`; PR title includes `${{ github.run_id }}` for traceability; PR body includes a link to the failing workflow run

  *Claude agent step:*
  ```
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  SMOKE_TEST_URL: ${{ env.SMOKE_TEST_URL }}
  DEBUG: 'false'

  claude --bare -p "$(cat functions/scraping-events/scripts/meetup_fix_prompt.txt)" \
    --allowedTools "Bash,Read,Edit,Write" \
    --max-turns 20 \
    --max-budget-usd 5.00
  ```

  Note: `--output-format json` is intentionally omitted. With that flag, the CLI may exit 0 even when `--max-turns` is exhausted (error encoded in JSON body). Omitting it ensures non-zero exit propagates correctly to the workflow's failure detection.

  **Test scenarios:**
  - Fix triggered: smoke test fails → `claude-fix` runs → agent edits `scrape_meetup.py` → re-verification passes → PR opened on `automated/meetup-scraper-fix` branch
  - Idempotency: running the workflow twice with a failing scraper updates the existing PR rather than creating a duplicate (handled by `peter-evans/create-pull-request` automatically)
  - Budget/turn limit: if the agent exhausts `--max-turns 20` or `--max-budget-usd 5.00`, the Claude step exits non-zero; `peter-evans/create-pull-request` still runs (only creates a PR if there are file changes)
  - Agent touches extra files: `git diff --name-only` step logs a warning; those changes are not committed

  **Verification:**
  - Temporarily break a selector (e.g., change `#see-all-upcoming-events-button` to `#nonexistent`), trigger via `workflow_dispatch`, confirm the fix job runs and opens a PR that restores the correct selector

---

- [ ] **Unit 3: Agent fix prompt file**

  **Goal:** Write the prompt that instructs the Claude agent how to diagnose and fix the Meetup scraper. The initial draft is created in Phase 0 and refined here based on what was learned.

  **Requirements:** Enables Unit 2b to satisfy R4–R7

  **Dependencies:** Phase 0 (draft used there; refined here based on observed agent behavior)

  **Files:**
  - Create/refine: `functions/scraping-events/scripts/meetup_fix_prompt.txt`

  **Approach:**
  The prompt should (refined from the Phase 0 draft based on observed behavior):
  1. State the context clearly: the weekly smoke test just failed, which likely means Meetup changed their site structure
  2. Point to the exact file: `functions/scraping-events/src/scraping_events/scrape_meetup.py`
  3. Name the two target functions: `_get_upcoming_event_urls` and `_get_event_details`
  4. Describe the approach: write a small Python inspection script using the existing `playwright_utils.py` (in `functions/scraping-events/src/scraping_events/`), run it with `uv run python <script>` from `functions/scraping-events/`, use the DOM output to identify what changed. **The script must use `asyncio.run()` as its entry point** — all `playwright_utils` functions (`launch_browser`, `PageWrapper.open`, `PageWrapper.navigate`) are `async def`/`@asynccontextmanager`. A synchronous script that imports them will fail at runtime. Headless mode is auto-configured by `playwright_utils.py` via the `DEBUG` env var — do not try to override it.
  5. Specify the test URL: use the `SMOKE_TEST_URL` env var (`https://www.meetup.com/utahjs/`)
  6. Specify verification: run `cd functions/scraping-events && uv run python -m scraping_events.main_cli $SMOKE_TEST_URL --max-events 2`, exit code must be 0 and stdout JSON must have an `"events"` key
  7. Specify cleanup: delete any temporary Python scripts created during the investigation
  8. Set expectations on scope: only edit `scrape_meetup.py`; do not modify any other files

  **Patterns to follow:**
  - Prompt content should be grounded in the Phase 0 run — what actually worked, what turns were wasted, what the agent needed to be told explicitly
  - Plain text (not Markdown) for clean shell substitution via `$(cat ...)`

  **Test scenarios:**
  - Prompt is specific enough that the agent targets the right file and functions without guessing
  - Prompt's verification step catches a partial fix (agent edits the file but the smoke test still fails)
  - Prompt includes explicit cleanup instruction so temp scripts don't leak into the PR

  **Verification:**
  - With a deliberately broken selector in a test branch, run the workflow manually (after Unit 2b) and confirm the agent opens a PR that fixes only `scrape_meetup.py` and passes the re-verification step

## System-Wide Impact

- **New directory created**: `.github/` — first CI/CD infrastructure in this repo. The workflow is self-contained and does not affect the Supabase Edge Functions, frontend, or Cloud Run deployment.
- **No changes to production code paths**: `scrape_meetup.py` is only modified by the agent when the smoke test fails; no runtime behavior is changed by this plan.
- **Playwright in CI**: The smoke test and fix job both run Playwright headlessly on `ubuntu-latest`. The `--with-deps` flag for `playwright install chromium` installs OS system libraries that are already present on most `ubuntu-latest` runners, but should be included for correctness.
- **GitHub Actions secrets required**: `ANTHROPIC_API_KEY` must be added to repository secrets before the fix job can run. Without it, the Claude step will fail (non-zero exit) but the workflow is otherwise harmless.
- **Repository settings change required**: "Allow GitHub Actions to create and approve pull requests" must be enabled in Settings > Actions > General for `peter-evans/create-pull-request` to function.
- **Unchanged invariants**: The Cloud Run deployment, Supabase Edge Functions, and the existing scraper service API (`POST /scrape-events`) are not touched by this plan.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| **[Security] Agent prompt injection via live Meetup DOM** | The agent reads live DOM from meetup.com. Meetup event titles/descriptions can embed instruction-formatted text. With Bash access, this is a direct injection → execution path. Mitigation: Phase 0 provides a go/no-go signal; the `add-paths` constraint limits commits; and human PR review is always required (R9). For a side project, this risk is accepted as low-probability. A hardened version would use a DOM-parser extraction step that produces structured JSON before the agent sees any content. |
| **[Security] Agent Bash access is broad in CI** | `--allowedTools "Bash,Read,Edit,Write"` with no command allowlist combined with `GITHUB_TOKEN: contents: write`. A confused or injected agent turn could modify unintended files or run unintended commands. Mitigation: `add-paths` limits what gets committed; `git diff --name-only` logs extra file touches; `--max-budget-usd 5.00` caps runaway usage; human review before merge. |
| **[Security] `ANTHROPIC_API_KEY` visible to agent subprocess** | The key is an env var in the same process where the agent has Bash access. A `printenv` call exfiltrates it. Mitigation: GitHub masks secrets in logs; key is scoped to this repo only; rotate if suspicious runs are observed. |
| Smoke test false positives (network flakiness, Meetup rate limiting) | The smoke test only runs weekly, reducing traffic. Consider `continue-on-error` + a single retry step if early runs show noise. |
| Meetup serves bot-detection challenge page to datacenter IP | A headless Chromium on a GHA runner (no cookies, datacenter IP) may see a CAPTCHA or empty DOM. Phase 0 will surface this — if Meetup blocks the agent, the approach must change before CI is built. |
| Agent fix assumes selector drift; actual breakage may be structural | If Meetup moved to a GraphQL API or requires login, the agent will exhaust turns on selector variations that can never work. Phase 0 confirms the failure mode before building the automation. |
| Smoke test can't distinguish broken scraper from "no upcoming events" | `#event-card-e-{n}` selector returns empty list (not exception) when no cards found. If utahjs has no events AND the scraper is broken, both look the same. Accepted tradeoff for a side project. |
| `utahjs` Meetup group goes inactive | Smoke test passes with 0 events (not a failure). Update `SMOKE_TEST_URL` to another active group. Low risk — utahjs has been active for years. |
| `peter-evans/create-pull-request` + `GITHUB_TOKEN` PRs don't trigger other CI workflows | Documented limitation. Manual review suffices for now. Swap to a PAT if CI on the fix PR is needed. |
| GitHub disables scheduled workflow after 60 days of repo inactivity | `workflow_dispatch` is included as a manual fallback. |
| Claude agent budget overrun | `--max-budget-usd 5.00` cap. Fix task is narrow; $5 is unlikely to be reached. |

## Documentation / Operational Notes

- Add `ANTHROPIC_API_KEY` and the repository Actions settings change to the project README or onboarding docs so future maintainers know these are required.
- The first time the workflow runs, trigger it manually via `workflow_dispatch` with the smoke test passing to confirm the happy-path skip behavior before relying on the fix path.
- If the fix agent opens a PR, review `scrape_meetup.py` changes carefully before merging — the agent has full write access to the repo during the fix step and the `add-paths` constraint on PR creation is the safety net against unintended file changes.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-02-meetup-scraper-drift-detection-requirements.md](../brainstorms/2026-04-02-meetup-scraper-drift-detection-requirements.md)
- Scraper: `functions/scraping-events/src/scraping_events/scrape_meetup.py`
- Playwright scaffold: `functions/scraping-events/src/scraping_events/playwright_utils.py`
- External: Claude CLI headless/CI docs — `--bare`, `-p`, `--allowedTools`, `--max-turns`
- External: `astral-sh/setup-uv@v5` — official uv GitHub Actions integration
- External: `peter-evans/create-pull-request@v7` — idempotent PR creation from Actions
- External: GitHub Actions `if: ${{ failure() }}` conditional — required over bare `needs.*.result` comparison
