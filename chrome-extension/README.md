# Data Tracker Chrome Extension

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