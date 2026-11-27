const assert = require('node:assert/strict');
const test = require('node:test');

// background.js is a service worker: give it the chrome APIs it touches.
function loadBackground() {
  const unregistered = [];
  const installed = [];
  const event = list => ({ addListener: fn => list.push(fn) });
  globalThis.chrome = {
    runtime: { onInstalled: event(installed), onMessage: event([]) },
    action: { onClicked: event([]), setPopup: async () => {} },
    tabs: { onUpdated: event([]) },
    scripting: { async unregisterContentScripts({ ids }) { unregistered.push(...ids); } }
  };
  delete require.cache[require.resolve('../src/background.js')];
  return { api: require('../src/background.js'), installed, unregistered };
}

test('recognises the editor on Taptop subdomains and on connected domains, nothing else', () => {
  const { api } = loadBackground();
  assert.equal(api.isTaptopEditorUrl('https://site-1.taptop.site/-/cms/v1/mosaic/?ver_id=1'), true);
  assert.equal(api.isTaptopEditorUrl('https://clinic.example/-/cms/v1/mosaic/?ver_id=1&act=construct'), true);
  assert.equal(api.isTaptopEditorUrl('https://clinic.example/'), false);
  assert.equal(api.isTaptopEditorUrl('https://clinic.example/blog/-/cms/v1/mosaic/'), false);
  assert.equal(api.isTaptopEditorUrl('http://clinic.example/-/cms/v1/mosaic/'), false);
  assert.equal(api.isTaptopEditorUrl('not a url'), false);
});

test('an update removes the per-domain launcher a test build registered', async () => {
  const { installed, unregistered } = loadBackground();
  for (const listener of installed) listener();
  await Promise.resolve();
  assert.deepEqual(unregistered, ['taptop-bridge-connected-domains']);
});
