// Background service worker — handles extension lifecycle

chrome.runtime.onInstalled.addListener(() => {
  console.log('Smart Summify AI installed');
});

// Tries to send GET_PAGE_CONTENT to the content script.
// If the content script isn't injected yet (tab was open before extension
// loaded / reloaded), injects it programmatically then retries.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FETCH_PAGE_CONTENT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ error: 'No active tab found.' });
        return;
      }

      const tabId = tab.id;

      // First attempt — content script may already be running
      chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' }, (response) => {
        if (!chrome.runtime.lastError) {
          sendResponse(response);
          return;
        }

        // Content script not present — inject it now, then retry once
        chrome.scripting.executeScript(
          { target: { tabId }, files: ['content.js'] },
          () => {
            if (chrome.runtime.lastError) {
              // Restricted page (chrome://, about:, Web Store, etc.)
              sendResponse({
                error:
                  'This page cannot be summarized.\n' +
                  'Please navigate to a regular website (e.g. a news article or Wikipedia) and try again.',
              });
              return;
            }

            // Small delay to let the content script initialise
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' }, (response2) => {
                if (chrome.runtime.lastError) {
                  sendResponse({
                    error: 'Could not read page content. Please refresh the page and try again.',
                  });
                } else {
                  sendResponse(response2);
                }
              });
            }, 100);
          }
        );
      });
    });

    return true; // keep the message channel open for async sendResponse
  }
});
