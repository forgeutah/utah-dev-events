import json
import logging
import re
from datetime import datetime
from urllib.parse import ParseResult as ParsedUrl

from playwright.async_api import Browser

from scraping_events.exceptions import ParsingError
from scraping_events.playwright_utils import PageWrapper
from scraping_events.schemas import Event

LOGGER = logging.getLogger(__name__)


def is_luma_url(url_parsed: ParsedUrl) -> bool:
    """Check if URL is a Luma events URL (lu.ma or luma.com)."""
    hostname = url_parsed.hostname
    if hostname is None:
        return False
    return re.fullmatch(r"(.*\.)?(lu\.ma|luma\.com)", hostname, flags=re.IGNORECASE) is not None


def _extract_json_ld(page_source: str | None) -> dict | None:
    """Parse a JSON-LD object from a script tag's text content."""
    if not page_source:
        return None
    try:
        data = json.loads(page_source)
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def _event_from_json_ld(json_ld: dict, event_url: str) -> Event:
    """Build an Event from a schema.org JSON-LD Event object."""
    title = json_ld.get("name", "").strip()
    if not title:
        raise ParsingError(f"No event name in JSON-LD for {event_url}")

    description = json_ld.get("description", "").strip()

    start_date = json_ld.get("startDate")
    if not start_date:
        raise ParsingError(f"No startDate in JSON-LD for {event_url}")
    try:
        event_time = datetime.fromisoformat(start_date)
    except ValueError as e:
        raise ParsingError(f"Invalid startDate '{start_date}' in JSON-LD for {event_url}") from e

    # Location
    venue_name = None
    venue_address = None
    venue_url = None
    location = json_ld.get("location")
    if isinstance(location, dict):
        venue_name = location.get("name")
        venue_url = location.get("url")
        address = location.get("address")
        if isinstance(address, dict):
            parts = [
                address.get("streetAddress"),
                address.get("addressLocality"),
                address.get("addressRegion"),
            ]
            venue_address = ", ".join(p for p in parts if p) or None
        elif isinstance(address, str):
            venue_address = address or None

    # Image
    image_url = None
    images = json_ld.get("image")
    if isinstance(images, list) and images:
        image_url = images[0]
    elif isinstance(images, str):
        image_url = images

    # Canonical URL — prefer the @id from JSON-LD (luma.com form)
    canonical_url = json_ld.get("@id") or event_url

    return Event(
        url=canonical_url,
        title=title,
        description=description,
        time=event_time,
        venue_name=venue_name,
        venue_url=venue_url,
        venue_address=venue_address,
        image_url=image_url,
    )


async def _get_json_ld(page_wrapper: PageWrapper, url: str) -> dict | None:
    """Navigate to a URL and return the first JSON-LD object, or None."""
    await page_wrapper.navigate(url)
    page = page_wrapper.page
    await page.wait_for_load_state("domcontentloaded")

    json_ld_texts: list[str] = await page.evaluate("""() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        return Array.from(scripts).map(s => s.textContent);
    }""")

    for text in json_ld_texts:
        result = _extract_json_ld(text)
        if result:
            return result
    return None


async def scrape_luma(browser: Browser, url: str, max_events: int) -> list[Event]:
    """Scrape events from a Luma URL (single event or organizer/calendar page).

    Routing is based on JSON-LD @type:
    - @type=Event: scrape that single event directly
    - @type=Organization: extract event URLs from the nested events[] array
    """
    async with PageWrapper.open(browser) as page_wrapper:
        json_ld = await _get_json_ld(page_wrapper, url)
        if json_ld is None:
            raise ParsingError(f"No JSON-LD found on {url}")

        ld_type = json_ld.get("@type")

        if ld_type == "Event":
            LOGGER.info(f"Single event page: {url}")
            return [_event_from_json_ld(json_ld, url)]

        if ld_type == "Organization":
            LOGGER.info(f"Organization page: {url}")
            nested_events = json_ld.get("events", [])
            if not isinstance(nested_events, list):
                return []

            events: list[Event] = []
            for event_ld in nested_events[:max_events]:
                if not isinstance(event_ld, dict) or event_ld.get("@type") != "Event":
                    continue
                event_url = event_ld.get("@id") or url
                try:
                    # The nested JSON-LD may be partial — navigate to the full event page
                    full_ld = await _get_json_ld(page_wrapper, event_url)
                    if full_ld and full_ld.get("@type") == "Event":
                        events.append(_event_from_json_ld(full_ld, event_url))
                    else:
                        # Fall back to the partial nested data
                        events.append(_event_from_json_ld(event_ld, event_url))
                except (ParsingError, Exception) as e:
                    LOGGER.error(f"Failed to scrape event {event_url}: {e}")
                    continue
            return events

        raise ParsingError(f"Unexpected JSON-LD @type '{ld_type}' on {url}")
