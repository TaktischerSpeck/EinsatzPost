'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createServer, validateConfig } = require('../server');
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
test('migrates legacy settings and validates configurable colors and vehicle codes', async t => {
  const legacy = structuredClone(defaults);
  delete legacy.colors; delete legacy.vehicles;
  legacy.categories[0].color = '#aabbcc';
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'einsatzpost-test-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dataDir, 'config.json'), JSON.stringify(legacy));
  const { request } = await fixture(t, token, dataDir);
  const initial = await (await request('/api/config')).json();
  assert.deepEqual(initial.config.colors, defaults.colors);
  assert.deepEqual(initial.config.vehicles, defaults.vehicles);
  assert.equal(initial.config.categories[0].color, '#aabbcc');
  const changed = structuredClone(initial.config);
  changed.colors = { background: '#123456', header: '#ffffff', footer: '#334455' };
  changed.vehicles = [' HLF20 ', 'elw', 'DLK23/12'];
  const response = await request('/api/config', writeOptions(changed, initial.revision));
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(saved.config.vehicles, ['HLF20', 'ELW', 'DLK23/12']);
  assert.deepEqual(saved.config.colors, changed.colors);
  const disk = JSON.parse(await fs.readFile(path.join(dataDir, 'config.json'), 'utf8'));
  assert.deepEqual(disk.vehicles, saved.config.vehicles);
  const invalid = structuredClone(changed); invalid.colors.header = 'red';
  assert.throws(() => validateConfig(invalid));
  invalid.colors.header = '#ffffff'; invalid.vehicles = ['ELW', 'elw'];
  assert.throws(() => validateConfig(invalid));
  invalid.vehicles = ['vehicle-code-too-long'];
  assert.throws(() => validateConfig(invalid));
  invalid.vehicles = [];
  assert.deepEqual(validateConfig(invalid).vehicles, []);
});
test('persists posting templates, external resources and background settings; migrates older configuration', async t => {
  const legacy = structuredClone(defaults);
  delete legacy.captionTemplate; delete legacy.background; delete legacy.externalResources;
  const migrated = validateConfig(legacy);
  assert.equal(migrated.captionTemplate, defaults.captionTemplate);
  assert.deepEqual(migrated.background, defaults.background);
  assert.deepEqual(migrated.externalResources, defaults.externalResources);
  const { request } = await fixture(t);
  const initial = await (await request('/api/config')).json();
  const changed = structuredClone(migrated);
  changed.captionTemplate = '🚒 {fahrzeuge}\n👮 {weitere_kraefte}';
  changed.externalResources = ['Polizei', 'OR1-10'];
  changed.background.gradientEnabled = true; changed.background.gradientAngle = 45;
  changed.background.gradientStart = '#ff0000'; changed.background.gradientEnd = '#000000';
  const saved = await request('/api/config', writeOptions(changed, initial.revision));
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).config, changed);
  const invalid = structuredClone(changed); invalid.background.imageData = 'data:image/svg+xml,<svg/>';
  assert.throws(() => validateConfig(invalid));
  invalid.background.imageData = ''; invalid.background.imageOpacity = 2;
  assert.throws(() => validateConfig(invalid));
});

test('stores the uploaded background image across server restarts', async t => {
  const first = await fixture(t);
  const initial = await (await first.request('/api/config')).json();
  const changed = structuredClone(initial.config);
  changed.background.imageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDzuiiivePEP//Z';
  changed.background.imageOpacity = .55;
  const response = await first.request('/api/config', writeOptions(changed, initial.revision));
  assert.equal(response.status, 200);
  const reopened = await fixture(t, token, first.dataDir);
  const loaded = await (await reopened.request('/api/config')).json();
  assert.equal(loaded.config.background.imageData, changed.background.imageData);
  assert.equal(loaded.config.background.imageOpacity, .55);
});
