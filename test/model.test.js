import { LiveActivityStore, snapshot, validateRecord, HARD_LIFETIME_MS, MAX_SAMPLES } from '../model.js';

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
const rejects = async (code, run, message) => {
  let error = null;
  try { await run(); } catch (failure) { error = failure; }
  assert(error?.code === code, message);
};

// ---- the gate: only measurable progress or a numeric series may open a card ----

await rejects('NOT_PROGRESS_TRACKING', () => store.run({ action: 'create', title: 'Status only', phase: 'Checking things' }), 'a status-only card is refused');
await rejects('NOT_PROGRESS_TRACKING', () => store.run({ action: 'create', title: 'Already done', phase: 'Finished' }), 'an already finished state is refused');
await rejects('NOT_PROGRESS_TRACKING', () => store.run({ action: 'create', title: 'Eta only', phase: 'Waiting', etaEpochSeconds: Math.floor(clock / 1000) + 600 }), 'an ETA alone is not progress');
assert(table.size === 0, 'a refused create stores nothing');

// ---- a tqdm-style count qualifies, and derives the fraction ----

const counted = await store.run({ action: 'create', title: 'Deploy web', subtitle: 'prod', phase: 'Uploading', completed: 2, total: 5, etaEpochSeconds: Math.floor((clock + 600_000) / 1000), staleAfterSeconds: 300 }, 'session-1');
assert(counted.id === 'a1' && counted.status === 'active', 'create with completed/total succeeds');
assert(counted.state.progress === 0.4 && counted.state.completed === 2 && counted.state.total === 5, 'counts derive the fraction');
assert(counted.stale === false, 'a fresh card is not stale');
assert(counted.expiresAt === counted.startedAt + HARD_LIFETIME_MS, 'expiry is 8 hours after the start');
assert(counted.ownerSessionId === 'session-1', 'the owning session is recorded');

const advanced = await store.run({ action: 'update', id: 'a1', completed: 4 });
assert(advanced.state.completed === 4 && advanced.state.progress === 0.8, 'a later update may send completed alone');
assert(advanced.state.total === 5, 'the total carries over');
assert(advanced.attributes.title === 'Deploy web', 'attributes stay immutable');

const overshoot = await store.run({ action: 'update', id: 'a1', completed: 9 });
assert(overshoot.state.completed === 5 && overshoot.state.progress === 1, 'counts clamp to the total');

const phaseOnly = await store.run({ action: 'update', id: 'a1', phase: 'Restarting the workers' });
assert(phaseOnly.state.phase === 'Restarting the workers' && phaseOnly.state.progress === 1, 'a phase-only update keeps the progress');
await rejects('NOT_PROGRESS_TRACKING', () => store.run({ action: 'update', id: 'a1', progress: null }), 'an update cannot drop the progress it was created with');

// ---- a numeric series qualifies, and appends one sample per call ----

const lossy = await store.run({ action: 'create', title: 'YOLO training', phase: 'Epoch 1', metrics: [{ name: 'loss', value: 0.92, unit: '' }] });
assert(lossy.state.metrics.length === 1 && lossy.state.metrics[0].samples.length === 1, 'create with a metrics sample stores one point');
assert(lossy.state.progress === undefined, 'a series card needs no fraction');

const second = await store.run({ action: 'update', id: lossy.id, phase: 'Epoch 2', metrics: [{ name: 'loss', value: 0.71 }, { name: 'lr', value: 0.0003 }] });
assert(second.state.metrics[0].samples.length === 2 && second.state.metrics[0].samples[1].value === 0.71, 'a known name appends to its series');
assert(second.state.metrics[1].name === 'lr' && second.state.metrics.length === 2, 'a new name starts a second series');
await rejects('INVALID_INPUT', () => store.run({ action: 'update', id: lossy.id, metrics: [{ name: 'a', value: 1 }, { name: 'b', value: 1 }, { name: 'c', value: 1 }] }), 'a fourth series is refused');
await rejects('INVALID_INPUT', () => store.run({ action: 'update', id: lossy.id, metrics: [{ name: 'loss', value: 'high' }] }), 'a non-numeric sample is refused');

for (let i = 0; i < 70; i++) await store.run({ action: 'update', id: lossy.id, metrics: [{ name: 'loss', value: i }] });
const capped = store.get(lossy.id);
assert(capped.state.metrics[0].samples.length === MAX_SAMPLES, `history is capped at ${MAX_SAMPLES} samples`);
assert(capped.state.metrics[0].samples.at(-1).value === 69, 'the newest sample survives the cap');

await rejects('NOT_PROGRESS_TRACKING', () => store.run({ action: 'update', id: lossy.id, metrics: null }), 'an update cannot drop the series it was created with');

// ---- stale, end and retention ----

clock += 301_000;
assert(store.get('a1').stale === true, 'staleAfterSeconds marks the card stale after the window');
const refreshed = await store.run({ action: 'update', id: 'a1', phase: 'Uploading again' });
assert(refreshed.stale === false, 'a fresh update clears staleness');

const ended = await store.run({ action: 'end', id: 'a1', phase: 'Deployed', dismissalPolicy: { afterSeconds: 120 } });
assert(ended.status === 'ended' && ended.state.phase === 'Deployed', 'end stores the final state');
assert(ended.state.progress === 1, 'end keeps the final progress');
assert(ended.dismissAt === ended.endedAt + 120_000, 'afterSeconds sets the retention deadline');
assert(ended.stale === false, 'an ended card is never stale');
const endedTwice = await store.run({ action: 'end', id: 'a1', phase: 'Ignored' });
assert(endedTwice.state.phase === 'Deployed', 'ending twice keeps the final state');
await rejects('ENDED', () => store.run({ action: 'update', id: 'a1', phase: 'Too late' }), 'updating an ended card is refused');

clock += 121_000;
const swept = await store.sweep();
assert(swept.dismissed === 1 && store.list().activities.length === 1, 'sweep removes an ended card past retention and keeps the rest');

const immediate = await store.run({ action: 'create', title: 'Quick', phase: 'Working', progress: 0.5 });
const gone = await store.run({ action: 'end', id: immediate.id, dismissalPolicy: 'immediate' });
assert(gone.dismissAt === gone.endedAt, 'immediate removal hides the card at once');

// ---- a card created before the gate still loads, and can still be closed ----

const legacy = validateRecord({ id: 'legacy', attributes: { title: 'Old card', symbol: 'task', accent: 'brand' }, state: { phase: 'Watching' }, status: 'active', staleAfterSeconds: null, relevance: 0, startedAt: clock, updatedAt: clock });
assert(legacy.state.phase === 'Watching' && legacy.state.progress === undefined, 'a stored card without progress still validates');
await table.put('legacy', legacy);
await rejects('NOT_PROGRESS_TRACKING', () => store.run({ action: 'update', id: 'legacy', phase: 'Still watching' }), 'a legacy card cannot be updated');
const closed = await store.run({ action: 'end', id: 'legacy', phase: 'Closed' });
assert(closed.status === 'ended', 'a legacy card can still be ended');
await store.run({ action: 'dismiss', id: 'legacy' });

// ---- who reported the numbers ----

const fromLan = await store.run({ action: 'create', title: 'From the LAN', phase: 'Working', progress: 0.1 }, 'session-x', { type: 'lan', ip: '192.168.100.9' });
assert(fromLan.reporter.type === 'lan' && fromLan.reporter.ip === '192.168.100.9', 'a LAN caller is recorded with its address');
assert(Number.isFinite(fromLan.reporter.at), 'the report carries a timestamp');

const fromTunnel = await store.run({ action: 'update', id: fromLan.id, phase: 'Through the tunnel', progress: 0.4 }, undefined, { type: 'tunnel', ip: '183.147.142.103', via: '127.0.0.1:41410' });
assert(fromTunnel.reporter.type === 'tunnel' && fromTunnel.reporter.ip === '183.147.142.103', 'a tunnelled caller keeps the far-end address');
assert(fromTunnel.reporter.via === '127.0.0.1:41410', 'the forwarding port is kept as context');

const byAgent = await store.run({ action: 'update', id: fromLan.id, phase: 'Agent took over', progress: 0.6 });
assert(byAgent.reporter.type === 'agent' && byAgent.reporter.ip === undefined, 'an agent update clears the remote address');
await store.run({ action: 'dismiss', id: fromLan.id });

// ---- limits and listing ----

await store.run({ action: 'end', id: lossy.id, phase: 'Trained' });
for (let i = 0; i < 8; i++) await store.run({ action: 'create', title: `Card ${i}`, phase: 'Working', progress: 0.1 });
await rejects('LIMIT_REACHED', () => store.run({ action: 'create', title: 'Overflow', phase: 'Working', progress: 0.1 }), 'active cards are capped');
const listed = store.list({ status: 'active', limit: 3 });
assert(listed.activities.length === 3 && listed.total === 8, 'list filters and counts');

clock += HARD_LIFETIME_MS + 1;
const expired = await store.sweep();
assert(expired.expired === 8 && store.list().activities.length === 0, 'cards past the 8 hour limit expire');

const dismissed = await store.run({ action: 'create', title: 'Dismiss me', phase: 'Working', progress: 0 });
await store.run({ action: 'dismiss', id: dismissed.id });
assert(store.list().activities.length === 0, 'dismiss removes the record');
assert(snapshot({ id: 'x' }).id === 'x', 'snapshot copies a plain record');

console.log('\nall model checks passed');