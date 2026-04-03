"""
Smoke tests for each URL type defined in .env.local or environment variables.

URL variables are resolved in priority order: environment variables first, then
.env.local. This lets CI inject secrets without needing the file on disk.

Run all local URL tests:
    cd functions/scraping-events
    DEBUG=false uv run pytest tests/smoke/test_meetup_local_urls.py -v

Run a single URL type:
    DEBUG=false uv run pytest tests/smoke/test_meetup_local_urls.py -v -k hybrid

Override a single URL via env:
    HYBRID_EVENT_URL=<url> DEBUG=false uv run pytest tests/smoke/test_meetup_local_urls.py -v -k hybrid
"""

import json
import os
import subprocess
from datetime import datetime
from pathlib import Path

import pytest
from dotenv import dotenv_values

# functions/scraping-events/ — parents[0]=smoke/, parents[1]=tests/, parents[2]=scraping-events/
_SCRAPING_DIR = Path(__file__).parents[2]

_LOCAL_ENV_FILE = _SCRAPING_DIR / ".env.local"

# Each entry is (var_name, expected_venue_type, min_events).
# expected_venue_type drives type-specific assertions:
#   "physical"  — every returned event must have a venue_address
#   "online"    — if a single event is returned, it must have no venue_address/venue_url
#   None        — no venue-type assertion (group/mixed results)
# min_events: minimum number of events expected (0 = no minimum enforced)
_URL_VARS: list[tuple[str, str | None, int]] = [
    ("GROUP_URL", None, 0),
    ("EVENT_URL", None, 1),
    ("ONLINE_ONLY_EVENT_URL", "online", 0),
    ("HYBRID_EVENT_URL", "physical", 1),
    ("IN_PERSON_EVENT_URL", "physical", 1),
    ("GROUP_EVENTS_PAGE_URL", None, 0),
]


def _load_urls() -> list[tuple[str, str, str | None, int]]:
    """Return [(var_name, url, expected_venue_type, min_events), ...] for every non-empty URL.

    Environment variables take precedence over .env.local so CI secrets work without
    a file on disk.
    """
    file_env = dotenv_values(_LOCAL_ENV_FILE) if _LOCAL_ENV_FILE.exists() else {}
    result = []
    for var, expected_type, min_events in _URL_VARS:
        url = os.environ.get(var) or file_env.get(var) or ""
        if url:
            result.append((var, url, expected_type, min_events))
    return result


def _run_cli(url: str, max_events: int = 5) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["uv", "run", "python", "-m", "scraping_events.main_cli", url, "--max-events", str(max_events)],
        capture_output=True,
        text=True,
        cwd=_SCRAPING_DIR,
        env={**os.environ, "DEBUG": "false"},
    )


def _assert_event_fields(event: dict) -> None:
    """Assert that an event has all 8 schema fields with valid non-nullable values."""
    required_keys = {"url", "title", "description", "time", "venue_name", "venue_url", "venue_address", "image_url"}
    missing = required_keys - set(event.keys())
    assert not missing, f"Event missing fields: {missing}"

    assert event["url"], "event.url must be non-empty"
    assert event["url"].startswith("https://"), f"event.url must start with https://, got: {event['url']!r}"
    assert event["title"], "event.title must be non-empty"
    assert event["time"], "event.time must be non-null"

    parsed = datetime.fromisoformat(event["time"])
    assert parsed.tzinfo is not None, f"event.time must be timezone-aware, got: {event['time']!r}"


def _param_id(var_name: str) -> str:
    return var_name.lower().replace("_url", "").replace("_", "-")


_loaded_urls = _load_urls()

_params = [
    pytest.param(url, expected_type, min_events, id=_param_id(var))
    for var, url, expected_type, min_events in _loaded_urls
]


@pytest.mark.smoke
@pytest.mark.skipif(not _loaded_urls, reason=".env.local not found or no URLs set")
@pytest.mark.parametrize("url,expected_venue_type,min_events", _params)
def test_scraper_returns_valid_events(url: str, expected_venue_type: str | None, min_events: int) -> None:
    """Scrape a URL, validate event structure, and assert correct venue classification."""
    result = _run_cli(url)

    assert result.returncode == 0, (
        f"CLI exited {result.returncode}\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    data = json.loads(result.stdout)
    assert "events" in data, f"Expected 'events' key in response, got: {list(data.keys())}"
    events: list[dict] = data["events"]
    assert isinstance(events, list)

    if min_events:
        assert len(events) >= min_events, f"Expected >= {min_events} events, got {len(events)}"

    for event in events:
        _assert_event_fields(event)

    # Type-specific venue assertions
    if expected_venue_type == "physical":
        # Every event from a physical/hybrid URL must have a venue_address.
        # This catches the bug where hybrid events were stored as online-only.
        for event in events:
            assert event.get("venue_address"), (
                f"Expected a physical venue_address for {url!r}, "
                f"but got venue_address={event.get('venue_address')!r} for {event['title']!r}"
            )

    if expected_venue_type == "online" and len(events) == 1:
        # Only assert venue type when the URL returned a single event (non-recurring).
        # Recurring online-only events redirect to the group page and return a mixed list.
        event = events[0]
        assert event.get("venue_address") is None and event.get("venue_url") is None, (
            f"Expected online-only venue for {url!r}, "
            f"but got venue_address={event.get('venue_address')!r}, "
            f"venue_url={event.get('venue_url')!r} for {event['title']!r}"
        )
