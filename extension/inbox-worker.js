/* Catnap Inbox-only toolbar worker, version 0.6.0.
 * Change summary: share the private inbox/playlist controls without loading
 * Theatre rendering, tab capture, offscreen audio or playback content scripts.
 */
importScripts('package-mode.js','inbox-core.js','suno-mcp.js','show-worker.js');
chrome.action.onClicked.addListener(() => {
  void CatnapShowWorker.open().catch(error => {
    console.error('Catnap Inbox controls could not open:', String(error?.message || error).slice(0,200));
  });
});
