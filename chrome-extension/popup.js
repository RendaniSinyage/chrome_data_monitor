document.addEventListener('DOMContentLoaded', () => {
  const dataContainer = document.getElementById('data-container');
  const pausedContainer = document.getElementById('paused-container');

  function updateDataUsage() {
    chrome.storage.local.get('dataUsage', (result) => {
      const dataUsage = result.dataUsage || {};
      const domains = Object.keys(dataUsage);

      dataContainer.innerHTML = ''; // Clear previous content

      if (domains.length === 0) {
        dataContainer.textContent = 'No data tracked yet.';
      } else {
        const table = document.createElement('table');
        const header = table.createTHead();
        const headerRow = header.insertRow(0);
        headerRow.insertCell(0).textContent = 'Domain';
        headerRow.insertCell(1).textContent = 'Data Usage (MB)';

        const tbody = table.createTBody();
        const sortedDomains = domains.sort((a, b) => dataUsage[b].totalSize - dataUsage[a].totalSize);
        for (const domain of sortedDomains) {
          const row = tbody.insertRow();
          row.insertCell(0).textContent = domain;
          const sizeInMB = (dataUsage[domain].totalSize / (1024 * 1024)).toFixed(2);
          row.insertCell(1).textContent = sizeInMB;
        }
        dataContainer.appendChild(table);
      }
    });
  }

  function updatePausedSites() {
    chrome.storage.local.get('pausedDomains', (result) => {
      const pausedDomains = result.pausedDomains || [];

      pausedContainer.innerHTML = ''; // Clear previous content

      if (pausedDomains.length === 0) {
        pausedContainer.textContent = 'No sites are currently paused.';
      } else {
        const list = document.createElement('ul');
        for (const domain of pausedDomains) {
          const item = document.createElement('li');
          item.textContent = domain;

          const unpauseButton = document.createElement('button');
          unpauseButton.textContent = 'Unpause';
          unpauseButton.onclick = () => {
            chrome.runtime.sendMessage({ action: 'unpauseDomain', domain: domain }, () => {
              // The listener will handle the refresh, no need to force reload
            });
          };

          item.appendChild(unpauseButton);
          list.appendChild(item);
        }
        pausedContainer.appendChild(list);
      }
    });
  }

  // Initial load
  updateDataUsage();
  updatePausedSites();

  // Listen for changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.dataUsage) {
        updateDataUsage();
      }
      if (changes.pausedDomains) {
        updatePausedSites();
      }
    }
  });
});