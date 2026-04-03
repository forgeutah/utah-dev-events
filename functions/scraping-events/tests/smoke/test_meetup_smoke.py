"""
Smoke tests for the Meetup scraper.

These tests invoke the scraper CLI as a subprocess against live Meetup pages.
They require network access and are slower than unit tests.

Run with:
    cd functions/scraping-events
    SMOKE_TEST_URL=<meetup_url> DEBUG=false uv run pytest tests/smoke/ -v

Environment:
    SMOKE_TEST_URL  (required) Meetup URL to test — can be a group URL or a specific event URL.
"""

import json
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path

import pytest

# functions/scraping-events/ — resolved relative to this file's location
# parents[0]=smoke/, parents[1]=tests/, parents[2]=scraping-events/
_SCRAPING_DIR = Path(__file__).parents[2]

# Pattern: meetup.com/<group-slug>/events/<event-id>/
_EVENT_URL_PATTERN = re.compile(r"meetup\.com/[^/]+/events/\d+")


def _smoke_test_url() -> str:
    url = os.environ.get("SMOKE_TEST_URL", "")
    if not url:
        pytest.skip("SMOKE_TEST_URL not set")
    return url


def _is_event_url(url: str) -> bool:
    """True if the URL points to a specific event rather than a group page."""
    return bool(_EVENT_URL_PATTERN.search(url))


def _run_cli(url: str, max_events: int = 2) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["uv", "run", "python", "-m", "scraping_events.main_cli", url, "--max-events", str(max_events)],
        capture_output=True,
        text=True,
        cwd=_SCRAPING_DIR,
        env={**os.environ, "DEBUG": "false"},
    )


def _assert_event_fields(event: dict) -> None:
    """Assert that an event dict has all 8 schema fields with valid non-nullable values."""
    required_keys = {"url", "title", "description", "time", "venue_name", "venue_url", "venue_address", "image_url"}
    missing = required_keys - set(event.keys())
    assert not missing, f"Event missing fields: {missing}"

    assert event["url"], "event.url must be non-empty"
    assert event["url"].startswith("https://"), f"event.url must start with https://, got: {event['url']!r}"
    assert event["title"], "event.title must be non-empty"
    assert event["time"], "event.time must be non-null"

    # time must parse as a timezone-aware ISO 8601 datetime
    parsed = datetime.fromisoformat(event["time"])
    assert parsed.tzinfo is not None, f"event.time must be timezone-aware, got: {event['time']!r}"


@pytest.mark.smoke
def test_scraper_returns_valid_events() -> None:
    """
    Scraping the SMOKE_TEST_URL exits 0 and returns valid event JSON.

    Behaviour adapts to the URL type:
    - Group URL: expects a list of events (may be empty if none upcoming)
    - Event URL: expects at least 1 event with full field validation
    """
    url = _smoke_test_url()
    result = _run_cli(url, max_events=5)

    assert result.returncode == 0, (
        f"CLI exited {result.returncode}\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    data = json.loads(result.stdout)
    assert "events" in data, f"Expected 'events' key in response, got: {list(data.keys())}"
    assert isinstance(data["events"], list), f"Expected events to be a list, got {type(data['events'])}"

    if _is_event_url(url):
        assert len(data["events"]) >= 1, "Event URL should return at least 1 event"

    for event in data["events"]:
        _assert_event_fields(event)
