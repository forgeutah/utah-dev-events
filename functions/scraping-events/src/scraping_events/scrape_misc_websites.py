import logging
import re
from datetime import datetime
from urllib.parse import ParseResult as ParsedUrl
from typing import Optional, Dict, List

from playwright.async_api import Browser, TimeoutError as PlaywrightTimeoutError

from scraping_events.exceptions import ParsingError
from scraping_events.playwright_utils import PageWrapper
from scraping_events.schemas import Event

LOGGER = logging.getLogger(__name__)

# Configuration for various misc websites
MISC_WEBSITE_CONFIGS = {
    "kiln.utah.gov": {
        "name": "Kiln Coworking Space",
        "event_selectors": [
            '.event-item a',
            '.calendar-event a',
            'a[href*="/events/"]',
            '.upcoming-events a'
        ],
        "title_selectors": [
            'h1.event-title',
            'h1',
            '.page-title',
            '.event-header h1'
        ],
        "desc_selectors": [
            '.event-description',
            '.event-content',
            '.content',
            'main p'
        ],
        "time_selectors": [
            '.event-date',
            '.event-time',
            'time[datetime]',
            '.date-time'
        ],
        "location_selectors": [
            '.event-location',
            '.location',
            '.venue'
        ],
        "default_location": "Kiln Coworking Space, Salt Lake City, UT"
    },
    "wework.com": {
        "name": "WeWork",
        "event_selectors": [
            '.event-card a',
            '.community-event a',
            'a[href*="/events/"]',
            '.events-list a'
        ],
        "title_selectors": [
            'h1.event-title',
            'h1',
            '.event-name',
            '.title'
        ],
        "desc_selectors": [
            '.event-description',
            '.description',
            '.event-details',
            '.content'
        ],
        "time_selectors": [
            '.event-date',
            '.date-time',
            'time[datetime]',
            '.when'
        ],
        "location_selectors": [
            '.event-location',
            '.location',
            '.where',
            '.venue'
        ],
        "default_location": "WeWork Salt Lake City, UT"
    },
    "siliconslopestechsummit.com": {
        "name": "Silicon Slopes",
        "event_selectors": [
            '.event-item a',
            '.session a',
            'a[href*="/events/"]',
            '.agenda-item a'
        ],
        "title_selectors": [
            'h1.event-title',
            'h1',
            '.session-title',
            '.event-name'
        ],
        "desc_selectors": [
            '.event-description',
            '.session-description',
            '.description',
            '.content'
        ],
        "time_selectors": [
            '.event-time',
            '.session-time',
            'time[datetime]',
            '.schedule-time'
        ],
        "location_selectors": [
            '.event-location',
            '.venue',
            '.location'
        ],
        "default_location": "Salt Palace Convention Center, Salt Lake City, UT"
    },
    "utahgeekevents.com": {
        "name": "Utah Geek Events",
        "event_selectors": [
            '.event-listing a',
            '.event-item a',
            'a[href*="/events/"]',
            '.calendar-event a'
        ],
        "title_selectors": [
            'h1.event-title',
            'h1',
            '.event-name',
            '.title'
        ],
        "desc_selectors": [
            '.event-description',
            '.description',
            '.event-details',
            '.content'
        ],
        "time_selectors": [
            '.event-date',
            '.event-time',
            'time[datetime]',
            '.when'
        ],
        "location_selectors": [
            '.event-location',
            '.location',
            '.venue'
        ],
        "default_location": "Various locations in Utah"
    }
}


def is_misc_website_url(url_parsed: ParsedUrl) -> bool:
    """Check if URL is a supported misc website."""
    hostname = url_parsed.hostname
    if hostname is None:
        return False
    
    # Check against our configured misc websites
    for configured_domain in MISC_WEBSITE_CONFIGS.keys():
        if configured_domain in hostname.lower():
            return True
    
    return False


def _get_website_config(url: str) -> Optional[Dict]:
    """Get configuration for a misc website based on URL."""
    for domain, config in MISC_WEBSITE_CONFIGS.items():
        if domain in url.lower():
            return config
    return None


async def _get_upcoming_event_urls(page_wrapper: PageWrapper, starting_url: str, max_events: int) -> list[str]:
    """Get upcoming event URLs from a misc website."""
    LOGGER.info(f"Looking for upcoming events on misc website: {starting_url}")
    
    config = _get_website_config(starting_url)
    if not config:
        LOGGER.error(f"No configuration found for website: {starting_url}")
        return []
    
    await page_wrapper.navigate(starting_url)
    page = page_wrapper.page
    
    # Wait for the page to load
    try:
        # Try to wait for any of the configured selectors
        for selector in config["event_selectors"]:
            try:
                await page.wait_for_selector(selector, timeout=3000)
                break
            except PlaywrightTimeoutError:
                continue
        else:
            LOGGER.info(f"No events found on {starting_url}")
            return []
    except Exception as e:
        LOGGER.warning(f"Error waiting for page elements: {e}")
        return []
    
    # Find all event links using configured selectors
    event_urls: list[str] = []
    
    for selector in config["event_selectors"]:
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
                                base_url = f"{page.url.split('/')[0]}//{page.url.split('/')[2]}"
                                event_url = f"{base_url}{event_url}"
                            elif not event_url.startswith('http'):
                                event_url = f"{starting_url.rstrip('/')}/{event_url}"
                            
                            # Avoid duplicate URLs
                            if event_url not in event_urls:
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
    """Extract event details from a misc website event page."""
    LOGGER.info(f"Getting details for misc website event: {event_url}")
    
    config = _get_website_config(event_url)
    if not config:
        raise ParsingError(f"No configuration found for event URL: {event_url}")
    
    await page_wrapper.navigate(event_url)
    page = page_wrapper.page
    
    # Wait for page to load
    await page.wait_for_load_state('networkidle')
    
    try:
        # Title
        event_title = None
        for selector in config["title_selectors"]:
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
        for selector in config["desc_selectors"]:
            try:
                description = await page.locator(selector).first.inner_text()
                if description and description.strip():
                    break
            except Exception:
                continue
        
        description = description.strip() if description else ""
        
        # Date and time
        event_time = None
        for selector in config["time_selectors"]:
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
                    event_time = _parse_misc_datetime(time_text)
                    if event_time:
                        break
                        
            except Exception as e:
                LOGGER.warning(f"Error parsing time with selector {selector}: {e}")
                continue
        
        if not event_time:
            LOGGER.warning(f"Could not parse event time for {event_url}")
        
        # Location/venue with Utah filtering
        venue_name = None
        venue_address = None
        venue_url = None
        
        for selector in config["location_selectors"]:
            try:
                location_elem = page.locator(selector).first
                location_text = await location_elem.inner_text()
                
                if location_text and location_text.strip():
                    location_text = location_text.strip()
                    
                    # Check if it's an online event
                    if any(keyword in location_text.lower() for keyword in ['online', 'virtual', 'zoom', 'teams']):
                        venue_name = location_text
                        venue_address = location_text
                    else:
                        venue_name = location_text
                        venue_address = location_text
                    break
                    
            except Exception as e:
                LOGGER.warning(f"Error parsing location with selector {selector}: {e}")
                continue
        
        # If no specific location found, use default
        if not venue_name and not venue_address:
            venue_name = config["name"]
            venue_address = config["default_location"]
        
        # UTAH FILTERING: Skip events not in Utah
        if venue_address:
            location_lower = venue_address.lower()
            utah_indicators = ['utah', 'ut', 'salt lake', 'provo', 'ogden', 'park city', 'byu', 'university of utah']
            
            # If it's not online and doesn't mention Utah, skip it
            is_online = any(keyword in location_lower for keyword in ['online', 'virtual', 'zoom', 'teams'])
            has_utah = any(indicator in location_lower for indicator in utah_indicators)
            
            if not is_online and not has_utah:
                LOGGER.info(f"Skipping non-Utah event: {event_title} at {venue_address}")
                raise ParsingError(f"Event not in Utah: {event_url}")
        
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
                        base_url = f"{page.url.split('/')[0]}//{page.url.split('/')[2]}"
                        image_url = f"{base_url}{image_url}"
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


def _parse_misc_datetime(time_text: str) -> Optional[datetime]:
    """Parse datetime format from misc websites."""
    try:
        # Generic datetime parsing for misc websites
        # This is a simplified parser - might need refinement based on actual formats
        
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
        LOGGER.error(f"Error parsing misc website datetime '{time_text}': {e}")
        return None


async def scrape_misc_website(browser: Browser, url: str, max_events: int) -> list[Event]:
    """Scrape events from a misc website."""
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