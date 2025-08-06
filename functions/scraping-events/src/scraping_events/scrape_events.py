import dataclasses
import logging
from collections.abc import Awaitable, Callable
from urllib.parse import ParseResult as ParsedUrl, urlparse

from playwright.async_api import Browser

from scraping_events.exceptions import UnknownEventProviderError
from scraping_events.schemas import Event
from scraping_events.scrape_meetup import is_meetup_url, scrape_meetup
from scraping_events.scrape_luma import is_luma_url, scrape_luma
from scraping_events.scrape_eventbrite import is_eventbrite_url, scrape_eventbrite
from scraping_events.scrape_byu_cs import is_byu_cs_url, scrape_byu_cs
from scraping_events.scrape_utah_cs import is_utah_cs_url, scrape_utah_cs
from scraping_events.scrape_misc_websites import is_misc_website_url, scrape_misc_website

LOGGER = logging.getLogger(__name__)


@dataclasses.dataclass
class EventProvider:
    name: str
    identifier: Callable[[ParsedUrl], bool]
    scrape_func: Callable[[Browser, str, int], Awaitable[list[Event]]]


EVENT_PROVIDERS: list[EventProvider] = [
    EventProvider(
        name="Meetup.com",
        identifier=is_meetup_url,
        scrape_func=scrape_meetup,
    ),
    EventProvider(
        name="Luma Events",
        identifier=is_luma_url,
        scrape_func=scrape_luma,
    ),
    EventProvider(
        name="Eventbrite",
        identifier=is_eventbrite_url,
        scrape_func=scrape_eventbrite,
    ),
    EventProvider(
        name="BYU CS Department",
        identifier=is_byu_cs_url,
        scrape_func=scrape_byu_cs,
    ),
    EventProvider(
        name="University of Utah CS",
        identifier=is_utah_cs_url,
        scrape_func=scrape_utah_cs,
    ),
    EventProvider(
        name="Misc Websites",
        identifier=is_misc_website_url,
        scrape_func=scrape_misc_website,
    )
]


async def scrape_events(browser: Browser, url: str, max_events: int) -> list[Event]:
    LOGGER.info(f"Processing URL: {url}")
    url_parsed = urlparse(url, allow_fragments=False)
    for event_provider in EVENT_PROVIDERS:
        if event_provider.identifier(url_parsed):
            LOGGER.info(f"URL recognized as belonging to event provider {event_provider.name}")
            scraped_events = await event_provider.scrape_func(browser, url, max_events)
            LOGGER.info(f"Successfully scraped {len(scraped_events)} events from {url}")
            return scraped_events
    # no match
    raise UnknownEventProviderError(f"Could not determine event provider for provided URL: {url}")
