document.addEventListener('DOMContentLoaded', () => {
    // --- Element Cache ---
    const elements = {
        sitesContainer: document.getElementById('sites-container'),
        totalUsage: document.getElementById('total-usage'),
        lastMonthComparison: document.getElementById('last-month-comparison'),
        sinceDateInfo: document.getElementById('since-date-info'),
        loadingMessage: document.getElementById('loading-message'),
        tabLinks: document.querySelectorAll('.tab-link'),
        tabContents: document.querySelectorAll('.tab-content'),
        settingsBtn: document.getElementById('settings-btn'),
        versionNumber: document.getElementById('version-number'),
        browserVersion: document.getElementById('browser-version'),
        clearDataBtn: document.getElementById('clear-data-btn'),
        setupView: document.getElementById('setup-view'),
        mainView: document.getElementById('main-view'),
        setupCalendarContainer: document.getElementById('setup-calendar-container'),
        saveSetupBtn: document.getElementById('save-setup-btn'),
    };

    let selectedResetDay = 1;

    // --- Settings ---
    const settingsTab = document.querySelector('.tab-link[data-tab="settings-tab"]');
    settingsTab.style.display = 'none';

    elements.settingsBtn.addEventListener('click', () => {
        const settingsTabContent = document.getElementById('settings-tab');
        if (settingsTab.classList.contains('active')) {
            elements.tabLinks.forEach(l => l.classList.remove('active'));
            elements.tabContents.forEach(c => c.classList.remove('active'));
            document.querySelector('.tab-link[data-tab="data-usage-tab"]').classList.add('active');
            document.getElementById('data-usage-tab').classList.add('active');
            settingsTab.style.display = 'none';
        } else {
            elements.tabLinks.forEach(l => l.classList.remove('active'));
            elements.tabContents.forEach(c => c.classList.remove('active'));
            settingsTab.style.display = 'block';
            settingsTab.classList.add('active');
            settingsTabContent.classList.add('active');
        }
    });

    async function loadSettings() {
        const alwaysCompareToggle = document.getElementById('always-compare-toggle');
        const resetDaySelect = document.getElementById('reset-day-select');
        const resetPeriodSelect = document.getElementById('reset-period-select');
        const softPauseToggle = document.getElementById('soft-pause-toggle');

        // Populate reset day dropdown
        for (let i = 1; i <= 31; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            resetDaySelect.appendChild(option);
        }

        const { settings } = await chrome.storage.local.get('settings');
        if (settings) {
            alwaysCompareToggle.checked = settings.alwaysCompare || false;
            resetDaySelect.value = settings.resetDay || 1;
            resetPeriodSelect.value = settings.resetPeriod || '30';
            softPauseToggle.checked = settings.softPauseEnabled || false;
        }

        function saveSettings() {
            chrome.storage.local.get(['settings'], (result) => {
                const newSettings = result.settings || {};
                newSettings.alwaysCompare = alwaysCompareToggle.checked;
                newSettings.resetDay = parseInt(resetDaySelect.value, 10);
                newSettings.resetPeriod = resetPeriodSelect.value;
                newSettings.softPauseEnabled = softPauseToggle.checked;
                chrome.storage.local.set({ settings: newSettings });
            });
        }

        alwaysCompareToggle.addEventListener('change', saveSettings);
        resetDaySelect.addEventListener('change', saveSettings);
        resetPeriodSelect.addEventListener('change', saveSettings);
        softPauseToggle.addEventListener('change', () => {
            saveSettings();
            chrome.runtime.sendMessage({ action: 'toggleSoftPauseGlobal', enabled: softPauseToggle.checked });
        });
    }

    // --- Tab Switching ---
    elements.tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.dataset.tab;
            elements.tabLinks.forEach(l => l.classList.remove('active'));
            elements.tabContents.forEach(c => c.classList.remove('active'));
            link.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // --- Rendering ---
    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

    function getTabColor(index) {
        const colors = ['#81D4FA', '#A5D6A7', '#FFAB91', '#CE93D8', '#F48FB1'];
        return colors[index % colors.length];
    }

    function renderSites(dataUsage, pausedDomains, tabData) {
        elements.loadingMessage.style.display = 'none';
        elements.sitesContainer.innerHTML = '';
        const allDomains = new Set([...Object.keys(dataUsage || {}), ...Object.keys(pausedDomains || {})]);

        if (allDomains.size === 0) {
            elements.sitesContainer.innerHTML = '<div class="site-entry"><div class="site-info">No data tracked yet. Browse some sites to see usage.</div></div>';
            elements.totalUsage.textContent = 'Total: 0 B';
            return;
        }

        const allDomainsRanked = Array.from(allDomains).map(domain => ({
            domain,
            usage: dataUsage[domain]?.totalSize || 0,
            hasTabs: (tabData[domain]?.tabs?.length || 0) > 0,
        }));

        const sitesWithTabs = allDomainsRanked.filter(d => d.hasTabs).sort((a, b) => b.usage - a.usage);
        const sitesWithoutTabs = allDomainsRanked.filter(d => !d.hasTabs).sort((a, b) => b.usage - a.usage);

        const sortedDomains = [...sitesWithTabs, ...sitesWithoutTabs];
        let totalBytes = 0;
        allDomainsRanked.forEach(d => totalBytes += d.usage);
        elements.totalUsage.textContent = `Total: ${formatBytes(totalBytes)}`;

        if (sortedDomains.length <= 4) {
            sortedDomains.forEach(item => {
                const siteEntry = createSingleSiteEntry(item.domain, item.usage, pausedDomains[item.domain], tabData[item.domain]);
                elements.sitesContainer.appendChild(siteEntry);
            });
        } else {
            const displayList = sortedDomains.slice(0, 3);
            const others = sortedDomains.slice(3);

            displayList.forEach(item => {
                const siteEntry = createSingleSiteEntry(item.domain, item.usage, pausedDomains[item.domain], tabData[item.domain]);
                elements.sitesContainer.appendChild(siteEntry);
            });

            const compoundedEntry = createCompoundedSiteEntry(others, pausedDomains, tabData);
            elements.sitesContainer.appendChild(compoundedEntry);
        }
    }

    function createSingleSiteEntry(domain, usage, isPaused, domainTabData) {
        const siteEntry = document.createElement('div');
        siteEntry.className = 'site-entry';
        if (isPaused) siteEntry.classList.add('paused');

        const siteInfo = document.createElement('div');
        siteInfo.className = 'site-info';

        const siteDomain = document.createElement('div');
        siteDomain.className = 'site-domain';
        siteDomain.textContent = domain;
        siteInfo.appendChild(siteDomain);

        if (domainTabData?.tabs?.length > 0) {
            const tabCount = domainTabData.tabs.length;
            const topTab = domainTabData.topTab;

            if (tabCount === 1) {
                const tabCountEl = document.createElement('span');
                tabCountEl.className = 'tab-count clickable';
                tabCountEl.textContent = '1';
                tabCountEl.style.backgroundColor = getTabColor(domainTabData.tabs[0].tabId);
                tabCountEl.title = `Click to focus tab.`;
                tabCountEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    chrome.windows.update(domainTabData.tabs[0].windowId, { focused: true });
                    chrome.tabs.update(domainTabData.tabs[0].tabId, { active: true });
                });
                siteDomain.appendChild(tabCountEl);
            } else if (topTab) {
                const totalTabsEl = document.createElement('span');
                totalTabsEl.className = 'tab-count total';
                totalTabsEl.textContent = `${tabCount}`;
                totalTabsEl.title = `${tabCount} tabs open`;
                siteDomain.appendChild(totalTabsEl);

                const topTabEl = document.createElement('span');
                topTabEl.className = 'tab-count clickable';
                const topTabIndex = domainTabData.tabs.findIndex(t => t.tabId === topTab.tabId) + 1;
                topTabEl.textContent = `${topTabIndex}`;
                topTabEl.style.backgroundColor = getTabColor(topTab.tabId);
                topTabEl.title = `Top consumer (tab ${topTabIndex}): ${formatBytes(topTab.usage)}. Click to focus.`;
                topTabEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    chrome.windows.update(topTab.windowId, { focused: true });
                    chrome.tabs.update(topTab.tabId, { active: true });
                });
                siteDomain.appendChild(topTabEl);
            }
        }

        const siteUsage = document.createElement('div');
        siteUsage.className = 'site-usage';
        siteUsage.textContent = formatBytes(usage);
        siteInfo.appendChild(siteUsage);

        const siteControls = document.createElement('div');
        siteControls.className = 'site-controls';

        const autoPauseBtn = document.createElement('button');
        autoPauseBtn.textContent = 'Auto';
        autoPauseBtn.className = 'auto-pause-btn';
        siteControls.appendChild(autoPauseBtn);

        const timeInput = document.createElement('input');
        timeInput.type = 'time';
        timeInput.className = 'time-input hidden';
        siteControls.appendChild(timeInput);

        autoPauseBtn.addEventListener('click', () => {
            timeInput.classList.toggle('hidden');
        });

        timeInput.addEventListener('change', () => {
            chrome.runtime.sendMessage({ action: 'setAutoPause', domain: domain, time: timeInput.value });
            timeInput.classList.add('hidden');
        });

        const pauseBtn = document.createElement('button');
        pauseBtn.textContent = isPaused ? 'Unpause' : 'Pause';
        pauseBtn.className = isPaused ? 'unpause-btn' : 'pause-btn';
        pauseBtn.onclick = () => chrome.runtime.sendMessage({ action: isPaused ? 'unpauseDomain' : 'pauseDomain', domain });
        siteControls.appendChild(pauseBtn);

        siteEntry.appendChild(siteInfo);
        siteEntry.appendChild(siteControls);
        return siteEntry;
    }

    function createCompoundedSiteEntry(others, pausedDomains, tabData) {
        const usage = others.reduce((sum, item) => sum + item.usage, 0);
        const count = others.length;

        const compoundedEntry = document.createElement('div');
        compoundedEntry.className = 'site-entry compounded-entry';

        const siteInfo = document.createElement('div');
        siteInfo.className = 'site-info';
        siteInfo.innerHTML = `
            <div class="site-domain">Other sites (${count})</div>
            <div class="site-usage">${formatBytes(usage)}</div>
        `;

        const details = document.createElement('div');
        details.className = 'compounded-details';

        others.forEach(item => {
            const siteEntry = createSingleSiteEntry(item.domain, item.usage, pausedDomains[item.domain], tabData[item.domain]);
            details.appendChild(siteEntry);
        });

        compoundedEntry.appendChild(siteInfo);
        compoundedEntry.appendChild(details);

        siteInfo.addEventListener('click', () => {
            compoundedEntry.classList.toggle('expanded');
        });

        return compoundedEntry;
    }

    // --- Data & UI Updates ---
    async function updateUI() {
        elements.loadingMessage.style.display = 'block';
        const [storageData, tabInfo] = await Promise.all([
            chrome.storage.local.get(['dataUsage', 'pausedDomains', 'lastMonthUsage', 'lastResetDate', 'settings']),
            chrome.runtime.sendMessage({ action: 'getTabInfo' })
        ]);

        renderSites(storageData.dataUsage, storageData.pausedDomains, tabInfo.tabData);

        if (storageData.settings && storageData.settings.resetDay) {
            const now = new Date();
            const resetDay = storageData.settings.resetDay;

            let periodStart = new Date(now.getFullYear(), now.getMonth(), resetDay);
            if (now.getDate() < resetDay) {
                // If today's date is before the reset day, the period started last month.
                periodStart.setMonth(periodStart.getMonth() - 1);
            }

            const daysInPeriod = Math.ceil((now - periodStart) / (1000 * 60 * 60 * 24));
            const periodLength = parseInt(storageData.settings.resetPeriod, 10) || 30;

            elements.sinceDateInfo.textContent = `Day ${daysInPeriod} of ${periodLength}`;
        }


        const lastMonthTotal = storageData.lastMonthUsage || 0;
        if (lastMonthTotal > 0 || (storageData.settings && storageData.settings.alwaysCompare)) {
            const currentTotal = Object.values(storageData.dataUsage || {}).reduce((sum, site) => sum + (site.totalSize || 0), 0);
            const percentageChange = lastMonthTotal > 0 ? ((currentTotal - lastMonthTotal) / lastMonthTotal * 100) : (currentTotal > 0 ? 100 : 0);

            const comparisonSpan = document.createElement('span');
            comparisonSpan.textContent = `${Math.abs(percentageChange).toFixed(0)}%`;

            elements.lastMonthComparison.innerHTML = '';

            if (percentageChange > 0.1) {
                elements.lastMonthComparison.innerHTML = `<img src="arrow-up.svg" class="arrow-icon active-red"> <img src="arrow-down.svg" class="arrow-icon inactive">`;
                comparisonSpan.style.color = '#e74c3c';
            } else if (percentageChange < -0.1) {
                elements.lastMonthComparison.innerHTML = `<img src="arrow-up.svg" class="arrow-icon inactive"> <img src="arrow-down.svg" class="arrow-icon active-green">`;
                comparisonSpan.style.color = '#2ecc71';
            } else {
                elements.lastMonthComparison.innerHTML = `<img src="arrow-up.svg" class="arrow-icon inactive"> <img src="arrow-down.svg" class="arrow-icon inactive">`;
            }
            elements.lastMonthComparison.appendChild(comparisonSpan);
        } else {
            elements.lastMonthComparison.textContent = '';
        }
    }

    // --- Event Listeners ---
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.dataUsage || changes.pausedDomains)) {
            const oldTotal = changes.dataUsage?.oldValue ? Object.values(changes.dataUsage.oldValue).reduce((sum, site) => sum + site.totalSize, 0) : 0;
            const newTotal = changes.dataUsage?.newValue ? Object.values(changes.dataUsage.newValue).reduce((sum, site) => sum + site.totalSize, 0) : 0;

            updateUI().then(() => {
                if (newTotal > oldTotal) {
                    const upArrow = elements.lastMonthComparison.querySelector('.arrow-icon.active-red');
                    if (upArrow) upArrow.classList.add('blinking');
                } else if (newTotal < oldTotal) {
                    const downArrow = elements.lastMonthComparison.querySelector('.arrow-icon.active-green');
                    if (downArrow) downArrow.classList.add('blinking');
                }
            });
        }
    });

    elements.clearDataBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
            chrome.runtime.sendMessage({ action: 'clearAllData' });
        }
    });

    // --- Initialisation Flow ---
    elements.saveSetupBtn.addEventListener('click', () => {
        if (selectedResetDay) {
            const settings = { resetDay: selectedResetDay, resetPeriod: '30' };
            const now = new Date().toISOString();
            chrome.storage.local.set({ settings, isSetupComplete: true, lastResetDate: now }, () => {
                initializeMainView();
            });
        }
    });

    async function checkSetup() {
        const { isSetupComplete } = await chrome.storage.local.get('isSetupComplete');
        if (isSetupComplete) {
            initializeMainView();
        } else {
            elements.mainView.classList.remove('active');
            elements.setupView.classList.add('active');
            generateCalendar(elements.setupCalendarContainer, selectedResetDay, (day) => {
                selectedResetDay = day;
                generateCalendar(elements.setupCalendarContainer, day, () => {});
            });
        }
    }

    async function initializeMainView() {
        elements.setupView.classList.remove('active');
        elements.mainView.classList.add('active');

        const manifest = chrome.runtime.getManifest();
        elements.versionNumber.textContent = manifest.version;

        try {
            if (navigator.userAgentData) {
                const uaData = await navigator.userAgentData.getHighEntropyValues(["platform"]);
                const brands = uaData.brands.filter(b => !b.brand.includes("Not"));
                let browserName = 'Chromium-based';
                if (brands.length > 0) {
                    browserName = `${brands[0].brand} ${brands[0].version}`;
                }
                elements.browserVersion.textContent = `${browserName} on ${uaData.platform}`;
            } else {
                 const platform = await chrome.runtime.getPlatformInfo();
                 elements.browserVersion.textContent = `Chrome on ${platform.os}`;
            }
        } catch(e) {
            console.error("Could not determine browser version:", e);
            elements.browserVersion.textContent = 'Info not available';
        }

        await loadSettings();
        await updateUI();

        // Load and render credits
        try {
            const response = await fetch(chrome.runtime.getURL('CREDITS.md'));
            const text = await response.text();
            const creditsTab = document.getElementById('credits-tab');
            creditsTab.innerHTML = ''; // Clear existing content

            const container = document.createElement('div');
            container.className = 'credits-container';

            const converter = new showdown.Converter();
            const html = converter.makeHtml(text);
            container.innerHTML = html;

            creditsTab.appendChild(container);

        } catch (e) {
            console.error("Could not load credits:", e);
            document.getElementById('credits-tab').innerHTML = `<div class="about-content"><p>Could not load credits.</p></div>`;
        }
    }

    checkSetup();
});