import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        extension_path = "chrome-extension"
        browser = await p.chromium.launch_persistent_context(
            "",
            headless=False,
            args=[
                f"--disable-extensions-except={extension_path}",
                f"--load-extension={extension_path}",
            ],
        )

        # Try to find the service worker
        service_worker = None
        for target in browser.service_workers:
            service_worker = target
            break

        if not service_worker:
            # Fallback to finding the background page if service worker is not found
            for page in browser.pages:
                if "background" in page.url:
                    service_worker = page
                    break

        if not service_worker:
            print("Could not find service worker or background page.")
            await browser.close()
            return

        extension_id = service_worker.url.split('/')[2]
        popup_url = f"chrome-extension://{extension_id}/popup.html"

        page = await browser.new_page()
        await page.goto(popup_url)

        # Complete setup if needed
        if await page.locator("#setup-view").is_visible():
            await page.locator("#save-setup-btn").click()

        # Verify main view is active
        await expect(page.locator("#main-view")).to_be_visible()

        # Navigate to a website to generate data
        data_page = await browser.new_page()
        await data_page.goto("https://www.google.com")
        await data_page.wait_for_timeout(1000)

        # Go back to the popup
        await page.bring_to_front()
        await page.reload()

        # Verify auto-pause button is visible
        await expect(page.locator(".auto-pause-btn").first).to_be_visible()

        # Open settings
        await page.locator('#settings-btn').click()
        await page.locator('.tab-link[data-tab="settings-tab"]').click()

        # Verify settings tab is active
        await expect(page.locator("#settings-tab")).to_be_visible()

        # Verify soft-pause toggle is not checked
        soft_pause_card = page.locator(".setting-card", has_text="Soft Pause")
        await expect(soft_pause_card.locator("#soft-pause-toggle")).not_to_be_checked()

        await page.screenshot(path="jules-scratch/verification/verification.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())