// Service worker — handles screenshot capture on behalf of the popup,
// since captureVisibleTab requires a user-gesture context that the popup
// already provides when opened via the action button.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'capture-screenshot') {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 75 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // keep message channel open for async response
  }
});
