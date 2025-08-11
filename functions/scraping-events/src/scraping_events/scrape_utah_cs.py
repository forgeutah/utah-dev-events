import logging
import re
from datetime import datetime
from urllib.parse import ParseResult as ParsedUrl
from typing import Optional

from playwright.async_api import Browser, TimeoutError as PlaywrightTimeoutError

from scraping_events.exceptions import ParsingError
from scraping_events.playwright_utils import PageWrapper
from scraping_events.schemas import Event

LOGGER = logging.getLogger(__name__)

UTAH_CS_EVENTS_URL = "https://www.cs.utah.edu/events/"


def is_utah_cs_url(url_parsed: ParsedUrl) -> bool:
    """Check if URL is University of Utah CS department events page."""
    return url_parsed.geturl().startswith("https://www.cs.utah.edu/events")


async def _get_upcoming_event_urls(page_wrapper: PageWrapper, starting_url: str, max_events: int) -> list[str]:
    """Get upcoming event URLs from University of Utah CS events page."""
    LOGGER.info(f"Looking for upcoming events on U of U CS page: {starting_url}")
    await page_wrapper.navigate(starting_url)
    page = page_wrapper.page
    
    # Wait for the page to load
    try:
        await page.wait_for_selector('.event-item, .event-card, .event, .news-item', timeout=10000)
    except PlaywrightTimeoutError:
        LOGGER.info(f"No events found on {starting_url}")
        return []
    
    # Find all event links
    event_urls: list[str] = []
    
    # Try different selectors that might be used for event listings
    selectors = [
        '.event-item a',
        '.event-card a', 
        '.event a',
        'a[href*="/events/"]',
        '.upcoming-events a',
        '.news-item a',
        '.calendar-event a'
    ]
    
    for selector in selectors:
        try:
            event_links = page.locator(selector)
            count = await event_links.count()
            
            if count > 0:
                LOGGER.info(f"Found {count} event links using selector: {selector}")
                
                for i in range(min(count, max_events)):
                    try:
                        event_url = await event_links.nth(i).get_attribute('href')
                        if event_url:
                            # Ensure full URL
                            if event_url.startswith('/'):
                                event_url = f"https://www.cs.utah.edu{event_url}"
                            elif not event_url.startswith('http'):
                                event_url = f"https://www.cs.utah.edu/events/{event_url}"
                            
                            # Only include event URLs, not navigation links
                            if ('/events/' in event_url or '/news/' in event_url) and event_url not in event_urls:
                                event_urls.append(event_url)
                                LOGGER.info(f"Found event URL: {event_url}")
                    except Exception as e:
                        LOGGER.warning(f"Error extracting URL from event link {i}: {e}")
                        continue
                
                if event_urls:  # If we found events with this selector, use them
                    break
                    
        except Exception as e:
            LOGGER.warning(f"Error with selector {selector}: {e}")
            continue
    
    LOGGER.info(f"Collected {len(event_urls)} event URLs")
    return event_urls


async def _get_event_details(page_wrapper: PageWrapper, event_url: str) -> Event:
    """Extract event details from a University of Utah CS event page."""
    LOGGER.info(f"Getting details for U of U CS event: {event_url}")
    await page_wrapper.navigate(event_url)
    page = page_wrapper.page
    
    # Wait for page to load
    await page.wait_for_load_state('networkidle')
    
    try:
        # Title - try multiple selectors
        title_selectors = [
            'h1.event-title',
            'h1',
            '.event-header h1',
            '.page-title',
            '.news-title',
            'article h1'
        ]
        
        event_title = None
        for selector in title_selectors:
            try:
                event_title = await page.locator(selector).first.inner_text()
                if event_title and event_title.strip():
                    break
            except Exception:
                continue
        
        if not event_title:
            raise ParsingError(f"Could not find event title for {event_url}")
        
        event_title = event_title.strip()
        
        # Description
        description = ""
        desc_selectors = [
            '.event-description',
            '.event-content',
            '.content',
            'main p',
            '.event-details',
            'article .content',
            '.news-content'
        ]
        
        for selector in desc_selectors:
            try:
                description = await page.locator(selector).first.inner_text()
                if description and description.strip():
                    break
            except Exception:
                continue
        
        description = description.strip() if description else ""
        
        # Date and time
        event_time = None
        time_selectors = [
            '.event-date',
            '.event-time', 
            '.date-time',
            'time[datetime]',
            '.event-meta .date',
            '.news-date'
        ]
        
        for selector in time_selectors:
            try:
                time_elem = page.locator(selector).first
                
                # Try to get datetime attribute first
                datetime_str = await time_elem.get_attribute('datetime')
                if datetime_str:
                    event_time = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
                    break
                
                # If no datetime attribute, try to parse text content
                time_text = await time_elem.inner_text()
                if time_text:
                    event_time = _parse_utah_datetime(time_text)
                    if event_time:
                        break
                        
            except Exception as e:
                LOGGER.warning(f"Error parsing time with selector {selector}: {e}")
                continue
        
        if not event_time:
            LOGGER.warning(f"Could not parse event time for {event_url}")
        
        # Location/venue - U of U events are typically on campus
        venue_name = None
        venue_address = None
        venue_url = None
        
        location_selectors = [
            '.event-location',
            '.location',
            '.venue',
            '.event-meta .location'
        ]
        
        for selector in location_selectors:
            try:
                location_elem = page.locator(selector).first
                location_text = await location_elem.inner_text()
                
                if location_text and location_text.strip():
                    location_text = location_text.strip()
                    
                    # Check if it's an online event
                    if any(keyword in location_text.lower() for keyword in ['online', 'virtual', 'zoom', 'teams']):
                        venue_name = location_text
                    else:
                        # Most U of U events are on campus
                        venue_name = location_text
                        venue_address = f"{location_text}, University of Utah, Salt Lake City, UT"
                    break
                    
            except Exception as e:
                LOGGER.warning(f"Error parsing location with selector {selector}: {e}")
                continue
        
        # If no specific location found, assume it's on U of U campus
        if not venue_name and not venue_address:
            venue_name = "University of Utah Computer Science Department"
            venue_address = "University of Utah, Salt Lake City, UT 84112"
        
        # Image
        image_url = None
        img_selectors = [
            '.event-image img',
            '.hero-image img',
            'main img',
            'article img'
        ]
        
        for selector in img_selectors:
            try:
                image_url = await page.locator(selector).first.get_attribute('src')
                if image_url:
                    # Ensure full URL
                    if image_url.startswith('/'):
                        image_url = f"https://www.cs.utah.edu{image_url}"
                    break
            except Exception:
                continue
        
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


def _parse_utah_datetime(time_text: str) -> Optional[datetime]:
    """Parse University of Utah's datetime format."""
    try:
        # U of U might show dates like "December 14, 2024 at 2:00 PM"
        # This is a simplified parser - might need refinement based on actual format
        
        # Remove common words and normalize
        cleaned = re.sub(r'\s+at\s+', ' ', time_text)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        # Try different parsing patterns
        patterns = [
            r'(\w+)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)',
            r'(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)',
            r'(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})',
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
        LOGGER.error(f"Error parsing U of U datetime '{time_text}': {e}")
        return None


async def scrape_utah_cs(browser: Browser, url: str, max_events: int) -> list[Event]:
    """Scrape events from University of Utah CS department events page."""
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