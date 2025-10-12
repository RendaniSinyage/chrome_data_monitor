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

    function getTabColor(index) {
        const colors = ['#81D4FA', '#A5D6A7', '#FFAB91', '#CE93D8', '#F48FB1'];
        return colors[index % colors.length];
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

        let totalBytes = 0;
        for (const domain of sortedDomains) {
            const usage = dataUsage[domain] ? dataUsage[domain].totalSize : 0;
            totalBytes += usage;
            const isPaused = pausedDomains.includes(domain);
            const tabCount = tabCounts[domain] || 0;
            const serviceUsers = serviceUsageMap[domain] ? serviceUsageMap[domain].size : 0;
            const singleTabInfo = singleTabs[domain];
            const siteEntry = createSingleSiteEntry(domain, usage, isPaused, tabCount, serviceUsers, singleTabInfo, autoPauseSettings);
            sitesContainer.appendChild(siteEntry);
        }

        totalUsageEl.textContent = formatBytes(totalBytes);
    }

    function createSingleSiteEntry(domain, usage, isPaused, tabCount, serviceUsers, singleTabInfo, autoPauseSettings) {
        const siteEntry = document.createElement('div');
        siteEntry.className = 'site-entry';
        siteEntry.dataset.domain = domain; // Add data-domain attribute
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

            if (dataUsage[domain] && dataUsage[domain].tabs) {
                const tabs = Object.values(dataUsage[domain].tabs);
                if (tabs.length > 0) {
                    const sortedTabs = Object.entries(dataUsage[domain].tabs).sort(([, a], [, b]) => b.totalSize - a.totalSize);
                    const [topTabId, topTabData] = sortedTabs[0];
                    const topTabIndex = Object.keys(dataUsage[domain].tabs).indexOf(topTabId);

                    const colorIndicator = document.createElement('span');
                    colorIndicator.className = 'color-indicator';
                    colorIndicator.style.backgroundColor = getTabColor(topTabIndex);
                    colorIndicator.title = `Top consuming tab: ${topTabData.title}`;
                    tabCountEl.appendChild(colorIndicator);
                }
            }

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
    function handleDataUsageChange(oldData, newData) {
        const LOW_USAGE_THRESHOLD = 10 * 1024 * 1024; // 10MB
        const oldKeys = Object.keys(oldData);
        const newKeys = Object.keys(newData);

        if (oldKeys.length !== newKeys.length) {
            return true; // A site was added or removed, full redraw needed
        }

        for (const domain of newKeys) {
            const oldUsage = oldData[domain] ? oldData[domain].totalSize : 0;
            const newUsage = newData[domain] ? newData[domain].totalSize : 0;

            const wasBelow = oldUsage < LOW_USAGE_THRESHOLD;
            const isBelow = newUsage < LOW_USAGE_THRESHOLD;

            if (wasBelow !== isBelow) {
                return true; // A site crossed the threshold, full redraw needed
            }
        }

        return false; // No structural changes, only numbers need updating
    }

    function updateNumbers(dataUsage) {
        let totalBytes = 0;
        const allDomains = new Set(Object.keys(dataUsage));

        for (const domain of allDomains) {
            const usage = dataUsage[domain] ? dataUsage[domain].totalSize : 0;
            totalBytes += usage;

            const siteEntry = sitesContainer.querySelector(`.site-entry[data-domain="${domain}"]`);
            if (siteEntry) {
                const usageEl = siteEntry.querySelector('.site-usage');
                if (usageEl) {
                    usageEl.textContent = formatBytes(usage);
                }
            }
        }
        totalUsageEl.textContent = formatBytes(totalBytes);
    }

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        if (changes.pausedDomains) {
            updateUI(); // Always redraw for pause/unpause changes
            return;
        }

        if (changes.dataUsage) {
            const oldValue = changes.dataUsage.oldValue || {};
            const newValue = changes.dataUsage.newValue || {};
            const needsRedraw = handleDataUsageChange(oldValue, newValue);

            if (needsRedraw) {
                updateUI();
            } else {
                updateNumbers(newValue);
            }
        }
    });

    const versionNumberEl = document.getElementById('version-number');
    versionNumberEl.textContent = chrome.runtime.getManifest().version;

    const browserVersionEl = document.getElementById('browser-version');
    if (chrome.runtime.getBrowserInfo) {
        chrome.runtime.getBrowserInfo((info) => {
            browserVersionEl.textContent = `${info.name} ${info.version}`;
        });
    } else {
        // Fallback for browsers that don't support getBrowserInfo
        const userAgent = navigator.userAgent;
        let browserName = "Unknown";
        let browserVersion = "Unknown";

        if (userAgent.indexOf("Firefox") > -1) {
            browserName = "Firefox";
            browserVersion = userAgent.substring(userAgent.indexOf("Firefox") + 8);
        } else if (userAgent.indexOf("Opera") > -1 || userAgent.indexOf("OPR") > -1) {
            browserName = "Opera";
            browserVersion = userAgent.substring(userAgent.indexOf("Opera") + 6);
            if (userAgent.indexOf("Version") > -1) {
                browserVersion = userAgent.substring(userAgent.indexOf("Version") + 8);
            }
        } else if (userAgent.indexOf("Trident") > -1) {
            browserName = "Internet Explorer";
            browserVersion = userAgent.substring(userAgent.indexOf("rv:") + 3);
        } else if (userAgent.indexOf("Edge") > -1) {
            browserName = "Edge";
            browserVersion = userAgent.substring(userAgent.indexOf("Edge") + 5);
        } else if (userAgent.indexOf("Chrome") > -1) {
            browserName = "Chrome";
            browserVersion = userAgent.substring(userAgent.indexOf("Chrome") + 7);
        } else if (userAgent.indexOf("Safari") > -1) {
            browserName = "Safari";
            browserVersion = userAgent.substring(userAgent.indexOf("Version") + 8);
        }

        browserVersion = browserVersion.split(" ")[0];
        browserVersionEl.textContent = `${browserName} ${browserVersion}`;
    }

    const clearDataBtn = document.getElementById('clear-data-btn');
    clearDataBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
            chrome.runtime.sendMessage({ action: 'clearAllData' });
        }
    });

    // --- Setup Flow ---
    const setupView = document.getElementById('setup-view');
    const mainView = document.getElementById('main-view');
    const setupCalendarContainer = document.getElementById('setup-calendar-container');
    const saveSetupBtn = document.getElementById('save-setup-btn');
    let setupSelectedResetDay = null;

    function generateSetupCalendar(selectedDay) {
        setupCalendarContainer.innerHTML = '';
        for (let i = 1; i <= 31; i++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.textContent = i;
            if (i === selectedDay) {
                dayEl.classList.add('selected');
            }
            dayEl.addEventListener('click', () => {
                setupSelectedResetDay = i;
                generateSetupCalendar(i);
            });
            setupCalendarContainer.appendChild(dayEl);
        }
    }

    saveSetupBtn.addEventListener('click', () => {
        if (setupSelectedResetDay) {
            const settings = {
                resetDay: setupSelectedResetDay,
                resetPeriod: 30 // Default to 30 days
            };
            chrome.storage.local.set({ settings, isSetupComplete: true }, () => {
                setupView.classList.add('hidden');
                mainView.classList.remove('hidden');
                initializeMainView();
            });
        }
    });

    async function checkSetup() {
        const { isSetupComplete } = await chrome.storage.local.get('isSetupComplete');
        if (isSetupComplete) {
            setupView.classList.add('hidden');
            mainView.classList.remove('hidden');
            initializeMainView();
        } else {
            setupView.classList.remove('hidden');
            mainView.classList.add('hidden');
            generateSetupCalendar(null);
        }
    }

    function initializeMainView() {
        updateUI();
        loadSettings();
        loadMonthlyComparison();
    }

    // Initial Load
    checkSetup();

    async function loadMonthlyComparison() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-indexed

        const lastMonthDate = new Date(now);
        lastMonthDate.setDate(0);
        const lastMonthYear = lastMonthDate.getFullYear();
        const lastMonth = lastMonthDate.getMonth();

        const lastMonthKey = `dataUsage_${lastMonthYear}-${lastMonth + 1}`;

        const { [lastMonthKey]: lastMonthData, dataUsage } = await chrome.storage.local.get([lastMonthKey, 'dataUsage']);

        const calculateTotalUsage = (data) => {
            if (!data) return 0;
            return Object.values(data).reduce((total, domain) => total + domain.totalSize, 0);
        };

        const currentMonthUsage = calculateTotalUsage(dataUsage);
        const lastMonthUsage = calculateTotalUsage(lastMonthData);

        totalUsageEl.textContent = formatBytes(currentMonthUsage);
        if (lastMonthUsage > 0) {
            const lastMonthEl = document.getElementById('last-month-comparison');
            lastMonthEl.textContent = ` / Last: ${formatBytes(lastMonthUsage)}`;
        }
    }
});