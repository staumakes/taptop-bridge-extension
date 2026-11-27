const assert = require('node:assert/strict');
const test = require('node:test');
const sync = require('../src/lib/class-sync.js');
const { observeClasses } = require('../src/editor/taptop-runtime-adapter.js');

const TARGET = 'site-1.taptop.site:design:1:version:2';
const rule = value => ({ value, isCustom: false });
const packageData = {
  namespace: 'demo', componentKey: 'pages/home', revision: 'r1',
  classes: [{ stableKey: 'demo/class/footer', name: 'footer', collection: 'main', ownedRules: { main: { 'screen/.footer': { 'background-color': rule('#F5F5F5') } } } }]
};
// The same-name class already in the project carries a dark background image the file does not have.
const observed = { 'demo/class/footer': { id: 'class-existing', name: 'footer', collection: 'main', rules: { main: { 'screen/.footer': { 'background-color': rule('#101010'), 'background-image': rule('linear-gradient(#000, #111)') } } } } };
const removalsAfterAdopt = takeOver => {
  const first = sync.previewClassSync({ targetKey: TARGET, packageData, receipt: null, observed });
  const receipt = sync.adopt({ preview: first, packageData, receipt: null, takeOver });
  const plan = sync.previewClassSync({ targetKey: TARGET, packageData, receipt, observed }).plans[0];
  return plan.propertyPlan.operations.map(item => `${item.type} ${JSON.parse(item.path)[3]}`).sort();
};

test('a foreign class with the same name is brought to the file: its extra rules are removed', () => {
  assert.deepEqual(removalsAfterAdopt(() => true), ['remove background-image', 'set background-color']);
});

test('a class of this project (its UI kit) is only updated, never stripped', () => {
  assert.deepEqual(removalsAfterAdopt(() => false), ['set background-color']);
});

test('class owners are read from every page of the same site, by project', () => {
  const entries = new Map();
  const store = sync.createReceiptStore({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) });
  const receipt = (targetKey, namespace, componentKey, ids) => ({ schemaVersion: 1, targetKey, namespace, componentKey, classBindings: ids.map((id, index) => ({ stableKey: `${namespace}/class/c${index}`, targetClassId: id })), instanceBindings: [] });
  store.saveReceipt(receipt(TARGET, 'demo', 'ui-kit', ['kit-1', 'shared']));
  store.saveReceipt(receipt('site-1.taptop.site:design:7:version:2', 'other', 'pages/home', ['shared', 'other-1']));
  store.saveReceipt(receipt('site-2.taptop.site:design:1:version:2', 'demo', 'ui-kit', ['elsewhere']));
  store.saveReceipt(receipt('site-1.taptop.site:design:1:version:3', 'demo', 'ui-kit', ['old-version']));
  const storage = { get length() { return entries.size; }, key: index => [...entries.keys()][index] ?? null, getItem: key => entries.get(key) ?? null };
  const owners = sync.siteClassOwners(storage, { targetKey: 'site-1.taptop.site:design:99:version:2' });
  assert.deepEqual([...owners.keys()].sort(), ['kit-1', 'other-1', 'shared']);
  assert.deepEqual([...owners.get('shared')].sort(), ['demo', 'other']);
  assert.equal(sync.siteClassOwners(null, { targetKey: TARGET }).size, 0);
});

test('a class another project owns is copied for this package, its own and ownerless ones are adopted', async () => {
  const planner = require('../src/lib/import-planner.js');
  globalThis.TaptopClassSync = sync;
  globalThis.TaptopClassConflicts = require('../src/lib/class-conflicts.js');
  const page = require('../fixtures/compatibility/managed-page.json');
  const wrapper = structuredClone(page);
  const [first, second] = wrapper.syncPackage.classes;
  const existing = { [first.name]: 'id-foreign', [second.name]: 'id-free' };
  const observe = async classes => Object.fromEntries(classes.map(item => [item.stableKey, existing[item.name] ? { id: existing[item.name], name: item.name, collection: item.collection, rules: {} } : null]));
  const lookup = async query => ({ available: true, existing: Object.keys(existing).filter(name => (query.names || []).includes(name)), selectors: {} });
  const result = await planner.planImport({
    wrapper, decisions: { adopt: 'update', conflicts: 'take' }, targetKey: TARGET, receipt: null, observe, lookup,
    takeOver: item => item.classAction.targetClassId === 'id-free',
    copyFor: item => item.classAction.targetClassId === 'id-foreign'
  });
  const names = result.wrapper.syncPackage.classes.map(item => item.name);
  assert.ok(names.includes(`${first.name}-2`), 'the other project keeps its class; this package gets a copy');
  assert.ok(!names.includes(first.name));
  assert.ok(names.includes(second.name), 'an ownerless class keeps its name and is adopted');
  const byName = new Map(result.resolved.plans.map(item => [item.name, item.classAction.type]));
  assert.equal(byName.get(`${first.name}-2`), 'create');
  assert.equal(byName.get(second.name), 'reuse');
});

test('an unbound class is observed whole, a bound one only by its owned rules', () => {
  const prior = globalThis.TaptopClassSync;
  globalThis.TaptopClassSync = sync;
  try {
    const css = { 'background-color': { serialize: () => rule('#101010') }, 'background-image': { serialize: () => rule('none') } };
    const selector = { media: 'screen', selectorText: '.footer', rules: new Map(Object.entries(css)), hasCSS: property => property in css, getCSS: property => css[property] };
    const hover = { media: 'screen', selectorText: '.footer:hover', rules: new Map([['color', {}]]), hasCSS: () => true, getCSS: () => ({ serialize: () => rule('red') }) };
    const other = { media: 'screen', selectorText: '.footer-note', rules: new Map([['color', {}]]), hasCSS: () => true, getCSS: () => ({ serialize: () => rule('blue') }) };
    const all = [selector, hover, other];
    const editor = { layout: {
      mainClassNameCollection: { findByName: name => (name === 'footer' ? { id: 'class-existing', value: 'footer' } : null), get: id => (id === 'class-existing' ? { id, value: 'footer' } : null) },
      mainSelectorCollection: { map: new Map(all.map(item => [`${item.media}/${item.selectorText}`, item])), findSelector: (text, media) => all.find(item => item.selectorText === text && item.media === media) }
    } };
    const unbound = observeClasses(editor, { classes: packageData.classes, bindings: [] })['demo/class/footer'].rules.main;
    assert.deepEqual(Object.keys(unbound).sort(), ['screen/.footer', 'screen/.footer:hover']);
    assert.deepEqual(Object.keys(unbound['screen/.footer']).sort(), ['background-color', 'background-image']);
    const bound = observeClasses(editor, { classes: packageData.classes, bindings: [{ stableKey: 'demo/class/footer', targetClassId: 'class-existing', ownedPaths: [] }] })['demo/class/footer'].rules.main;
    assert.deepEqual(Object.keys(bound), ['screen/.footer']);
    assert.deepEqual(Object.keys(bound['screen/.footer']), ['background-color']);
  } finally { globalThis.TaptopClassSync = prior; }
});

test('a page import finds the classes its project bound on other pages of the site', () => {
  const entries = new Map();
  const store = sync.createReceiptStore({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) });
  const kitPage = 'site-1.taptop.site:design:5:version:2';
  store.saveReceipt({ schemaVersion: 1, targetKey: kitPage, namespace: 'demo', componentKey: 'ui-kit', classBindings: [
    { stableKey: 'demo/class/btn', targetClassId: 'id-btn-2', name: 'btn', collection: 'main', ownedPaths: [], baseline: {} },
    { stableKey: 'demo/class/kit-only', targetClassId: 'id-kit', name: 'kit-only', collection: 'main', ownedPaths: [], baseline: {} }
  ], instanceBindings: [] });
  store.saveReceipt({ schemaVersion: 1, targetKey: kitPage, namespace: 'other', componentKey: 'ui-kit', classBindings: [{ stableKey: 'demo/class/btn', targetClassId: 'id-foreign' }], instanceBindings: [] });
  store.saveReceipt({ schemaVersion: 1, targetKey: 'site-9.taptop.site:design:5:version:2', namespace: 'demo', componentKey: 'ui-kit', classBindings: [{ stableKey: 'demo/class/btn', targetClassId: 'id-elsewhere' }], instanceBindings: [] });
  const storage = { get length() { return entries.size; }, key: index => [...entries.keys()][index] ?? null, getItem: key => entries.get(key) ?? null };
  const page = 'site-1.taptop.site:design:8:version:2';
  const found = sync.siteProjectBindings(storage, { targetKey: page, namespace: 'demo' }, ['demo/class/btn', 'demo/class/missing']);
  assert.deepEqual(found.map(item => [item.stableKey, item.targetClassId]), [['demo/class/btn', 'id-btn-2']]);
  assert.deepEqual(sync.siteProjectBindings(storage, { targetKey: page, namespace: 'demo' }, []), []);
});
