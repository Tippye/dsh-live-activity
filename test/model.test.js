import { LiveActivityStore, snapshot, HARD_LIFETIME_MS } from '../model.js';

let clock = 1_700_000_000_000;
const now = () => clock;
let seq = 0;
const id = () => `a${++seq}`;

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

const table = new FakeTable();
const store = new LiveActivityStore(table, { now, id });
const assert = (condition, message) => { if (!condition) throw new Error(`FAILED: ${message}`); console.log('ok -', message); };

const created = await store.run({
  action: 'create', title: 'Deploy web', subtitle: 'prod', phase: 'Building', detail: 'Compiling the bundle',
  progress: 0.2, etaEpochSeconds: Math.floor((clock + 600_000) / 1000), staleAfterSeconds: 300, accent: 'brand', symbol: 'build',
}, 'session-1');
assert(created.id === 'a1' && created.status === 'active', 'create returns an active activity');
assert(created.state.phase === 'Building' && created.state.progress === 0.2, 'create keeps the content state');
assert(created.stale === false, 'a fresh activity is not stale');
assert(created.expiresAt === created.startedAt + HARD_LIFETIME_MS, 'expiry is 8 hours after the start');
assert(created.dismissAt === null, 'an active activity has no dismissal deadline');
assert(created.ownerSessionId === 'session-1', 'the owning session is recorded');

const updated = await store.run({ action: 'update', id: 'a1', phase: 'Uploading', progress: 0.72, relevance: 5 });
assert(updated.state.phase === 'Uploading' && updated.state.progress === 0.72 && updated.state.detail === 'Compiling the bundle', 'update merges the partial state');
assert(updated.attributes.title === 'Deploy web', 'attributes stay immutable');

clock += 301_000;
const stale = store.get('a1');
assert(stale.stale === true, 'staleAfterSeconds marks the card stale after the window');

const cleared = await store.run({ action: 'update', id: 'a1', progress: null, etaEpochSeconds: null });
assert(cleared.state.progress === undefined && cleared.state.etaEpochSeconds === undefined, 'null clears optional state fields');
assert(cleared.stale === false, 'a fresh update clears staleness');

const ended = await store.run({ action: 'end', id: 'a1', phase: 'Deployed', dismissalPolicy: { afterSeconds: 120 } });
assert(ended.status === 'ended' && ended.state.phase === 'Deployed', 'end stores the final state');
assert(ended.dismissAt === ended.endedAt + 120_000, 'afterSeconds sets the retention deadline');
assert(ended.stale === false, 'an ended activity is never stale');

const idempotent = await store.run({ action: 'end', id: 'a1', phase: 'Ignored' });
assert(idempotent.state.phase === 'Deployed', 'ending twice keeps the final state');

let rejected = null;
try { await store.run({ action: 'update', id: 'a1', phase: 'Too late' }); } catch (error) { rejected = error; }
assert(rejected?.code === 'ENDED', 'updating an ended activity is refused');

clock += 121_000;
const swept = await store.sweep();
assert(swept.dismissed === 1 && store.list().activities.length === 0, 'sweep removes an ended activity past retention');

const immediate = await store.run({ action: 'create', title: 'Quick', phase: 'Working' });
const gone = await store.run({ action: 'end', id: immediate.id, dismissalPolicy: 'immediate' });
assert(gone.dismissAt === gone.endedAt && store.list().activities.length === 0, 'immediate removal hides the card at once');

for (let i = 0; i < 8; i++) await store.run({ action: 'create', title: `Card ${i}`, phase: 'Working' });
let limited = null;
try { await store.run({ action: 'create', title: 'Overflow', phase: 'Working' }); } catch (error) { limited = error; }
assert(limited?.code === 'LIMIT_REACHED', 'active cards are capped');

const listed = store.list({ status: 'active', limit: 3 });
assert(listed.activities.length === 3 && listed.total === 8, 'list filters and counts');

clock += HARD_LIFETIME_MS + 1;
const expired = await store.sweep();
assert(expired.expired === 8 && store.list().activities.length === 0, 'activities past the 8 hour limit expire');

const dismissed = await store.run({ action: 'create', title: 'Dismiss me', phase: 'Working' });
await store.run({ action: 'dismiss', id: dismissed.id });
assert(store.list().activities.length === 0, 'dismiss removes the record');

console.log('\nall model checks passed');
