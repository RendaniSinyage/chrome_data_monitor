import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    extension_path = os.path.abspath('chrome-extension')

    async with async_playwright() as p:
        browser_context = await p.chromium.launch_persistent_context(
            '',
            headless=True,
            args=[
                f'--disable-extensions-except={extension_path}',
                f'--load-extension={extension_path}',
            ]
        )

        await asyncio.sleep(1)

        background_page = None
        async with browser_context.expect_event("serviceworker") as event_info:
            background_page = await event_info.value

        if not background_page:
            print("Could not find background page or service worker.")
            await browser_context.close()
            return

        extension_id = background_page.url.split('/')[2]

        page = await browser_context.new_page()

        # Simulate some initial data with multiple tabs
        await background_page.evaluate('''() => {
            chrome.storage.local.set({
                dataUsage: {
                    'example.com': {
                        totalSize: 25 * 1024 * 1024,
                        tabs: {
                            '101': { totalSize: 15 * 1024 * 1024, title: 'Example Tab 1' },
                            '102': { totalSize: 10 * 1024 * 1024, title: 'Example Tab 2' }
                        }
                    },
                    'google.com': {
                        totalSize: 50 * 1024 * 1024,
                        tabs: {
                            '201': { totalSize: 40 * 1024 * 1024, title: 'Google Search' },
                            '202': { totalSize: 10 * 1024 * 1024, title: 'Gmail' }
                        }
                    }
                }
            });
        }''')

        await page.goto(f'chrome-extension://{extension_id}/popup.html')

        await page.wait_for_selector('.tab-link[data-tab="top-tabs-tab"]')
        await page.click('.tab-link[data-tab="top-tabs-tab"]')

        await page.wait_for_selector('#top-tabs-container .site-entry')

        await page.screenshot(path='jules-scratch/verification/verification.png')

        await browser_context.close()

if __name__ == '__main__':
    asyncio.run(main())