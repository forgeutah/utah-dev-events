import logging
import re
from datetime import UTC, datetime
from urllib.parse import ParseResult as ParsedUrl, urlparse

from playwright.async_api import Browser, TimeoutError as PlaywrightTimeoutError

from scraping_events.exceptions import ParsingError
from scraping_events.playwright_utils import PageWrapper
from scraping_events.schemas import Event

LOGGER = logging.getLogger(__name__)


def is_meetup_url(url_parsed: ParsedUrl) -> bool:
    hostname = url_parsed.hostname
    if hostname is None:
        return False
    return re.fullmatch(r".*\.?meetup\.com", hostname, flags=re.IGNORECASE) is not None


def _extract_group_url(url: str) -> str | None:
    """If url is an event URL, return the group base URL. Otherwise return None."""
    parsed = urlparse(url)
    match = re.match(r"(/[^/]+)/events/", parsed.path)
    if match:
        return f"{parsed.scheme}://{parsed.netloc}{match.group(1)}/"
    return None


async def _get_upcoming_event_urls(page_wrapper: PageWrapper, starting_url: str, max_events: int) -> list[str]:
    group_url = _extract_group_url(starting_url)

    if group_url is not None:
        # starting_url is an event page — check whether it belongs to a recurring series.
        # Non-recurring (one-time) events should be returned as-is so _get_event_details
        # can scrape their details. Recurring events redirect to the group page so all
        # upcoming instances are collected.
        await page_wrapper.navigate(starting_url)
        page = page_wrapper.page
        series = await page.evaluate("""() => {
            const s = document.getElementById('__NEXT_DATA__');
            if (!s) return null;
            try {
                const d = JSON.parse(s.textContent);
                return d.props?.pageProps?.event?.series ?? null;
            } catch(e) { return null; }
        }""")
        if series is None:
            LOGGER.info(f"Non-recurring event URL; returning single event: {starting_url}")
            return [starting_url]
        LOGGER.info(f"Recurring event URL normalised to group URL: {starting_url} -> {group_url}")
    else:
        group_url = starting_url

    LOGGER.info(f"Looking for upcoming events listed on {group_url}")
    await page_wrapper.navigate(group_url)
    page = page_wrapper.page
    try:
        await page.locator("#see-all-upcoming-events-button").click()
    except PlaywrightTimeoutError:
        LOGGER.info(f"No upcoming events listed on {starting_url}")
        return []
    try:
        await page.get_by_role("button", name="Upcoming").click()
    except PlaywrightTimeoutError:
        LOGGER.warning("Could not click Upcoming button, proceeding with current event list")
    # Event cards no longer have stable IDs — collect event links by URL pattern,
    # scoped to this group to avoid picking up related-events from other groups.
    group_path = urlparse(group_url).path.rstrip("/")
    # Wait for actual event cards — these have numeric IDs and ?eventOrigin in their hrefs,
    # unlike nav links (/events/, /events/calendar/) that are always present on the page.
    event_card_selector = f"a[href*='{group_path}/events/'][href*='eventOrigin']"
    try:
        await page.locator(event_card_selector).first.wait_for()
    except PlaywrightTimeoutError:
        LOGGER.info(f"No event links found on events page for {starting_url}")
        return []
    # Extract all matching hrefs atomically to avoid stale element issues.
    all_hrefs: list[str] = await page.evaluate(
        """(groupPath) => {
            const links = document.querySelectorAll('a[href]');
            const hrefs = [];
            for (const a of links) {
                const href = a.getAttribute('href');
                if (href && href.includes(groupPath + '/events/') && /\\/events\\/\\d+/.test(href)) {
                    hrefs.push(href);
                }
            }
            return hrefs;
        }""",
        group_path,
    )
    event_urls: list[str] = []
    seen: set[str] = set()
    for href in all_hrefs:
        base_url = href.split("?")[0].rstrip("/") + "/"
        if base_url not in seen:
            seen.add(base_url)
            event_urls.append(base_url)
        if len(event_urls) >= max_events:
            break
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
    event_description = await page.locator(".break-words").first.inner_text()
    event_description = event_description.strip()
    # time
    bottom_action_bar = page.locator("[data-event-label='action-bar']")
    event_time_display = bottom_action_bar.locator("[datetime]")
    event_time_str = await event_time_display.get_attribute("datetime")
    if event_time_str is None:
        raise ParsingError(f"Failed to get event time from {event_url}")
    event_time = _parse_timestamp(event_time_str)
    # venue — use embedded Next.js page data for stable extraction of venue fields
    # that were previously accessed via data-testid selectors that no longer exist.
    next_event_data: dict = await page.evaluate("""
        () => {
            const s = document.getElementById('__NEXT_DATA__');
            if (!s) return {};
            try {
                const d = JSON.parse(s.textContent);
                const ev = d.props?.pageProps?.event;
                return ev ? {
                    eventType: ev.eventType,
                    venue: ev.venue,
                    featuredEventPhoto: ev.featuredEventPhoto
                } : {};
            } catch(e) { return {}; }
        }
    """)
    # Attend buttons are absent on past/ended events, so fall back to eventType from
    # __NEXT_DATA__ when none of the buttons are present.
    event_type = next_event_data.get("eventType")
    is_irl = (await page.get_by_test_id("attend-irl-btn").count()) > 0 or event_type == "PHYSICAL"
    is_online = (await page.get_by_test_id("attend-online-btn").count()) > 0 or event_type == "ONLINE"
    no_location = (await page.get_by_test_id("needs-location").count()) > 0

    if is_irl and not is_online:
        venue_data = next_event_data.get("venue") or {}
        venue_name = (venue_data.get("name") or "").strip() or None
        addr_parts = [venue_data.get("address", ""), venue_data.get("city", ""), (venue_data.get("state") or "").upper()]
        venue_address = ", ".join(p for p in addr_parts if p) or None
        map_link = page.locator("[data-testid='map-link']")
        venue_url = await map_link.first.get_attribute("href") if await map_link.count() > 0 else None
        if not venue_url:
            LOGGER.warning(f"Failed to find venue URL for event at {event_url}")
    elif is_online:
        venue_data = next_event_data.get("venue") or {}
        venue_name = (venue_data.get("name") or "Online event").strip()
        venue_url = None
        venue_address = None
    elif no_location:
        venue_name = None
        venue_url = None
        venue_address = None
    else:
        raise ParsingError(f"Failed to identify venue for event at {event_url}")
    # image — prefer structured data, fall back to first highres image on page
    photo_data = next_event_data.get("featuredEventPhoto") or {}
    image_url = photo_data.get("source") or None
    if not image_url:
        img_el = page.locator("img[src*='highres']")
        image_url = await img_el.first.get_attribute("src") if await img_el.count() > 0 else None
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
