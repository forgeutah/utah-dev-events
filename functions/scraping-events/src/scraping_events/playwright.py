import asyncio
import logging
import random
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Self

from playwright.async_api import Browser, BrowserContext, Error as PlaywrightError, Page, async_playwright

from scraping_events.env import get_env
from scraping_events.exceptions import NavigationError

LOGGER = logging.getLogger(__name__)

_HEADLESS = not get_env().debug
_TRACES_DIR = Path("traces")


@asynccontextmanager
async def launch_browser() -> AsyncGenerator[Browser]:
    async with (
        async_playwright() as pw,
        await pw.chromium.launch(headless=_HEADLESS) as browser,
    ):
        yield browser


@asynccontextmanager
async def launch_browser_context(browser: Browser) -> AsyncGenerator[BrowserContext]:
    async with await browser.new_context(timezone_id="UTC") as browser_context:
        env = get_env()
        browser_context.set_default_timeout(env.playwright_timeout_ms)
        record_trace = env.debug
        if record_trace:
            try:
                await browser_context.tracing.start(snapshots=True, screenshots=True, sources=True)
            except Exception:
                LOGGER.exception("Failed to start recording Playwright trace for debugging")
        try:
            yield browser_context
        finally:
            if record_trace:
                try:
                    _TRACES_DIR.mkdir(parents=True, exist_ok=True)
                    timestamp = datetime.now(UTC).strftime("%Y_%m_%d-%H_%M_%S")
                    hex_ = "".join(random.choices("0123456789abcdef", k=4))
                    trace_path = _TRACES_DIR / f"trace-{timestamp}-{hex_}.zip"
                    await browser_context.tracing.stop(path=trace_path)
                except Exception:
                    LOGGER.exception("Failed to save completed Playwright trace for debugging")
                else:
                    LOGGER.info(f"Playwright trace saved to {trace_path}")


class PageWrapper:
    @classmethod
    @asynccontextmanager
    async def open(cls, browser: Browser) -> AsyncGenerator[Self]:
        async with (
            launch_browser_context(browser) as browser_context,
            await browser_context.new_page() as page,
        ):
            yield cls(page)

    def __init__(self, page: Page):
        super().__init__()
        self.page = page

    async def navigate(self, url: str):
        for attempt in range(3):
            if attempt > 0:
                await asyncio.sleep(5)
            try:
                response = await self.page.goto(url)
            except PlaywrightError:
                LOGGER.exception(f"Failed to navigate to {url} (attempt {attempt + 1})")
                continue
            if response is not None and not response.ok:
                LOGGER.error(f"Failed to navigate to {url} (attempt {attempt + 1}): {response.status}")
                continue
            # success
            return
        # never got a success
        raise NavigationError(url)
