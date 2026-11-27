const assert = require('node:assert/strict');
const test = require('node:test');
const { saveState, checkSaveState, applyClassPlansChecked } = require('../src/editor/taptop-runtime-adapter.js');

// Synthetic editor: only the editor's own save state, as in the live store.
const STATES = { SAVING: 'saving', SAVED: 'saved', ERROR: 'error', LOADED: 'loaded', INITIAL: 'initial' };
function editor(savingState = 'saved') {
  return { state: { savingState, isEditorStateReady: true }, constants: { y5: STATES } };
}
const noWait = { sleep: async () => {} };

test('reads the save state without changing the editor and never asks the server', async () => {
  const e = editor();
  e.request = () => { throw new Error('the import must not ask the server'); };
  const before = JSON.stringify(e.state);
  assert.deepEqual(saveState(e), { known: true, saving: false, failed: false, loading: false });
  assert.deepEqual(await checkSaveState(e, noWait), { known: true, saving: false, failed: false, loading: false });
  assert.equal(JSON.stringify(e.state), before);
});

test('waits for a save in progress instead of failing', async () => {
  const e = editor('saving');
  let sleeps = 0;
  const sleep = async () => { if (++sleeps === 3) e.state.savingState = 'saved'; };
  assert.equal((await checkSaveState(e, { sleep })).saving, false);
  assert.equal(sleeps, 3);
  await assert.rejects(checkSaveState(editor('saving'), { sleep: async () => {}, waitMs: 1000, pollMs: 250 }), /EDITOR_SAVE_PENDING/);
});

test('refuses after a failed save and while the editor loads', async () => {
  await assert.rejects(checkSaveState(editor('error'), noWait), /EDITOR_SAVE_FAILED/);
  const loading = editor(); loading.state.isEditorStateReady = false;
  await assert.rejects(checkSaveState(loading, noWait), /EDITOR_SAVE_PENDING/);
});

test('an editor whose state store moved is not refused', async () => {
  assert.deepEqual(await checkSaveState({}, noWait), { known: false });
  assert.deepEqual(await checkSaveState({ state: {}, constants: { y5: STATES } }, noWait), { known: false });
});

function withClassSync(run) {
  const prior = globalThis.TaptopClassSync;
  globalThis.TaptopClassSync = { flattenRules: () => ({}), decodeRulePath() { throw new Error('not reached'); }, comparable: value => String(value) };
  return Promise.resolve().then(run).finally(() => { globalThis.TaptopClassSync = prior; });
}

test('a failed save writes no class at all', () => withClassSync(async () => {
  const e = editor('error');
  let writes = 0;
  e.layout = { mainClassNameCollection: { findByName: () => null, generateByName() { writes++; return { id: 'x', value: 'probe' }; }, add() { writes++; } } };
  const plans = [{ stableKey: 'probe', name: 'probe', collection: 'main', classAction: { type: 'create' }, propertyPlan: { operations: [] } }];
  await assert.rejects(applyClassPlansChecked(e, { plans }, noWait), /EDITOR_SAVE_FAILED/);
  assert.equal(writes, 0);
}));

test('classes that read differently than planned are reported, not refused', () => withClassSync(async () => {
  const e = editor();
  e.layout = { mainClassNameCollection: { findByName: () => ({ id: 'edited-meanwhile', value: 'probe' }) } };
  const observations = [{ classes: [{ stableKey: 'probe', name: 'probe', collection: 'main' }], bindings: [], observed: { probe: null } }];
  const result = await applyClassPlansChecked(e, { plans: [], observations }, noWait);
  assert.deepEqual(result.failures, []);
  assert.equal(result.drift.length, 1);
  assert.equal(result.drift[0].stableKey, 'probe');
}));

test('a saved editor with unchanged classes applies the plans', () => withClassSync(async () => {
  const e = editor();
  const added = [];
  e.layout = { mainClassNameCollection: { findByName: () => null, generateByName: name => ({ id: `id-${name}`, value: name }), add: item => added.push(item.id) } };
  const observations = [{ classes: [{ stableKey: 'probe', name: 'probe', collection: 'main' }], bindings: [], observed: { probe: null } }];
  const plans = [{ stableKey: 'probe', name: 'probe', collection: 'main', classAction: { type: 'create' }, propertyPlan: { operations: [] } }];
  const result = await applyClassPlansChecked(e, { plans, observations }, noWait);
  assert.deepEqual(added, ['id-probe']);
  assert.deepEqual(result.failures, []);
  assert.equal(result.drift, undefined);
}));
