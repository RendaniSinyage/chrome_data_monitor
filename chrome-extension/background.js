// --- Data and State Management ---
const domainDataUsage = {};
const serviceUsageMap = {};
const backgroundActivity = {};
let isDirty = false;

// --- Initialization ---
chrome.runtime.onStartup.addListener(loadInitialData);

chrome.runtime.onInstalled.addListener(() => {
    loadInitialData();
    chrome.alarms.create('dataSaver', { periodInMinutes: 1 / 30 }); // Save every 2 seconds
    chrome.alarms.create('backgroundActivityChecker', { periodInMinutes: 1 });
    chrome.alarms.create('dailyResetChecker', { periodInMinutes: 60 * 24 }); // Check once a day
});

async function loadInitialData() {
    const result = await chrome.storage.local.get(['dataUsage', 'serviceUsageMap']);
    if (result.dataUsage) {
        Object.assign(domainDataUsage, result.dataUsage);
    }
    if (result.serviceUsageMap) {
        // Reconstruct the Sets from the stored arrays
        for (const service in result.serviceUsageMap) {
            serviceUsageMap[service] = new Set(result.serviceUsageMap[service]);
        }
    }
}

// --- Throttled Data Saving ---
async function saveData() {
    if (isDirty) {
        // Convert Sets to arrays for JSON serialization
        const serializableServiceUsageMap = {};
        for (const service in serviceUsageMap) {
            serializableServiceUsageMap[service] = Array.from(serviceUsageMap[service]);
        }
        await chrome.storage.local.set({
            dataUsage: domainDataUsage,
            serviceUsageMap: serializableServiceUsageMap
        });
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
    // Prioritize getting the initiator from the tab URL for accuracy
    if (tabId !== -1) {
        try {
            const tab = await new Promise((resolve, reject) => {
                chrome.tabs.get(tabId, (tab) => {
                    if (chrome.runtime.lastError) {
                        return reject(chrome.runtime.lastError);
                    }
                    resolve(tab);
                });
            });
            if (tab && tab.url) {
                initiatorDomain = new URL(tab.url).hostname;
                // If the request is for a different domain, map the service to the initiator
                if (initiatorDomain !== requestDomain) {
                    if (!serviceUsageMap[requestDomain]) {
                        serviceUsageMap[requestDomain] = new Set();
                    }
                    serviceUsageMap[requestDomain].add(initiatorDomain);
                }
            }
        } catch (e) {
            // Tab might be closed, fall back to other methods
        }
    }

    // Fallback for background requests or when tab info is unavailable
    if (!initiatorDomain) {
        const users = serviceUsageMap[requestDomain];
        if (users && users.size === 1) {
            // If one site uses this service, attribute the data to that site
            initiatorDomain = Array.from(users)[0];
        } else {
            // Otherwise, attribute to the service itself or the request's origin
            try {
                initiatorDomain = initiator ? new URL(initiator).hostname : requestDomain;
            } catch (e) {
                initiatorDomain = requestDomain;
            }
        }
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

async function clearData() {
    Object.keys(domainDataUsage).forEach(key => delete domainDataUsage[key]);
    Object.keys(serviceUsageMap).forEach(key => delete serviceUsageMap[key]);
    await chrome.storage.local.remove(['dataUsage', 'serviceUsageMap']);
    await chrome.storage.local.set({ lastResetDate: new Date().toISOString() });
    isDirty = false;
    // Trigger UI update
    await chrome.storage.local.set({ dataUsage: {} });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
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
    } else if (alarm.name === 'dailyResetChecker') {
        const { settings } = await chrome.storage.local.get('settings');
        if (settings && settings.resetDay && settings.resetPeriod) {
            const { lastResetDate } = await chrome.storage.local.get('lastResetDate');
            const lastReset = lastResetDate ? new Date(lastResetDate) : new Date(0);
            const now = new Date();
            const daysSinceReset = (now - lastReset) / (1000 * 60 * 60 * 24);

            if (daysSinceReset >= settings.resetPeriod) {
                if (now.getDate() === settings.resetDay) {
                    await clearData();
                }
            }
        }
    }
});