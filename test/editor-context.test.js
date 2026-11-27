const assert = require('node:assert/strict');
const test = require('node:test');
const { classifyEditorContext } = require('../src/lib/editor-context');

test('accepts a Taptop editor shell discovered only after a user action', () => {
  const result = classifyEditorContext({
    hostname: 'demo.taptop.site',
    pathname: '/editor',
    hasEditorShell: true,
    title: 'Demo — Taptop'
  });

  assert.deepEqual(result, {
    supported: true,
    status: 'ready-to-probe',
    message: 'Редактор Taptop найден. Импорт пока не включён.'
  });
});

test('rejects a non-Taptop tab and pages without an editor shell', () => {
  assert.equal(classifyEditorContext({ hostname: 'example.com', hasEditorShell: true }).supported, false);
  assert.equal(classifyEditorContext({ hostname: 'demo.taptop.site', hasEditorShell: false }).status, 'not-editor');
});

test('accepts the editor on a connected domain by its path, not any page there', () => {
  assert.equal(classifyEditorContext({ hostname: 'clinic.example', pathname: '/-/cms/v1/mosaic/', hasEditorShell: true }).supported, true);
  assert.equal(classifyEditorContext({ hostname: 'clinic.example', pathname: '/about', hasEditorShell: true }).status, 'wrong-site');
});
