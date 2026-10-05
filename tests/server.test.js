'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');
const defaults = require('../config/defaults.json');
const token = 'test-only-admin-key-1234567890';

async function fixture(t, adminToken = token, existingDir) {
  const dataDir = existingDir || await fs.mkdtemp(path.join(os.tmpdir(), 'einsatzpost-test-'));
  const server = createServer({ dataDir, adminToken });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (!existingDir) await fs.rm(dataDir, { recursive: true, force: true });
  });
  return { dataDir, server, request: (route, options) => fetch('http://127.0.0.1:' + server.address().port + route, options) };
}
function writeOptions(config, revision, key = token) {
  return { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify({ config, revision }) };
}
test('serves the app, reports health and blocks private paths', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/editor.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await (await request('/api/health')).json()).status, 'ok');
  for (const route of ['/server.js', '/.env', '/%2e%2e%5cconfig/defaults.json', '/data/config.json', '/%00']) assert.equal((await request(route)).status, 404);
  assert.equal((await request('/', { method: 'POST' })).status, 405);
});
test('requires admin authentication and rejects invalid configuration', async t => {
  const { request } = await fixture(t);
  const { revision } = await (await request('/api/config')).json();
  assert.equal((await request('/api/config', writeOptions(defaults, revision, 'wrong'))).status, 401);
  const invalid = structuredClone(defaults); invalid.categories.push(invalid.categories[0]);
  assert.equal((await request('/api/config', writeOptions(invalid, revision))).status, 400);
  assert.equal((await request('/api/config', { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{broken' })).status, 400);
  assert.deepEqual((await (await request('/api/config')).json()).config, defaults);
});
test('persists admin changes and rejects concurrent stale edits', async t => {
  const first = await fixture(t);
  const initial = await (await first.request('/api/config')).json();
  const changed = structuredClone(defaults); changed.categories[0].color = '#00aa00';
  const saved = await first.request('/api/config', writeOptions(changed, initial.revision));
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.notEqual(savedBody.revision, initial.revision);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(first.dataDir, 'config.json'), 'utf8')), changed);
  assert.equal((await first.request('/api/config', writeOptions(defaults, initial.revision))).status, 409);
  const reopened = await fixture(t, token, first.dataDir);
  const fresh = await (await reopened.request('/api/config')).json();
  assert.deepEqual(fresh.config, changed);
  assert.equal(fresh.revision, savedBody.revision);
  const one = structuredClone(changed), two = structuredClone(changed);
  one.brand = 'First'; two.brand = 'Second';
  const results = await Promise.all([reopened.request('/api/config', writeOptions(one, fresh.revision)), reopened.request('/api/config', writeOptions(two, fresh.revision))]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
});
test('disables unconfigured admin and limits failed authentication', async t => {
  const disabled = await fixture(t, '');
  assert.equal((await (await disabled.request('/api/config')).json()).adminEnabled, false);
  assert.equal((await disabled.request('/api/config', writeOptions(defaults, 'unused'))).status, 503);
  const enabled = await fixture(t);
  for (let i = 0; i < 10; i++) assert.equal((await enabled.request('/api/config', writeOptions(defaults, 'unused', 'wrong'))).status, 401);
  assert.equal((await enabled.request('/api/config', writeOptions(defaults, 'unused', 'wrong'))).status, 429);
});
