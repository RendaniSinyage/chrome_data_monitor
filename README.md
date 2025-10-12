# Chrome Extension Data Usage Monitor

This Chrome extension provides a robust solution for monitoring data usage on a per-domain basis. It is designed to offer users a clear and organized view of their network consumption, enabling better management of internet resources.

## Features

- **Real-time Data Tracking:** Monitors and displays the amount of data downloaded for each domain in real-time.
- **Detailed Breakdown:** Offers a granular view of data usage for individual websites.
- **Low-Usage Compacting:** Automatically groups domains using less than 10MB of data into a single, expandable entry to maintain a clean and focused main list.
- **Tracking Control:** Users can pause and unpause data tracking for specific domains at any time.
- **Scheduled Auto-Pause:** Provides the ability to set a daily time to automatically pause data tracking for any specified domain.
- **Tab Counting:** Displays the number of open tabs for each domain, with a clickable link to focus the tab if only one is open.
- **Automated Data Reset:** The extension can be configured to automatically reset all tracking data on a user-defined schedule.

## Installation

To install this extension, please follow the instructions for loading an unpacked extension in a Chromium-based browser.

1.  **Obtain the Source Code:** Clone or download this repository to a local directory.
2.  **Access Browser Extensions:** In your browser, navigate to the extensions management page (e.g., `chrome://extensions` for Chrome, `edge://extensions` for Edge).
3.  **Enable Developer Mode:** Ensure that "Developer mode" is enabled. This is typically a toggle switch in the corner of the page.
4.  **Load the Extension:**
    *   Click the "Load unpacked" button.
    *   In the file dialog, select the `chrome-extension` folder from the source code directory.
5.  The extension is now installed and will be active.

## Compatibility

This extension is built on the standard WebExtension API, ensuring broad compatibility with most Chromium-based browsers, including:

- Google Chrome
- Microsoft Edge
- Opera
- Brave

While functionality is expected to be consistent across browsers, official testing has been conducted primarily on Google Chrome. Minor visual or functional discrepancies may exist on other platforms.

## Contributing

This project welcomes contributions. For bug reports, feature requests, or code submissions, please open an issue or submit a pull request on the project's repository.

## Contributors

- **ROKCT Holdings**
- **Ray Thompson**