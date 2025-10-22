// --- State Management ---
let dataUsage = {};
let serviceUsageMap = {};
let pausedDomains = {};
let isDirty = false;

// --- Initialization ---
const dataLoadedPromise = (async () => {
    const result = await chrome.storage.local.get(['dataUsage', 'serviceUsageMap', 'pausedDomains']);
    dataUsage = result.dataUsage || {};
    pausedDomains = result.pausedDomains || {};
    if (result.serviceUsageMap) {
        for (const service in result.serviceUsageMap) {
            serviceUsageMap[service] = new Set(result.serviceUsageMap[service]);
        }
    }
})();

chrome.runtime.onStartup.addListener(() => {
    // Data is already being loaded by the top-level promise
});

chrome.runtime.onInstalled.addListener(async (details) => {
    chrome.alarms.create('dataSaver', { periodInMinutes: 1 / 30 });
    chrome.alarms.create('dailyResetChecker', { periodInMinutes: 60 });

    if (details.reason === 'install') {
        await clearAllData();
        chrome.storage.local.set({ isSetupComplete: false });
    }
});

// --- Throttled Data Saving ---
async function saveData() {
    if (isDirty) {
        const serializableServiceUsageMap = {};
        for (const service in serviceUsageMap) {
            serializableServiceUsageMap[service] = Array.from(serviceUsageMap[service]);
        }
        await chrome.storage.local.set({
            dataUsage,
            serviceUsageMap: serializableServiceUsageMap,
            pausedDomains,
        });
        isDirty = false;
    }
}

// --- Hashing for Rule IDs ---
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    // Return as a string to ensure startsWith works correctly
    return `rule_${Math.abs(hash % 100000) + 1}`;
}

// --- Pause/Unpause Logic ---
async function pauseDomain(domain) {
    await dataLoadedPromise;
    if (pausedDomains[domain]) return;
    pausedDomains[domain] = true;

    const ruleId = simpleHash(domain);
    await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [{
            id: ruleId,
            priority: 1,
            action: { type: 'block' },
            condition: { resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'object', 'xmlhttprequest', 'other'], urlFilter: `||${domain}/` }
        }]
    });
    isDirty = true;
    await saveData();
}

async function unpauseDomain(domain) {
    await dataLoadedPromise;
    if (!pausedDomains[domain]) return;
    delete pausedDomains[domain];

    const ruleId = simpleHash(domain);
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
    isDirty = true;
    await saveData();
}

// --- Core Data Tracking Logic ---
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    await dataLoadedPromise;
    const { initiator, url, responseHeaders, tabId } = details;

    // Ignore requests from the extension itself
    if (initiator && initiator.startsWith('chrome-extension://' + chrome.runtime.id)) return;

    let primaryDomain;
    const requestDomain = new URL(url).hostname;

    if (tabId !== -1) {
        try {
            // This is the most reliable way to get the domain
            const tab = await chrome.tabs.get(tabId);
            if (tab && tab.url) {
                primaryDomain = new URL(tab.url).hostname;
                // Map service usage if the request is for a different domain
                if (primaryDomain !== requestDomain) {
                    if (!serviceUsageMap[requestDomain]) serviceUsageMap[requestDomain] = new Set();
                    serviceUsageMap[requestDomain].add(primaryDomain);
                }
            } else {
                 // Tab exists but has no URL, fallback to initiator
                 primaryDomain = initiator ? new URL(initiator).hostname : requestDomain;
            }
        } catch (e) {
            // Tab might be closed, this is a common case. Fallback to initiator.
            if (chrome.runtime.lastError && (chrome.runtime.lastError.message.includes('No tab with id') || chrome.runtime.lastError.message.includes('Invalid tab ID'))) {
                primaryDomain = initiator ? new URL(initiator).hostname : requestDomain;
            } else {
                console.error(e);
                primaryDomain = requestDomain;
            }
        }
    } else {
        // Background request, attribute to initiator or service
        if (initiator) {
            primaryDomain = new URL(initiator).hostname;
        } else {
            // If a service is used by only one domain, attribute it there
            const users = serviceUsageMap[requestDomain];
            primaryDomain = (users && users.size === 1) ? Array.from(users)[0] : requestDomain;
        }
    }

    if (pausedDomains[primaryDomain]) return;

    const size = parseInt(responseHeaders.find(h => h.name.toLowerCase() === 'content-length')?.value || '0', 10);
    if (size === 0) return;

    if (!dataUsage[primaryDomain]) {
      dataUsage[primaryDomain] = { totalSize: 0, perTab: {} };
    }

    dataUsage[primaryDomain].totalSize += size;

    if (tabId !== -1) {
        if (!dataUsage[primaryDomain].perTab[tabId]) {
            dataUsage[primaryDomain].perTab[tabId] = 0;
        }
        dataUsage[primaryDomain].perTab[tabId] += size;
    }
    isDirty = true;
  },
  { urls: ['<all_urls>'], types: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'other'] },
  ['responseHeaders']
);


// --- Soft Pause Logic ---
async function updateSoftPauseRules() {
    const { settings } = await chrome.storage.local.get('settings');
    if (!settings || !settings.softPauseEnabled) return;

    const tabs = await chrome.tabs.query({ active: true });
    const activeDomains = new Set(tabs.map(tab => {
        try {
            return new URL(tab.url).hostname;
        } catch {
            return null;
        }
    }).filter(Boolean));

    const allTabs = await chrome.tabs.query({});
    const allDomains = new Set(allTabs.map(tab => {
        try {
            return new URL(tab.url).hostname;
        } catch {
            return null;
        }
    }).filter(Boolean));

    const rulesToRemove = [];
    const rulesToAdd = [];

    for (const domain of allDomains) {
        const ruleId = simpleHash(`soft-pause-${domain}`);
        if (activeDomains.has(domain)) {
            rulesToRemove.push(ruleId);
        } else {
            rulesToAdd.push({
                id: ruleId,
                priority: 2,
                action: { type: 'block' },
                condition: { resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'object', 'xmlhttprequest', 'other'], urlFilter: `||${domain}/` }
            });
        }
    }

    if (rulesToRemove.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: rulesToRemove });
    }
    if (rulesToAdd.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rulesToAdd });
    }
}


// --- Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const actions = {
        getTabInfo: getTabInfo,
        unpauseDomain: (req) => unpauseDomain(req.domain),
        pauseDomain: (req) => pauseDomain(req.domain),
        clearAllData: clearAllData,
        setAutoPause: (req) => setAutoPause(req.domain, req.time),
        cancelAllAutoPauseAlarms: cancelAllAutoPauseAlarms,
        toggleSoftPauseGlobal: (req) => {
            if (req.enabled) {
                chrome.tabs.onActivated.addListener(updateSoftPauseRules);
                chrome.tabs.onUpdated.addListener(updateSoftPauseRules);
                updateSoftPauseRules();
            } else {
                chrome.tabs.onActivated.removeListener(updateSoftPauseRules);
                chrome.tabs.onUpdated.removeListener(updateSoftPauseRules);
                // remove all soft pause rules
                chrome.declarativeNetRequest.getDynamicRules((rules) => {
                    const ruleIds = rules.filter(r => r.id.startsWith('rule_')).map(r => r.id);
                    chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds });
                });
            }
        },
    };

    const performAction = async () => {
        await dataLoadedPromise;
        if (actions[request.action]) {
            const result = await actions[request.action](request);
            sendResponse(result);
        }
    };

    performAction();
    return true;
});

async function setAutoPause(domain, time) {
    const [hours, minutes] = time.split(':');
    const now = new Date();
    const alarmTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

    if (alarmTime < now) {
        alarmTime.setDate(alarmTime.getDate() + 1);
    }

    chrome.alarms.create(`auto-pause-${domain}`, {
        when: alarmTime.getTime(),
        periodInMinutes: 24 * 60
    });
}

async function cancelAllAutoPauseAlarms() {
    const allAlarms = await chrome.alarms.getAll();
    const autoPauseAlarms = allAlarms.filter(alarm => alarm.name.startsWith('auto-pause-'));
    for (const alarm of autoPauseAlarms) {
        await chrome.alarms.clear(alarm.name);
    }
}

async function getTabInfo() {
    const tabs = await chrome.tabs.query({});
    const tabData = {};

    for (const tab of tabs) {
        if (tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
            try {
                const domain = new URL(tab.url).hostname;
                if (!tabData[domain]) {
                    tabData[domain] = { tabs: [], topTab: null };
                }
                tabData[domain].tabs.push({ tabId: tab.id, windowId: tab.windowId, title: tab.title });

                const domainUsage = dataUsage[domain];
                if (domainUsage?.perTab) {
                    let maxUsage = 0;
                    let topTabId = -1;
                    for (const tabIdStr in domainUsage.perTab) {
                        const currentTabId = parseInt(tabIdStr, 10);
                        if (domainUsage.perTab[currentTabId] > maxUsage) {
                            maxUsage = domainUsage.perTab[currentTabId];
                            topTabId = currentTabId;
                        }
                    }
                    if (topTabId !== -1) {
                        const topTabInfo = tabData[domain].tabs.find(t => t.tabId === topTabId);
                        if (topTabInfo) {
                            tabData[domain].topTab = { ...topTabInfo, usage: maxUsage };
                        }
                    }
                }
            } catch (e) {
                console.error(`Error processing tab URL: ${tab.url}`, e);
            }
        }
    }
    return { tabData };
}

// --- Data Reset Logic ---
async function clearAllData() {
    const totalUsage = Object.values(dataUsage).reduce((sum, site) => sum + site.totalSize, 0);

    dataUsage = {};
    serviceUsageMap = {};
    pausedDomains = {};
    isDirty = false;

    await chrome.storage.local.set({
        lastMonthUsage: totalUsage,
        dataUsage: {},
        serviceUsageMap: {},
        pausedDomains: {},
        lastResetDate: new Date().toISOString()
    });

    // Clear all declarativeNetRequest rules
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIds = rules.map(rule => rule.id);
    if (ruleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds });
    }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    await dataLoadedPromise;
    if (alarm.name === 'dataSaver') {
        saveData();
    } else if (alarm.name === 'dailyResetChecker') {
        const { settings, lastResetDate } = await chrome.storage.local.get(['settings', 'lastResetDate']);
        if (!settings || !settings.resetDay) return;

        const now = new Date();
        // If there's no last reset date, set it to now and exit.
        if (!lastResetDate) {
            await chrome.storage.local.set({ lastResetDate: now.toISOString() });
            return;
        }

        const lastReset = new Date(lastResetDate);
        let nextReset = new Date(lastReset);

        // Calculate next reset date, ensuring it's in the future
        if (now.getDate() >= settings.resetDay) {
            nextReset.setMonth(now.getMonth() + 1);
            nextReset.setDate(settings.resetDay);
        } else {
            nextReset.setDate(settings.resetDay);
        }

        // If the calculated next reset is in the past, it means we are in the next cycle
        if (now >= nextReset) {
            await clearAllData();
        }
    } else if (alarm.name.startsWith('auto-pause-')) {
        const domain = alarm.name.replace('auto-pause-', '');
        await pauseDomain(domain);
    }
});