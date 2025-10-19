# Datafy Chrome Extension

Datafy is a Chrome extension that helps you monitor your data usage and take control of your browsing habits. It provides detailed insights into the data consumption of each website you visit, helping you identify data-hungry sites and manage your usage effectively.

## Goal

The primary goal of this extension is to provide users with powerful tools to monitor and control their internet data consumption directly within their browser. In an age of data caps and websites with heavy background activity, this extension aims to identify which sites are consuming the most data and provide automated and manual controls to prevent excessive usage.

## Features Implemented

This extension is equipped with a suite of intelligent features designed to give you full control over your data:

1.  **Data Usage Tracking:**
    *   The extension monitors all network requests and calculates the total data consumed by each website (domain).
    *   The popup UI displays a clear, real-time table of data usage per site, measured in megabytes (MB).

2.  **Automated High-Usage Warnings:**
    *   When any website's data consumption exceeds **500MB**, the extension will automatically send you a desktop notification to make you aware of its high usage.

3.  **Site Pausing at Data Limits:**
    *   If a website's data usage reaches **1GB**, a notification will appear with a "Pause Site" button.
    *   Clicking this button will immediately block all further network requests to and from that domain, effectively stopping all data consumption from that site.

4.  **"Refresh-on-Demand" for Paused Sites:**
    *   When a site is paused, you can still manually refresh the page.
    *   The extension detects this manual refresh and temporarily unpauses the site for **60 seconds**, allowing the latest content to load.
    *   After the 60-second window, the site is automatically re-paused to prevent further data usage.

5.  **Proactive Background Activity Monitoring:**
    *   The extension intelligently monitors sites running in background tabs.
    *   If a site in a non-active tab is detected making continuous network requests for over **5 minutes**, a notification will appear, asking if you would like to pause it. This helps catch misbehaving sites before they reach the high-usage data limits.

6.  **Popup Management UI:**
    *   The extension's popup window provides a central place to see all data usage and manage paused sites.
    *   A dedicated section lists all currently paused domains, with an "Unpause" button next to each one to easily restore its functionality.

7.  **Auto Pause:**
    *   This feature allows you to schedule a daily time to automatically pause a specific website. This is useful for sites you know you only use during certain hours, helping to prevent data usage outside of those times.
    *   You can enable this feature and set a default time in the settings. Then, simply click the "Auto" button next to any site in the usage list to set its daily pause time.

8.  **Soft Pause:**
    *   This is a global feature that helps reduce background data usage across all sites. When enabled in the settings, Soft Pause will automatically block network requests for any domain that does not have an active tab open. This is a great way to save data from sites that are constantly refreshing or making requests in the background.

## Screenshots

**Main View:** <br/>
![Screenshot of the main data usage view](screenshots/Screenshot%202025-10-19%20183544.png)

**Settings Page:**<br/>
![Screenshot of the settings page](screenshots/Screenshot%202025-10-19%20183613.png)

**First-Time Setup:**<br/>
![Screenshot of the first-time setup screen](screenshots/Screenshot%202025-10-19%20223406.png)

## Installation

### From the Chrome Web Store (Recommended)

The easiest way to install Datafy is from the Chrome Web Store.

*(Note: This is a placeholder. The extension is not yet published on the Chrome Web Store.)*

### Manual Installation

To install the extension manually, follow these steps:

1.  **Download the code**: Clone or download this repository to your local machine.
2.  **Open Chrome Extensions**: Open Google Chrome and navigate to `chrome://extensions`.
3.  **Enable Developer Mode**: Turn on the "Developer mode" toggle in the top-right corner.
4.  **Load Unpacked**: Click the "Load unpacked" button and select the `chrome-extension` directory from the downloaded code.

The Datafy extension should now be installed and active in your browser.

## Compatibility with Other Chromium Browsers

This extension is built using standard WebExtension APIs and should be compatible with other Chromium-based browsers that support these APIs, such as:

- **Microsoft Edge**: You can install the extension directly from the Chrome Web Store or by following the manual installation steps in Edge.
- **Brave**: Brave supports Chrome extensions, and you can install Datafy from the Chrome Web Store or manually.
- **Vivaldi**: Vivaldi is also compatible with Chrome extensions, and the installation process is the same.
- **Opera**: Opera can install Chrome extensions with the help of the "Install Chrome Extensions" addon.

While the extension is expected to work in these browsers, it is only officially tested and supported on Google Chrome.

## Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue or submit a pull request.

## License

This project is licensed under the AGPLv3 License. See the `LICENSE` file for more details.
