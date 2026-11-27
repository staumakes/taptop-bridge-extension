const assert = require('node:assert/strict');
const test = require('node:test');
const { inspectPackage } = require('../src/lib/package-inspector');
const page = require('../fixtures/compatibility/managed-page.json');

test('rejects id in native layer attr/data, including behavior payloads', async () => {
  for (const field of ['attr', 'data']) for (const key of ['id', 'ID', ' id ']) for (const behavior of [false, true]) {
    const wrapper = structuredClone(page);
    const clipboard = structuredClone(wrapper.clipboardData);
    const tree = clipboard.copiedLayout.tree;
    tree.tags[tree.root][field] = { [key]: field === 'data' ? { type: 'STRING', value: 'anchor' } : 'anchor' };
    if (behavior) {
      tree.tags[tree.root].widgetName = 'tt_embed';
      wrapper.behaviorPackages = [{ key: 'probe', adapter: 'probe', clipboardData: clipboard }];
    } else wrapper.clipboardData = clipboard;
    const report = await inspectPackage({ packageText: JSON.stringify(wrapper) });
    assert.equal(report.ok, false);
    assert.match(report.errors.join('\n'), /RESERVED_TAG_ATTRIBUTE/);
  }
});

test('preserves structural IDs and SVG/rich-text/Embed ID references', async () => {
  const wrapper = structuredClone(page);
  const tree = wrapper.clipboardData.copiedLayout.tree;
  tree.tags[tree.root].data = { text: { type: 'HTML', value: '<svg><linearGradient id="paint"/><path fill="url(#paint)"/></svg>' } };
  assert.equal((await inspectPackage({ packageText: JSON.stringify(wrapper) })).ok, true);
});

test('native paste refuses reserved attributes before changing clipboard or layers', () => {
  const { pasteClipboardAt } = require('../src/editor/taptop-runtime-adapter');
  const wrapper = structuredClone(page);
  const tree = wrapper.clipboardData.copiedLayout.tree;
  tree.tags[tree.root].data = { id: { type: 'STRING', value: 'anchor' } };
  assert.throws(() => pasteClipboardAt({}, wrapper.clipboardData, { id: 'target' }), /RESERVED_TAG_ATTRIBUTE/);
});

test('a package from an older Bridge with a native value Taptop cannot keep asks for a rebuild', async () => {
  const wrapper = structuredClone(page);
  const map = wrapper.clipboardData.copiedLayout.mainSelectorCollection.map;
  const [key] = Object.keys(map);
  map[key].rules['border-radius'] = { name: 'border-radius', value: '20px 20px 0 0', isCustom: false, serializeValue: '20px 20px 0 0' };
  const report = await inspectPackage({ packageText: JSON.stringify(wrapper) });
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), new RegExp(`PACKAGE_REBUILD_REQUIRED: \\${map[key].selectorText} border-radius: 20px 20px 0 0`));
});

test('the class-sync rules of an older package are checked too', async () => {
  const wrapper = structuredClone(page);
  const item = wrapper.syncPackage.classes[0];
  item.ownedRules = { main: { [`screen/.${item.name}`]: { 'font-weight': { name: 'font-weight', value: 'inherit', isCustom: false } } } };
  const report = await inspectPackage({ packageText: JSON.stringify(wrapper) });
  assert.match(report.errors.join('\n'), new RegExp(`PACKAGE_REBUILD_REQUIRED: \\.${item.name} font-weight: inherit`));
});

test('values current Bridge writes are accepted: native numbers and custom rules', () => {
  const { unkeepableNativeValue } = require('../src/lib/layer-safety');
  for (const [property, value] of [['border-radius', '20px'], ['width', 'auto'], ['max-width', 'none'], ['font-weight', '700'], ['line-height', '24px'], ['color', 'rgb(0, 0, 0)'], ['padding-top', '1.5rem']]) {
    assert.equal(unkeepableNativeValue(property, { value, isCustom: false }), null, `${property}: ${value}`);
  }
  for (const [property, value] of [['border-radius', '20px 20px 0 0'], ['width', 'calc(100% - 10px)'], ['line-height', '1.5']]) {
    assert.equal(unkeepableNativeValue(property, { value, isCustom: true }), null, `custom ${property}: ${value}`);
  }
  for (const [property, value] of [['width', 'fit-content'], ['height', '100svh'], ['line-height', 'normal'], ['font-weight', 'inherit'], ['margin-left', 'clamp(1px, 2vw, 3px)']]) {
    assert.equal(unkeepableNativeValue(property, { value, isCustom: false }), value, `${property}: ${value}`);
  }
});
