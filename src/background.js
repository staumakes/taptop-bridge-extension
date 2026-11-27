const DEFAULT_POPUP = 'popup/popup.html';
const EDITOR_PATH = '/-/cms/v1/mosaic/';
// A test build registered the launcher per allowed domain under this id; the
// manifest now covers every domain, so an old registration is removed.
const LEGACY_DOMAIN_SCRIPT = 'taptop-bridge-connected-domains';

// Taptop serves the editor at /-/cms/v1/mosaic/ on its own subdomains and on
// a site's connected domain (https://example.ru/-/cms/v1/mosaic/…, seen
// 2026-11-26), so the editor is recognised by this path on any https host.
// The editor runtime itself is checked by the probe.
function isTaptopEditorUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.pathname.startsWith(EDITOR_PATH);
  } catch { return false; }
}

chrome.runtime.onInstalled?.addListener?.(() => {
  chrome.scripting.unregisterContentScripts({ ids: [LEGACY_DOMAIN_SCRIPT] }).catch(() => {});
});

async function mountImporter(tabId, url, { open = false } = {}) {
  if (!isTaptopEditorUrl(url)) throw new Error('Откройте проект в редакторе Taptop.');
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['lib/layer-safety.js', 'lib/class-sync.js', 'editor/taptop-runtime-adapter.js'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['lib/layer-safety.js', 'lib/package-inspector.js', 'lib/import-session.js', 'lib/class-conflicts.js', 'lib/class-sync.js', 'lib/import-planner.js', 'editor/import-ui.js', 'editor/mount-importer.js'] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId }, args: [open],
    func: shouldOpen => shouldOpen ? globalThis.TaptopBridgeExtension.open() : globalThis.TaptopBridgeExtension.mount()
  });
  // In the editor the toolbar icon opens the dialog directly instead of the help popup.
  await chrome.action.setPopup({ tabId, popup: '' });
  return result;
}

chrome.action.onClicked.addListener(tab => {
  if (!tab?.id) return;
  mountImporter(tab.id, tab.url, { open: true }).catch(async () => {
    await chrome.action.setPopup({ tabId: tab.id, popup: DEFAULT_POPUP });
    chrome.action.openPopup?.().catch(() => {});
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') chrome.action.setPopup({ tabId, popup: DEFAULT_POPUP }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'taptop-bridge-control' && message.action === 'mount-editor-importer') {
      const tabId = sender.tab?.id || message.tabId;
      if (!tabId) throw new Error('Не удалось определить вкладку редактора.');
      const tab = sender.tab || await chrome.tabs.get(tabId);
      return mountImporter(tabId, tab.url, { open: Boolean(message.open) });
    }
    if (message?.type !== 'taptop-bridge-runtime' || !sender.tab?.id || !isTaptopEditorUrl(sender.tab.url)) return undefined;
    const tabId = sender.tab.id;
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['lib/layer-safety.js', 'lib/class-sync.js', 'editor/taptop-runtime-adapter.js'] });
    const [{ result: outcome }] = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      // Errors travel back as data: an exception inside an injected script
      // does not reliably reach the caller with its message.
      func: async (action, payload) => {
        try {
          const adapter = globalThis.TaptopRuntimeAdapter;
          if (!adapter) throw new Error('Taptop runtime adapter was not loaded');
          const run = () => {
            if (action === 'probe') return adapter.probe();
            if (action === 'classes') return adapter.classes(payload);
            if (action === 'observe-classes') return adapter.observeClasses(adapter.resolveEditor(), payload);
            if (action === 'check-class-names') return adapter.respelledClassNames(adapter.resolveEditor(), payload);
            if (action === 'check-save-state') return adapter.checkSaveState(adapter.resolveEditor());
            if (action === 'apply-class-plans') return adapter.applyClassPlansChecked(adapter.resolveEditor(), payload);
            if (action === 'insert') return adapter.insert(payload?.clipboardData);
            if (action === 'confirm') return adapter.confirm(payload?.rootTagId);
            if (action === 'insert-behavior') return adapter.insertBehavior(payload?.clipboardData);
            if (action === 'confirm-behavior') return adapter.confirm(payload?.rootTagId);
            throw new Error('Unknown Taptop runtime action');
          };
          return { ok: true, value: await run() };
        } catch (error) {
          return { ok: false, error: error?.message || String(error) };
        }
      }, args: [message.action, message.payload || {}]
    });
    if (!outcome?.ok) throw new Error(outcome?.error || 'Taptop editor operation failed');
    return outcome.value;
  })().then(result => sendResponse({ ok: true, result })).catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

if (typeof module === 'object' && module.exports) module.exports = { isTaptopEditorUrl };
