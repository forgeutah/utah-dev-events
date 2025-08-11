import logging
import re
from datetime import datetime
from urllib.parse import ParseResult as ParsedUrl
from typing import Optional

from playwright.async_api import Browser, TimeoutError as PlaywrightTimeoutError
from playwright.async_api import expect as pw_expect

from scraping_events.exceptions import ParsingError
from scraping_events.playwright_utils import PageWrapper
from scraping_events.schemas import Event

LOGGER = logging.getLogger(__name__)


def is_luma_url(url_parsed: ParsedUrl) -> bool:
    """Check if URL is a Luma events URL."""
    hostname = url_parsed.hostname
    if hostname is None:
        return False
    return re.fullmatch(r".*\.?lu\.ma", hostname, flags=re.IGNORECASE) is not None


async def _get_upcoming_event_urls(page_wrapper: PageWrapper, starting_url: str, max_events: int) -> list[str]:
    """Get upcoming event URLs from a Luma organizer page."""
    LOGGER.info(f"Looking for upcoming events on Luma page: {starting_url}")
    await page_wrapper.navigate(starting_url)
    page = page_wrapper.page
    
    # Wait for the page to load
    try:
        await page.wait_for_selector('[data-testid="event-card"]', timeout=10000)
    except PlaywrightTimeoutError:
        LOGGER.info(f"No events found on {starting_url}")
        return []
    
    # Find all event cards
    event_cards = page.locator('[data-testid="event-card"]')
    event_count = await event_cards.count()
    
    LOGGER.info(f"Found {event_count} event cards on page")
    
    event_urls: list[str] = []
    for i in range(min(event_count, max_events)):
        try:
            event_card = event_cards.nth(i)
            # Get the event link
            event_link = event_card.locator('a').first
            event_url = await event_link.get_attribute('href')
            
            if event_url:
                # Convert relative URLs to absolute
                if event_url.startswith('/'):
                    event_url = f"https://lu.ma{event_url}"
                event_urls.append(event_url)
                LOGGER.info(f"Found event URL: {event_url}")
        except Exception as e:
            LOGGER.warning(f"Error extracting URL from event card {i}: {e}")
            continue
    
    LOGGER.info(f"Collected {len(event_urls)} event URLs")
    return event_urls


async def _get_event_details(page_wrapper: PageWrapper, event_url: str) -> Event:
    """Extract event details from a Luma event page."""
    LOGGER.info(f"Getting details for Luma event: {event_url}")
    await page_wrapper.navigate(event_url)
    page = page_wrapper.page
    
    # Wait for page to load
    await page.wait_for_load_state('networkidle')
    
    try:
        # Title
        title_selector = 'h1[data-testid="event-title"]'
        await page.wait_for_selector(title_selector, timeout=5000)
        event_title = await page.locator(title_selector).inner_text()
        event_title = event_title.strip()
        
        # Description
        description = ""
        try:
            desc_selector = '[data-testid="event-description"]'
            description = await page.locator(desc_selector).inner_text()
            description = description.strip()
        except Exception:
            LOGGER.warning(f"Could not find description for event: {event_url}")
        
        # Date and time
        event_time = None
        try:
            # Luma typically shows date/time in structured data or specific selectors
            time_selector = '[data-testid="event-date-time"]'
            time_text = await page.locator(time_selector).inner_text()
            event_time = _parse_luma_datetime(time_text)
        except Exception as e:
            LOGGER.warning(f"Could not parse event time for {event_url}: {e}")
            # Try alternative selectors
            try:
                # Look for datetime attributes or structured data
                datetime_elem = page.locator('[datetime]').first
                datetime_str = await datetime_elem.get_attribute('datetime')
                if datetime_str:
                    event_time = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
            except Exception:
                LOGGER.error(f"Failed to extract event time from {event_url}")
        
        # Location/venue
        venue_name = None
        venue_address = None
        venue_url = None
        
        try:
            # Try to find location information
            location_selector = '[data-testid="event-location"]'
            location_text = await page.locator(location_selector).inner_text()
            if location_text and location_text.strip():
                # Check if it's an online event
                if any(keyword in location_text.lower() for keyword in ['online', 'virtual', 'zoom', 'meet']):
                    venue_name = location_text.strip()
                else:
                    venue_address = location_text.strip()
                    # Try to extract venue name if available
                    venue_name_elem = page.locator('[data-testid="venue-name"]')
                    if await venue_name_elem.count() > 0:
                        venue_name = await venue_name_elem.inner_text()
        except Exception:
            LOGGER.warning(f"Could not find location for event: {event_url}")
        
        # Image
        image_url = None
        try:
            img_selector = '[data-testid="event-image"] img'
            image_url = await page.locator(img_selector).get_attribute('src')
        except Exception:
            LOGGER.warning(f"Could not find image for event: {event_url}")
        
        return Event(
            url=event_url,
            title=event_title,
            description=description,
            time=event_time,
            venue_name=venue_name,
            venue_url=venue_url,
            venue_address=venue_address,
            image_url=image_url,
        )
        
    except Exception as e:
        LOGGER.error(f"Error extracting event details from {event_url}: {e}")
        raise ParsingError(f"Failed to extract event details from {event_url}") from e


def _parse_luma_datetime(time_text: str) -> Optional[datetime]:
    """Parse Luma's datetime format."""
    try:
        # Luma might show dates like "Thu, Dec 12, 2024 at 6:00 PM MST"
        # This is a simplified parser - might need refinement based on actual Luma format
        
        # Remove common words and normalize
        cleaned = re.sub(r'\s+at\s+', ' ', time_text)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        # Try different parsing patterns
        patterns = [
            r'(\w{3}),?\s+(\w{3})\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)',
            r'(\w{3})\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)',
            r'(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, cleaned, re.IGNORECASE)
            if match:
                # This would need proper date parsing logic
                # For now, return None to avoid errors
                LOGGER.warning(f"Date parsing not fully implemented for: {time_text}")
                return None
        
        return None
        
    except Exception as e:
        LOGGER.error(f"Error parsing Luma datetime '{time_text}': {e}")
        return None


async def scrape_luma(browser: Browser, url: str, max_events: int) -> list[Event]:
    """Scrape events from a Luma organizer page."""
    async with PageWrapper.open(browser) as page_wrapper:
        event_urls = await _get_upcoming_event_urls(page_wrapper, url, max_events)
        events: list[Event] = []
        
        for event_url in event_urls:
            try:
                event = await _get_event_details(page_wrapper, event_url)
                events.append(event)
            except Exception as e:
                LOGGER.error(f"Failed to scrape event {event_url}: {e}")
                continue
        
        return events