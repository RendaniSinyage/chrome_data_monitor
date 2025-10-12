document.addEventListener('DOMContentLoaded', () => {
    const sitesContainer = document.getElementById('sites-container');
    const totalUsageEl = document.getElementById('total-usage');
    const loadingMessageEl = document.getElementById('loading-message');

    // --- Utility Functions ---
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // --- Rendering Logic ---
    function renderSites(dataUsage, pausedDomains, tabCounts, serviceUsageMap) {
        sitesContainer.innerHTML = '';
        loadingMessageEl.style.display = 'none';

        const allDomains = new Set([...Object.keys(dataUsage), ...pausedDomains]);
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
            const serviceUsers = serviceUsageMap[domain] ? serviceUsageMap[domain].length : 0;
            createSiteEntry(domain, usage, isPaused, tabCount, serviceUsers);
        }

        totalUsageEl.textContent = formatBytes(totalBytes);
    }

    function createSiteEntry(domain, usage, isPaused, tabCount, serviceUsers) {
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

        const button = document.createElement('button');
        button.textContent = isPaused ? 'Unpause' : 'Pause';
        button.className = isPaused ? 'unpause-btn' : 'pause-btn';

        button.onclick = () => {
            const action = isPaused ? 'unpauseDomain' : 'pauseDomain';
            chrome.runtime.sendMessage({ action, domain });
        };

        siteControls.appendChild(button);
        siteEntry.appendChild(siteInfo);
        siteEntry.appendChild(siteControls);
        sitesContainer.appendChild(siteEntry);
    }

    // --- Data Fetching and Updates ---
    async function updateUI() {
        const [storageData, tabs] = await Promise.all([
            chrome.storage.local.get(['dataUsage', 'pausedDomains', 'serviceUsageMap']),
            chrome.tabs.query({})
        ]);

        const tabCounts = {};
        for (const tab of tabs) {
            try {
                const domain = new URL(tab.url).hostname;
                tabCounts[domain] = (tabCounts[domain] || 0) + 1;
            } catch (e) {
                // Ignore invalid URLs
            }
        }

        renderSites(
            storageData.dataUsage || {},
            storageData.pausedDomains || [],
            tabCounts,
            storageData.serviceUsageMap || {}
        );
    }

    // --- Event Listeners ---
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.dataUsage || changes.pausedDomains)) {
            updateUI();
        }
    });

    // Initial Load
    updateUI();
});