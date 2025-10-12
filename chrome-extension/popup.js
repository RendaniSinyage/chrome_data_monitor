document.addEventListener('DOMContentLoaded', () => {
    const sitesContainer = document.getElementById('sites-container');
    const totalUsageEl = document.getElementById('total-usage');
    const loadingMessageEl = document.getElementById('loading-message');
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsView = document.getElementById('settings-view');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const calendarContainer = document.getElementById('calendar-container');
    const resetPeriodSelect = document.getElementById('reset-period');
    let selectedResetDay = null;

    // --- Calendar Logic ---
    function generateCalendar(selectedDay) {
        calendarContainer.innerHTML = '';
        for (let i = 1; i <= 31; i++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.textContent = i;
            if (i === selectedDay) {
                dayEl.classList.add('selected');
            }
            dayEl.addEventListener('click', () => {
                selectedResetDay = i;
                generateCalendar(i);
            });
            calendarContainer.appendChild(dayEl);
        }
    }

    // --- Settings Logic ---
    settingsBtn.addEventListener('click', () => {
        settingsView.classList.toggle('hidden');
    });

    saveSettingsBtn.addEventListener('click', () => {
        const settings = {
            resetDay: selectedResetDay,
            resetPeriod: parseInt(resetPeriodSelect.value, 10)
        };
        chrome.storage.local.set({ settings });
        settingsView.classList.add('hidden');
    });

    async function loadSettings() {
        const { settings } = await chrome.storage.local.get('settings');
        if (settings) {
            selectedResetDay = settings.resetDay;
            resetPeriodSelect.value = settings.resetPeriod;
        }
        generateCalendar(selectedResetDay);
    }

    // --- Tab Switching Logic ---
    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.dataset.tab;

            tabLinks.forEach(l => l.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            link.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // --- Utility Functions ---
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // --- Rendering Logic ---
    function renderSites(dataUsage, pausedDomains, tabCounts, serviceUsageMap, singleTabs, autoPauseSettings) {
        sitesContainer.innerHTML = '';
        loadingMessageEl.style.display = 'none';

        const allDomains = new Set(Object.keys(dataUsage));
        pausedDomains.forEach(domain => allDomains.add(domain));

        if (allDomains.size === 0) {
            sitesContainer.innerHTML = '<div class="site-entry"><div class="site-info">No data tracked yet.</div></div>';
            return;
        }

        const sortedDomains = Array.from(allDomains).sort((a, b) => {
            const usageA = dataUsage[a] ? dataUsage[a].totalSize : -1;
            const usageB = dataUsage[b] ? dataUsage[b].totalSize : -1;
            return usageB - usageA;
        });

        const topSites = sortedDomains.slice(0, 3);
        const otherSites = sortedDomains.slice(3);
        let otherSitesTotal = 0;

        let totalBytes = 0;
        for (const domain of sortedDomains) {
            const usage = dataUsage[domain] ? dataUsage[domain].totalSize : 0;
            totalBytes += usage;
        }

        for (const domain of otherSites) {
            otherSitesTotal += dataUsage[domain] ? dataUsage[domain].totalSize : 0;
        }

        for (const domain of topSites) {
            const usage = dataUsage[domain] ? dataUsage[domain].totalSize : 0;
            const isPaused = pausedDomains.includes(domain);
            const tabCount = tabCounts[domain] || 0;
            const serviceUsers = serviceUsageMap[domain] ? serviceUsageMap[domain].size : 0;
            const singleTabInfo = singleTabs[domain];
            const siteEntry = createSingleSiteEntry(domain, usage, isPaused, tabCount, serviceUsers, singleTabInfo, autoPauseSettings);
            sitesContainer.appendChild(siteEntry);
        }

        if (otherSites.length > 0) {
            createCompactedEntry(otherSites, otherSitesTotal, dataUsage, pausedDomains, tabCounts, serviceUsageMap, singleTabs, autoPauseSettings);
        }

        totalUsageEl.textContent = formatBytes(totalBytes);
    }

    function createSingleSiteEntry(domain, usage, isPaused, tabCount, serviceUsers, singleTabInfo, autoPauseSettings) {
        const siteEntry = document.createElement('div');
        siteEntry.className = 'site-entry';
        if (isPaused) {
            siteEntry.classList.add('paused');
        }

        const siteInfo = document.createElement('div');
        siteInfo.className = 'site-info';

        const siteDomain = document.createElement('div');
        siteDomain.className = 'site-domain';
        siteDomain.textContent = domain;

        if (tabCount > 0) {
            const tabCountEl = document.createElement('span');
            tabCountEl.className = 'tab-count';
            tabCountEl.textContent = `${tabCount} tab${tabCount > 1 ? 's' : ''}`;

            if (singleTabInfo) {
                tabCountEl.classList.add('clickable');
                tabCountEl.addEventListener('click', () => {
                    chrome.windows.update(singleTabInfo.windowId, { focused: true });
                    chrome.tabs.update(singleTabInfo.tabId, { active: true });
                });
            }
            siteDomain.appendChild(tabCountEl);
        }

        const siteUsage = document.createElement('div');
        siteUsage.className = 'site-usage';
        siteUsage.textContent = formatBytes(usage);

        siteInfo.appendChild(siteDomain);
        siteInfo.appendChild(siteUsage);

        if (serviceUsers > 1) {
            const serviceInfo = document.createElement('div');
            serviceInfo.className = 'service-info';
            serviceInfo.textContent = `Used by ${serviceUsers} sites`;
            siteInfo.appendChild(serviceInfo);
        }

        const siteControls = document.createElement('div');
        siteControls.className = 'site-controls';

        const autoPauseBtn = document.createElement('button');
        autoPauseBtn.className = 'auto-pause-btn';
        autoPauseBtn.textContent = 'Auto';
        if (autoPauseSettings && autoPauseSettings[domain]) {
            autoPauseBtn.classList.add('active');
        }

        const pauseBtn = document.createElement('button');
        pauseBtn.textContent = isPaused ? 'Unpause' : 'Pause';
        pauseBtn.className = isPaused ? 'unpause-btn' : 'pause-btn';

        pauseBtn.onclick = () => {
            const action = isPaused ? 'unpauseDomain' : 'pauseDomain';
            chrome.runtime.sendMessage({ action, domain });
        };

        const timeMenu = document.createElement('div');
        timeMenu.className = 'time-menu hidden';

        const timeInput = document.createElement('input');
        timeInput.type = 'time';
        timeMenu.appendChild(timeInput);

        const setTimeBtn = document.createElement('button');
        setTimeBtn.textContent = 'Set';
        setTimeBtn.addEventListener('click', () => {
            if (timeInput.value) {
                chrome.runtime.sendMessage({ action: 'setAutoPause', domain: domain, time: timeInput.value });
                timeMenu.classList.add('hidden');
            }
        });
        timeMenu.appendChild(setTimeBtn);

        const clearTimeBtn = document.createElement('button');
        clearTimeBtn.textContent = 'Clear';
        clearTimeBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'clearAutoPause', domain: domain });
            timeMenu.classList.add('hidden');
        });
        timeMenu.appendChild(clearTimeBtn);

        autoPauseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            timeMenu.classList.toggle('hidden');
        });

        siteControls.appendChild(autoPauseBtn);
        siteControls.appendChild(pauseBtn);
        siteControls.appendChild(timeMenu);
        siteEntry.appendChild(siteInfo);
        siteEntry.appendChild(siteControls);
        return siteEntry;
    }

    function createCompactedEntry(sites, totalUsage, dataUsage, pausedDomains, tabCounts, serviceUsageMap, singleTabs, autoPauseSettings) {
        const compactedEntry = document.createElement('div');
        compactedEntry.className = 'site-entry compacted';

        const header = document.createElement('div');
        header.className = 'header';
        header.textContent = `Low-usage sites (${sites.length}) - ${formatBytes(totalUsage)}`;
        header.addEventListener('click', () => {
            compactedEntry.classList.toggle('expanded');
        });
        compactedEntry.appendChild(header);

        const details = document.createElement('div');
        details.className = 'details';
        for (const domain of sites) {
            const usage = dataUsage[domain] ? dataUsage[domain].totalSize : 0;
            const isPaused = pausedDomains.includes(domain);
            const tabCount = tabCounts[domain] || 0;
            const serviceUsers = serviceUsageMap[domain] ? serviceUsageMap[domain].size : 0;
            const singleTabInfo = singleTabs[domain];
            const siteEntry = createSingleSiteEntry(domain, usage, isPaused, tabCount, serviceUsers, singleTabInfo, autoPauseSettings);
            details.appendChild(siteEntry);
        }
        compactedEntry.appendChild(details);
        sitesContainer.appendChild(compactedEntry);
    }

    // --- Data Fetching and Updates ---
    async function updateUI() {
        loadingMessageEl.style.display = 'block';
        sitesContainer.innerHTML = '';

        const [storageData, tabs] = await Promise.all([
            chrome.storage.local.get(['dataUsage', 'pausedDomains', 'serviceUsageMap', 'autoPauseSettings']),
            chrome.tabs.query({})
        ]);

        const tabCounts = {};
        const singleTabs = {};
        const domainToTabMap = {};

        for (const tab of tabs) {
            try {
                const domain = new URL(tab.url).hostname;
                if (!domainToTabMap[domain]) {
                    domainToTabMap[domain] = [];
                }
                domainToTabMap[domain].push({ tabId: tab.id, windowId: tab.windowId });
            } catch (e) {
                // Ignore invalid URLs
            }
        }

        for (const domain in domainToTabMap) {
            const domainTabs = domainToTabMap[domain];
            tabCounts[domain] = domainTabs.length;
            if (domainTabs.length === 1) {
                singleTabs[domain] = domainTabs[0];
            }
        }

        renderSites(
            storageData.dataUsage || {},
            storageData.pausedDomains || [],
            tabCounts,
            storageData.serviceUsageMap || {},
            singleTabs,
            storageData.autoPauseSettings || {}
        );
    }

    // --- Event Listeners ---
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.dataUsage || changes.pausedDomains)) {
            updateUI();
        }
    });

    const versionNumberEl = document.getElementById('version-number');
    versionNumberEl.textContent = chrome.runtime.getManifest().version;

    const clearDataBtn = document.getElementById('clear-data-btn');
    clearDataBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
            chrome.runtime.sendMessage({ action: 'clearAllData' });
        }
    });

    // Initial Load
    updateUI();
    loadSettings();
});