document.addEventListener('DOMContentLoaded', () => {
  const dataContainer = document.getElementById('data-container');
  const pausedContainer = document.getElementById('paused-container');

  // Load data usage
  chrome.storage.local.get('dataUsage', (result) => {
    const dataUsage = result.dataUsage || {};
    const domains = Object.keys(dataUsage);

    if (domains.length === 0) {
      dataContainer.textContent = 'No data tracked yet.';
    } else {
      const table = document.createElement('table');
      const header = table.createTHead();
      const headerRow = header.insertRow(0);
      headerRow.insertCell(0).textContent = 'Domain';
      headerRow.insertCell(1).textContent = 'Data Usage (MB)';

      const tbody = table.createTBody();
      for (const domain of domains) {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = domain;
        const sizeInMB = (dataUsage[domain].totalSize / (1024 * 1024)).toFixed(2);
        row.insertCell(1).textContent = sizeInMB;
      }
      dataContainer.appendChild(table);
    }
  });

  // Load paused sites
  chrome.storage.local.get('pausedDomains', (result) => {
    const pausedDomains = result.pausedDomains || [];

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
          // Send a message to the background script to unpause the domain
          chrome.runtime.sendMessage({ action: 'unpauseDomain', domain: domain }, () => {
            // Refresh the popup to reflect the change
            window.location.reload();
          });
        };

        item.appendChild(unpauseButton);
        list.appendChild(item);
      }
      pausedContainer.appendChild(list);
    }
  });
});