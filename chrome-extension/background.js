// --- Data and State Management ---
const domainDataUsage = {};
const backgroundActivity = {};
let isDirty = false;

// --- Initialization ---
chrome.runtime.onStartup.addListener(loadInitialData);

chrome.runtime.onInstalled.addListener(() => {
    loadInitialData();
    chrome.alarms.create('dataSaver', { periodInMinutes: 1 / 30 }); // Save every 2 seconds
    chrome.alarms.create('backgroundActivityChecker', { periodInMinutes: 1 });
});

async function loadInitialData() {
    const result = await chrome.storage.local.get('dataUsage');
    if (result.dataUsage) {
        Object.assign(domainDataUsage, result.dataUsage);
    }
}

// --- Throttled Data Saving ---
async function saveData() {
    if (isDirty) {
        await chrome.storage.local.set({ dataUsage: domainDataUsage });
        isDirty = false;
    }
}

// --- Hashing for Deterministic Rule IDs ---
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    // Ensure the ID is positive and within a safe range for declarativeNetRequest
    return Math.abs(hash % 100000) + 1;
}

// --- Core Pause/Unpause Logic ---
async function pauseDomain(domain) {
    const ruleId = simpleHash(domain);
    const { pausedDomains = [] } = await chrome.storage.local.get('pausedDomains');

    if (!pausedDomains.includes(domain)) {
        pausedDomains.push(domain);
        await chrome.storage.local.set({ pausedDomains });
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [{
            id: ruleId,
            priority: 1,
            action: { type: 'block' },
            condition: { urlFilter: `||${domain}/`, resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'object', 'xmlhttprequest', 'other'] }
        }]
    });
}

async function unpauseDomain(domain) {
    const ruleId = simpleHash(domain);
    const { pausedDomains = [] } = await chrome.storage.local.get('pausedDomains');

    const index = pausedDomains.indexOf(domain);
    if (index > -1) {
        pausedDomains.splice(index, 1);
        await chrome.storage.local.set({ pausedDomains });
    }

    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
}

// --- Event Listeners ---
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    const { initiator, url, responseHeaders, tabId } = details;
    const requestDomain = new URL(url).hostname;

    let initiatorDomain;
    try {
        // Use the initiator if it exists, otherwise fall back to the request's own domain
        initiatorDomain = initiator ? new URL(initiator).hostname : requestDomain;
    } catch (e) {
        // If initiator is not a valid URL (e.g., "null"), fall back to the request domain
        initiatorDomain = requestDomain;
    }

    // Ignore requests initiated by the extension itself
    if (initiator && initiator.startsWith(chrome.runtime.id)) {
        return;
    }

    const { pausedDomains = [] } = await chrome.storage.local.get('pausedDomains');
    if (pausedDomains.includes(initiatorDomain)) return;

    const contentLength = responseHeaders.find(h => h.name.toLowerCase() === 'content-length');
    const size = contentLength ? parseInt(contentLength.value, 10) : 0;

    // Initialize initiator data if it doesn't exist
    if (!domainDataUsage[initiatorDomain]) {
      domainDataUsage[initiatorDomain] = { totalSize: 0, requests: {}, warned: false, paused: false };
    }

    // Initialize request data within the initiator if it doesn't exist
    if (!domainDataUsage[initiatorDomain].requests[requestDomain]) {
        domainDataUsage[initiatorDomain].requests[requestDomain] = { totalSize: 0 };
    }

    // Accumulate sizes
    domainDataUsage[initiatorDomain].totalSize += size;
    domainDataUsage[initiatorDomain].requests[requestDomain].totalSize += size;

    const PAUSE_THRESHOLD = 1024 * 1024 * 1024;
    const WARNING_THRESHOLD = 500 * 1024 * 1024;

    if (domainDataUsage[initiatorDomain].totalSize > PAUSE_THRESHOLD && !domainDataUsage[initiatorDomain].paused) {
        chrome.notifications.create(`pause-${initiatorDomain}`, { type: 'basic', iconUrl: 'icon.png', title: 'Data Limit Exceeded', message: `Site "${initiatorDomain}" used over 1GB.`, buttons: [{ title: 'Pause Site' }]});
        domainDataUsage[initiatorDomain].paused = true;
    } else if (domainDataUsage[initiatorDomain].totalSize > WARNING_THRESHOLD && !domainDataUsage[initiatorDomain].warned) {
        chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title: 'High Data Usage', message: `Site "${initiatorDomain}" used over 500MB.`});
        domainDataUsage[initiatorDomain].warned = true;
    }

    isDirty = true;

    chrome.tabs.get(tabId, (tab) => {
        if (tab && !tab.active) {
            if (!backgroundActivity[initiatorDomain]) {
                backgroundActivity[initiatorDomain] = { firstRequestTime: Date.now() };
            }
        }
    });
  },
  { urls: ['<all_urls>'], types: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'other'] },
  ['responseHeaders']
);

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (buttonIndex === 0) {
        if (notificationId.startsWith('pause-')) {
            pauseDomain(notificationId.replace('pause-', ''));
        } else if (notificationId.startsWith('proactive-pause-')) {
            pauseDomain(notificationId.replace('proactive-pause-', ''));
        }
    }
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId !== 0 || !['reload', 'start_page'].includes(details.transitionType)) return;

    const { pausedDomains = [] } = await chrome.storage.local.get('pausedDomains');
    const domain = new URL(details.url).hostname;

    if (pausedDomains.includes(domain)) {
        await unpauseDomain(domain);
        setTimeout(() => pauseDomain(domain), 60000);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'unpauseDomain') {
        unpauseDomain(request.domain).then(() => sendResponse({ success: true }));
        return true; // Indicates asynchronous response
    } else if (request.action === 'pauseDomain') {
        pauseDomain(request.domain).then(() => sendResponse({ success: true }));
        return true; // Indicates asynchronous response
    }
});

chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab && tab.url) {
            try {
                delete backgroundActivity[new URL(tab.url).hostname];
            } catch (e) { /* Ignore invalid URLs */ }
        }
    });
});

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'dataSaver') {
        saveData();
    } else if (alarm.name === 'backgroundActivityChecker') {
        const now = Date.now();
        for (const domain in backgroundActivity) {
            if (now - backgroundActivity[domain].firstRequestTime > 300000) {
                chrome.notifications.create(`proactive-pause-${domain}`, { type: 'basic', iconUrl: 'icon.png', title: 'Background Activity Detected', message: `The site "${domain}" has been using data in the background for over 5 minutes. Would you like to pause it?`, buttons: [{ title: 'Pause Site' }]});
                delete backgroundActivity[domain];
            }
        }
    }
});