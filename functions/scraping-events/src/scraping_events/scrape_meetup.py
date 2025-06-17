import logging
import re
from datetime import UTC, datetime
from urllib.parse import ParseResult as ParsedUrl

from playwright.async_api import Browser, TimeoutError as PlaywrightTimeoutError, expect as pw_expect

from scraping_events.exceptions import ParsingError
from scraping_events.playwright_utils import PageWrapper
from scraping_events.schemas import Event

LOGGER = logging.getLogger(__name__)


def is_meetup_url(url_parsed: ParsedUrl) -> bool:
    hostname = url_parsed.hostname
    if hostname is None:
        return False
    return re.fullmatch(r".*\.?meetup\.com", hostname, flags=re.IGNORECASE) is not None


async def _get_upcoming_event_urls(page_wrapper: PageWrapper, starting_url: str, max_events: int) -> list[str]:
    LOGGER.info(f"Looking for upcoming events listed on {starting_url}")
    await page_wrapper.navigate(starting_url)
    page = page_wrapper.page
    try:
        await page.locator("#see-all-upcoming-events-button").click()
    except PlaywrightTimeoutError:
        LOGGER.info(f"No upcoming events listed on {starting_url}")
        return []
    await page.get_by_role("link", name="Upcoming").click()
    event_urls: list[str] = []
    for event_number in range(1, max_events + 1):
        event_card = page.locator(f"#event-card-e-{event_number}")
        try:
            await pw_expect(event_card).to_be_visible()
        except AssertionError:
            LOGGER.info(f"Failed to find event #{event_number}; stopping", exc_info=True)
            break
        event_url = await event_card.get_attribute("href")
        if event_url is None:
            raise ParsingError(f"Failed to get event URL for event #{event_number}")
        event_urls.append(event_url)
    LOGGER.info(f"Grabbed {len(event_urls)} URLs for upcoming events")
    return event_urls


async def _get_event_details(page_wrapper: PageWrapper, event_url: str) -> Event:
    LOGGER.info(f"Getting details for event at {event_url}")
    await page_wrapper.navigate(event_url)
    page = page_wrapper.page
    # title
    event_title = await page.get_by_role("heading", level=1).inner_text()
    event_title = event_title.strip()
    # description
    event_description = await page.locator("#event-details .break-words").inner_text()
    event_description = event_description.strip()
    # time
    bottom_action_bar = page.locator("[data-event-label='action-bar']")
    event_time_display = bottom_action_bar.locator("[datetime]")
    event_time_str = await event_time_display.get_attribute("datetime")
    if event_time_str is None:
        raise ParsingError(f"Failed to get event time from {event_url}")
    event_time = _parse_timestamp(event_time_str)
    # venue
    if (await page.get_by_test_id("attend-irl-btn").count()) > 0:
        venue_name_link = page.get_by_test_id("venue-name-link")
        venue_name = await venue_name_link.inner_text()
        venue_name = venue_name.strip()
        for venue_location_link in (venue_name_link, page.get_by_test_id("map-link")):
            venue_url = await venue_location_link.get_attribute("href")
            if venue_url:
                break
        else:  # never hit break
            LOGGER.warning(f"Failed to find venue URL for event at {event_url}")
        venue_address = await page.get_by_test_id("location-info").inner_text()
        venue_address = re.sub(r"\s*·\s*", ", ", venue_address).strip()
    elif (await page.get_by_test_id("attend-online-btn").count()) > 0:
        venue_name = await page.get_by_test_id("venue-name-value").inner_text()
        venue_name = venue_name.strip()
        venue_url = None
        venue_address = None
    elif (await page.get_by_test_id("needs-location").count()) > 0:
        venue_name = None
        venue_url = None
        venue_address = None
    else:
        raise ParsingError(f"Failed to identify venue for event at {event_url}")
    # image
    image_url = await page.get_by_test_id("event-description-image").locator("img").get_attribute("src")
    if not image_url:
        LOGGER.warning(f"Failed to find image URL for event at {event_url}")
    # wrap it up nicely
    return Event(
        url=event_url,
        title=event_title,
        description=event_description,
        time=event_time,
        venue_name=venue_name,
        venue_url=venue_url,
        venue_address=venue_address,
        image_url=image_url,
    )


def _parse_timestamp(timestamp_str: str) -> datetime:
    # example input: "2025-06-03T18:30:00Z[UTC]"
    match = re.fullmatch(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z\[UTC]", timestamp_str)
    if match is None:
        raise ParsingError(f"Regex failed to parse timestamp: {timestamp_str!r}")
    time_naive_str = match.group(1)
    try:
        return datetime.strptime(time_naive_str, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=UTC)
    except ValueError as e:
        raise ParsingError(f"`datetime.strptime` failed to parse timestamp: {time_naive_str!r}") from e


async def scrape_meetup(browser: Browser, url: str, max_events: int) -> list[Event]:
    async with PageWrapper.open(browser) as page_wrapper:
        event_urls = await _get_upcoming_event_urls(page_wrapper, url, max_events)
        events: list[Event] = [await _get_event_details(page_wrapper, event_url) for event_url in event_urls]
        return events
