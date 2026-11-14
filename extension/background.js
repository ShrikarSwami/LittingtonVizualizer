// Relays reports from the YouTube Music page to the LittingtonVizualizer app on this computer.
// The page itself is not allowed to talk to 127.0.0.1; the extension's service worker is.
const ENDPOINT = 'http://127.0.0.1:38217/ytm';

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'lv-report') return;
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message.report),
  }).catch(() => { /* the app isn't running; nothing to do */ });
});

// Start reporting from YouTube Music pages that were already open when the extension was installed.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
  for (const tab of tabs) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
  }
});
