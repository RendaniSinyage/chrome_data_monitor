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
    function renderSites(dataUsage, pausedDomains) {
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
            createSiteEntry(domain, usage, isPaused);
        }

        totalUsageEl.textContent = formatBytes(totalBytes);
    }

    function createSiteEntry(domain, usage, isPaused) {
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

        const siteUsage = document.createElement('div');
        siteUsage.className = 'site-usage';
        siteUsage.textContent = formatBytes(usage);

        siteInfo.appendChild(siteDomain);
        siteInfo.appendChild(siteUsage);

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
    function updateUI() {
        chrome.storage.local.get(['dataUsage', 'pausedDomains'], (result) => {
            renderSites(result.dataUsage || {}, result.pausedDomains || []);
        });
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