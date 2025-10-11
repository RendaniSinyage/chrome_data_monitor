document.addEventListener('DOMContentLoaded', () => {
  const dataContainer = document.getElementById('data-container');
  const pausedContainer = document.getElementById('paused-container');

  function renderData(dataUsage) {
    dataContainer.innerHTML = ''; // Clear previous content

    const sortedInitiators = Object.keys(dataUsage).sort((a, b) => {
      return dataUsage[b].totalSize - dataUsage[a].totalSize;
    });

    if (sortedInitiators.length === 0) {
      dataContainer.textContent = 'No data tracked yet.';
      return;
    }

    for (const initiatorDomain of sortedInitiators) {
      const initiatorData = dataUsage[initiatorDomain];
      const initiatorElement = document.createElement('div');
      initiatorElement.className = 'initiator';

      const header = document.createElement('div');
      header.className = 'header';
      header.textContent = `${initiatorDomain} - ${(initiatorData.totalSize / (1024 * 1024)).toFixed(2)} MB`;
      header.addEventListener('click', () => {
        initiatorElement.classList.toggle('expanded');
      });

      const details = document.createElement('div');
      details.className = 'details';

      const sortedRequests = Object.keys(initiatorData.requests).sort((a, b) => {
        return initiatorData.requests[b].totalSize - initiatorData.requests[a].totalSize;
      });

      for (const requestDomain of sortedRequests) {
        const requestData = initiatorData.requests[requestDomain];
        const requestElement = document.createElement('div');
        requestElement.className = 'request';
        requestElement.textContent = `${requestDomain} - ${(requestData.totalSize / (1024 * 1024)).toFixed(2)} MB`;
        details.appendChild(requestElement);
      }

      initiatorElement.appendChild(header);
      initiatorElement.appendChild(details);
      dataContainer.appendChild(initiatorElement);
    }
  }

  function renderPausedSites(pausedDomains) {
    pausedContainer.innerHTML = ''; // Clear previous content

    if (pausedDomains.length === 0) {
      pausedContainer.textContent = 'No sites are currently paused.';
      return;
    }

    const list = document.createElement('ul');
    for (const domain of pausedDomains) {
      const item = document.createElement('li');
      item.textContent = domain;

      const unpauseButton = document.createElement('button');
      unpauseButton.textContent = 'Unpause';
      unpauseButton.onclick = () => {
        chrome.runtime.sendMessage({ action: 'unpauseDomain', domain: domain });
      };

      item.appendChild(unpauseButton);
      list.appendChild(item);
    }
    pausedContainer.appendChild(list);
  }

  function updateAll() {
    chrome.storage.local.get(['dataUsage', 'pausedDomains'], (result) => {
      renderData(result.dataUsage || {});
      renderPausedSites(result.pausedDomains || []);
    });
  }

  // Initial load
  updateAll();

  // Listen for changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      updateAll();
    }
  });
});