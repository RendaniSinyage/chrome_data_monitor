import asyncio
from playwright.async_api import async_playwright
import os
import time

async def main():
    # Path to the extension
    extension_path = os.path.abspath('chrome-extension')

    async with async_playwright() as p:
        # Launch a browser with the extension loaded
        browser_context = await p.chromium.launch_persistent_context(
            '',
            headless=True,
            args=[
                f'--disable-extensions-except={extension_path}',
                f'--load-extension={extension_path}',
            ]
        )

        # Give the extension a moment to load
        await asyncio.sleep(1)

        # Find the extension's background page (service worker)
        background_page = None
        # Wait for the service worker to be created
        async with browser_context.expect_event("serviceworker") as event_info:
            background_page = await event_info.value

        if not background_page:
            print("Could not find background page or service worker.")
            await browser_context.close()
            return


        # Get the extension ID from the background page URL
        extension_id = background_page.url.split('/')[2]

        # --- Test Starts Here ---
        page = await browser_context.new_page()

        # Simulate some initial data
        await background_page.evaluate('''() => {
            chrome.storage.local.set({
                dataUsage: {
                    'example.com': { totalSize: 5 * 1024 * 1024 }, // 5MB
                    'google.com': { totalSize: 15 * 1024 * 1024 }, // 15MB
                }
            });
        }''')

        # Open the popup
        await page.goto(f'chrome-extension://{extension_id}/popup.html')
        await page.wait_for_selector('.site-entry')

        # Take initial screenshot
        await page.screenshot(path='jules-scratch/verification/01_initial_state.png')

        # Now, update the data without crossing a threshold
        await background_page.evaluate('''() => {
            chrome.storage.local.set({
                dataUsage: {
                    'example.com': { totalSize: 7 * 1024 * 1024 }, // 7MB
                    'google.com': { totalSize: 18 * 1024 * 1024 }, // 18MB
                }
            });
        }''')

        # Wait for the numbers to update
        await asyncio.sleep(1)

        # Take screenshot after non-structural update
        await page.screenshot(path='jules-scratch/verification/02_numbers_updated.png')

        # Now, update the data causing a structural change (example.com crosses the 10MB threshold)
        await background_page.evaluate('''() => {
            chrome.storage.local.set({
                dataUsage: {
                    'example.com': { totalSize: 12 * 1024 * 1024 }, // 12MB
                    'google.com': { totalSize: 20 * 1024 * 1024 }, // 20MB
                }
            });
        }''')

        # Wait for the full re-render
        await asyncio.sleep(1)

        # Take final screenshot
        await page.screenshot(path='jules-scratch/verification/verification.png')

        await browser_context.close()

if __name__ == '__main__':
    asyncio.run(main())