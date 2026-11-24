import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startEndpoint, readOrCreateToken, endpointDir, bindHost, lanUrls } from '../endpoint.js';
import { LiveActivityStore } from '../model.js';

class FakeTable {
  constructor() { this.map = new Map(); }
  get size() { return this.map.size; }
  get(key) { return this.map.get(key); }
  entries() { return this.map.entries(); }
  keys() { return this.map.keys(); }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { return this.map.delete(key); }
  async deleteMany(keys) { let count = 0; for (const key of keys) if (this.map.delete(key)) count++; return count; }
  async update(key, fn) { const next = fn(this.get(key)); await this.put(key, next); return next; }
}

let clock = 1_700_000_000_000;
let seq = 0;
const store = new LiveActivityStore(new FakeTable(), { now: () => clock, id: () => `e${++seq}` });

// Keep the real profile untouched: the endpoint derives its directory from
// DSH_HOME, so a temporary home keeps the token file out of ~/.dsh.
const home = mkdtempSync(join(tmpdir(), 'dla-endpoint-'));
process.env.DSH_HOME = home;
process.on('exit', () => rmSync(home, { recursive: true, force: true }));

const { token } = await readOrCreateToken(endpointDir());
assert.ok(token.length >= 32, 'a token is created on first use');
assert.equal((await readOrCreateToken(endpointDir())).token, token, 'the token is reused, not regenerated');

const post = (endpoint, body, bearer = token) =>
  fetch(endpoint.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('the listener binds loopback unless LAN access is on', async t => {
  assert.equal(bindHost(false), '127.0.0.1', 'loopback by default');
  assert.equal(bindHost(undefined), '127.0.0.1', 'a missing setting stays on loopback');
  assert.equal(bindHost(true), '0.0.0.0', 'LAN access binds every interface');
  assert.ok(Array.isArray(lanUrls(41363)), 'lanUrls always answers a list');

  const endpoint = await startEndpoint(store, { port: 0 });
  t.after(() => endpoint.dispose());
  assert.equal(endpoint.host, '127.0.0.1');
  assert.deepEqual(endpoint.urls, [`http://127.0.0.1:${endpoint.port}`], 'a loopback listener reports one dialable URL');
});

test('the endpoint creates, updates and closes a card', async t => {
  const endpoint = await startEndpoint(store, { port: 0 });
  t.after(() => endpoint.dispose());
  assert.equal(endpoint.host, '127.0.0.1');
  assert.ok(endpoint.port > 0);
  assert.ok(endpoint.tokenFile.endsWith('token'));

  assert.equal((await post(endpoint, { action: 'list' }, null)).status, 401, 'a missing token is refused');
  assert.equal((await post(endpoint, { action: 'list' }, 'wrong')).status, 401, 'a wrong token is refused');

  const created = await post(endpoint, { action: 'create', title: 'From a script', phase: 'Step 1', completed: 1, total: 4 });
  assert.equal(created.status, 200);
  const activity = (await created.json()).value;
  assert.equal(activity.state.progress, 0.25);

  const updated = await post(endpoint, { action: 'update', id: activity.id, completed: 3 });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).value.state.progress, 0.75);

  const ended = await post(endpoint, { action: 'end', id: activity.id, phase: 'Done', dismissalPolicy: 'immediate' });
  assert.equal(ended.status, 200);
  assert.equal((await ended.json()).value.status, 'ended');

  const listed = await post(endpoint, { action: 'list' });
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).value.total, 0);
});

test('the progress gate and input validation apply over HTTP too', async t => {
  const endpoint = await startEndpoint(store, { port: 0 });
  t.after(() => endpoint.dispose());

  const statusOnly = await post(endpoint, { action: 'create', title: 'Status only', phase: 'Working' });
  assert.equal(statusOnly.status, 422);
  assert.equal((await statusOnly.json()).error.code, 'NOT_PROGRESS_TRACKING');

  assert.equal((await post(endpoint, { action: 'reboot' })).status, 400, 'an unknown action is refused');
  assert.equal((await post(endpoint, '{not json')).status, 400, 'malformed JSON is refused');

  const method = await fetch(endpoint.url, { method: 'GET' });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'POST');

  const tooLarge = await post(endpoint, { action: 'list', padding: 'x'.repeat(70000) });
  assert.equal(tooLarge.status, 413);
});

test('a configured port falls back when it is busy', async t => {
  const first = await startEndpoint(store, { port: 0 });
  t.after(() => first.dispose());
  const second = await startEndpoint(store, { config: { port: first.port } });
  t.after(() => second.dispose());
  assert.notEqual(second.port, first.port, 'the busy port is not reused');
  assert.equal((await post(second, { action: 'list' })).status, 200);
});