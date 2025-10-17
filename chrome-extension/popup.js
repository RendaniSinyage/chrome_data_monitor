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
        settingsView: document.getElementById('settings-view'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),
        calendarContainer: document.getElementById('calendar-container'),
        resetPeriodSelect: document.getElementById('reset-period'),
        versionNumber: document.getElementById('version-number'),
        browserVersion: document.getElementById('browser-version'),
        clearDataBtn: document.getElementById('clear-data-btn'),
        setupView: document.getElementById('setup-view'),
        mainView: document.getElementById('main-view'),
        setupCalendarContainer: document.getElementById('setup-calendar-container'),
        saveSetupBtn: document.getElementById('save-setup-btn'),
    };

    let selectedResetDay = 1;

    // --- Calendar Logic ---
    function generateCalendar(container, currentSelectedDay, onDaySelect) {
        container.innerHTML = '';
        for (let i = 1; i <= 31; i++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.textContent = i;
            if (i === currentSelectedDay) {
                dayEl.classList.add('selected');
            }
            dayEl.addEventListener('click', () => onDaySelect(i));
            container.appendChild(dayEl);
        }
    }

    // --- Settings ---
    elements.settingsBtn.addEventListener('click', () => {
        elements.settingsView.classList.toggle('hidden');
    });

    elements.saveSettingsBtn.addEventListener('click', () => {
        const settings = {
            resetDay: selectedResetDay,
            resetPeriod: elements.resetPeriodSelect.value,
        };
        chrome.storage.local.set({ settings }, () => {
            elements.settingsView.classList.add('hidden');
        });
    });

    async function loadSettings() {
        const { settings } = await chrome.storage.local.get('settings');
        if (settings) {
            selectedResetDay = settings.resetDay;
            elements.resetPeriodSelect.value = settings.resetPeriod || '30';
        }
        generateCalendar(elements.calendarContainer, selectedResetDay, (day) => {
            selectedResetDay = day;
            generateCalendar(elements.calendarContainer, day, () => {});
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

            const otherUsage = others.reduce((sum, item) => sum + item.usage, 0);
            const compoundedEntry = createCompoundedSiteEntry(otherUsage, others.length);
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
            const tabCountEl = document.createElement('span');
            tabCountEl.className = 'tab-count';
            tabCountEl.textContent = `${domainTabData.tabs.length}`;

            const topTab = domainTabData.topTab;
            if (topTab) {
                tabCountEl.classList.add('clickable');
                tabCountEl.style.backgroundColor = getTabColor(topTab.tabId);
                tabCountEl.title = `Top consumer: ${formatBytes(topTab.usage)}. Click to focus.`;
                tabCountEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    chrome.windows.update(topTab.windowId, { focused: true });
                    chrome.tabs.update(topTab.tabId, { active: true });
                });

                const progressBar = createProgressBar(usage, topTab.usage);
                siteInfo.appendChild(progressBar);
            }
            siteDomain.appendChild(tabCountEl);
        }

        const siteUsage = document.createElement('div');
        siteUsage.className = 'site-usage';
        siteUsage.textContent = formatBytes(usage);
        siteInfo.appendChild(siteUsage);

        const siteControls = document.createElement('div');
        siteControls.className = 'site-controls';
        const pauseBtn = document.createElement('button');
        pauseBtn.textContent = isPaused ? 'Unpause' : 'Pause';
        pauseBtn.className = isPaused ? 'unpause-btn' : 'pause-btn';
        pauseBtn.onclick = () => chrome.runtime.sendMessage({ action: isPaused ? 'unpauseDomain' : 'pauseDomain', domain });
        siteControls.appendChild(pauseBtn);

        siteEntry.appendChild(siteInfo);
        siteEntry.appendChild(siteControls);
        return siteEntry;
    }

    function createProgressBar(totalUsage, topTabUsage) {
        const progressBarContainer = document.createElement('div');
        progressBarContainer.className = 'progress-bar-container';

        const totalBar = document.createElement('div');
        totalBar.className = 'progress-bar total-bar';

        if (totalUsage > 0) {
            const topTabPercentage = (topTabUsage / totalUsage) * 100;
            const topTabEl = document.createElement('div');
            topTabEl.className = 'progress-bar top-tab-bar';
            topTabEl.style.width = `${topTabPercentage}%`;
            totalBar.appendChild(topTabEl);
        }

        progressBarContainer.appendChild(totalBar);
        return progressBarContainer;
    }

    function createCompoundedSiteEntry(usage, count) {
        const siteEntry = document.createElement('div');
        siteEntry.className = 'site-entry';

        const siteInfo = document.createElement('div');
        siteInfo.className = 'site-info';

        const siteDomain = document.createElement('div');
        siteDomain.className = 'site-domain';
        siteDomain.textContent = `Other sites (${count})`;
        siteInfo.appendChild(siteDomain);

        const siteUsage = document.createElement('div');
        siteUsage.className = 'site-usage';
        siteUsage.textContent = formatBytes(usage);
        siteInfo.appendChild(siteUsage);

        siteEntry.appendChild(siteInfo);
        return siteEntry;
    }

    // --- Data & UI Updates ---
    async function updateUI() {
        elements.loadingMessage.style.display = 'block';
        const [storageData, tabInfo] = await Promise.all([
            chrome.storage.local.get(['dataUsage', 'pausedDomains', 'lastMonthUsage', 'lastResetDate', 'settings']),
            chrome.runtime.sendMessage({ action: 'getTabInfo' })
        ]);

        renderSites(storageData.dataUsage, storageData.pausedDomains, tabInfo.tabData);

        if (storageData.lastResetDate && storageData.settings) {
            const lastReset = new Date(storageData.lastResetDate);
            const now = new Date();
            const daysSinceReset = Math.ceil((now - lastReset) / (1000 * 60 * 60 * 24));
            const periodLength = parseInt(storageData.settings.resetPeriod, 10) || 30;

            if (daysSinceReset <= 3) {
                elements.sinceDateInfo.textContent = `Day ${daysSinceReset} of ${periodLength}`;
            } else {
                elements.sinceDateInfo.textContent = `since ${lastReset.toLocaleDateString()}`;
            }
        }


        if (storageData.lastMonthUsage) {
            const currentTotal = Object.values(storageData.dataUsage || {}).reduce((sum, site) => sum + (site.totalSize || 0), 0);
            const lastMonthTotal = storageData.lastMonthUsage;
            if (lastMonthTotal > 0) {
                const percentageChange = ((currentTotal - lastMonthTotal) / lastMonthTotal * 100);
                let comparisonText = `${Math.abs(percentageChange).toFixed(0)}% vs last month`;
                elements.lastMonthComparison.className = 'comparison-text';
                if (percentageChange > 0.1) {
                    elements.lastMonthComparison.classList.add('increase');
                    comparisonText = `+${comparisonText}`;
                } else if (percentageChange < -0.1) {
                     elements.lastMonthComparison.classList.add('decrease');
                }
                elements.lastMonthComparison.textContent = comparisonText;
            }
        }
    }

    // --- Event Listeners ---
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.dataUsage || changes.pausedDomains)) {
            updateUI();
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
    }

    checkSetup();
});