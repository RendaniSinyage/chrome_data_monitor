document.addEventListener('DOMContentLoaded', () => {
    const alwaysCompareToggle = document.getElementById('always-compare-toggle');
    const resetDaySelect = document.getElementById('reset-day-select');
    const resetPeriodSelect = document.getElementById('reset-period-select');

    // Populate reset day dropdown
    for (let i = 1; i <= 31; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        resetDaySelect.appendChild(option);
    }

    // Load saved settings
    chrome.storage.local.get(['settings'], (result) => {
        if (result.settings) {
            alwaysCompareToggle.checked = result.settings.alwaysCompare || false;
            resetDaySelect.value = result.settings.resetDay || 1;
            resetPeriodSelect.value = result.settings.resetPeriod || '30';
        }
    });

    // Save settings on change
    function saveSettings() {
        chrome.storage.local.get(['settings'], (result) => {
            const settings = result.settings || {};
            settings.alwaysCompare = alwaysCompareToggle.checked;
            settings.resetDay = parseInt(resetDaySelect.value, 10);
            settings.resetPeriod = resetPeriodSelect.value;
            chrome.storage.local.set({ settings });
        });
    }

    alwaysCompareToggle.addEventListener('change', saveSettings);
    resetDaySelect.addEventListener('change', saveSettings);
    resetPeriodSelect.addEventListener('change', saveSettings);
});