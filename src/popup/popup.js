(async () => {
  // The popup is only a fallback: inside the editor the toolbar icon opens the import dialog itself.
  // The editor lives at /-/cms/v1/mosaic/ on a Taptop subdomain or on the site's connected domain.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url = null;
  try { url = new URL(tab?.url || ''); } catch {}
  if (!tab?.id || url?.protocol !== 'https:' || !url.pathname.startsWith('/-/cms/v1/mosaic/')) return;
  const response = await chrome.runtime.sendMessage({ type: 'taptop-bridge-control', action: 'mount-editor-importer', tabId: tab.id, open: true });
  if (response?.ok) window.close();
})();
