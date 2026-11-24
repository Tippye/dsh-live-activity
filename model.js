import { randomUUID } from 'node:crypto';

/**
 * Live activity records mirror iOS ActivityKit's split between immutable
 * attributes and an updatable content state, and reuse its system limits:
 * an activity runs for at most 8 hours, and after it ends it is retained for
 * at most 4 hours before the system removes it.
 */
export const HARD_LIFETIME_MS = 8 * 60 * 60 * 1000;
export const DEFAULT_RETENTION_MS = 10 * 60 * 1000;
export const MAX_RETENTION_MS = 4 * 60 * 60 * 1000;
export const MAX_RECORDS = 32;
export const MAX_ACTIVE = 8;
export const STALE_MIN_SECONDS = 5;
export const STALE_MAX_SECONDS = 86400;
export const MAX_METRICS = 3;
export const MAX_SAMPLES = 60;

/**
 * A card is only allowed while the work exposes something that actually changes:
 * a determinate progress fraction (a tqdm-style countdown to completion) or at
 * least one numeric series sampled over time (a loss curve, throughput, latency).
 * Everything else belongs in the reply or in a durable board.
 */
export const GATE_MESSAGE =
  'Live activity cards exist only for work that keeps reporting measurable progress: pass progress (0–1), or completed and total (a tqdm-style count), or at least one metrics sample (such as a training loss). A status-only update or an already finished step does not qualify — answer in the reply instead, or use dsh_board for a durable checklist.';

const ACCENTS = ['brand', 'success', 'warn', 'error', 'idle'];
const SYMBOLS = ['task', 'run', 'build', 'deploy', 'download', 'search', 'sync', 'alert'];
const STATUSES = ['active', 'ended'];

export class LiveActivityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LiveActivityError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new LiveActivityError(code, message);
};

function string(value, name, max, { empty = true } = {}) {
  if (typeof value !== 'string') fail('INVALID_INPUT', `${name} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed && !empty) fail('INVALID_INPUT', `${name} must not be empty.`);
  if (trimmed.length > max) fail('INVALID_INPUT', `${name} must be at most ${max} characters.`);
  return trimmed;
}

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_INPUT', `${name} must be a finite number.`);
  return value;
}

function oneOf(value, name, allowed) {
  if (!allowed.includes(value)) fail('INVALID_INPUT', `${name} must be one of ${allowed.join(', ')}.`);
  return value;
}

export function normalizeAttributes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_INPUT', 'A live activity needs a title.');
  const attributes = {
    title: string(input.title, 'title', 80, { empty: false }),
    symbol: oneOf(input.symbol ?? 'task', 'symbol', SYMBOLS),
    accent: oneOf(input.accent ?? 'brand', 'accent', ACCENTS),
  };
  if (input.subtitle !== undefined && input.subtitle !== null) attributes.subtitle = string(input.subtitle, 'subtitle', 120);
  return attributes;
}

function integer(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail('INVALID_INPUT', `${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function unitOf(input) {
  if (input.unit === undefined || input.unit === null) return {};
  return { unit: string(input.unit, 'metrics.unit', 24) };
}

/**
 * One sample per named series per call. A name seen before appends to that
 * series, so a training loop reports `loss` repeatedly without resending the
 * whole curve. History is bounded, oldest samples drop first.
 */
export function mergeMetrics(input, previous = [], now = Date.now()) {
  if (input === null) return undefined;
  if (!Array.isArray(input) || input.length === 0) fail('INVALID_INPUT', 'metrics must be a nonempty array of { name, value } samples, or null to clear.');
  if (input.length > MAX_METRICS) fail('INVALID_INPUT', `metrics accepts at most ${MAX_METRICS} samples per call.`);
  let metrics = (previous ?? []).map(series => ({ ...series, samples: [...series.samples] }));
  const seen = new Set();
  for (const sample of input) {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)) fail('INVALID_INPUT', 'Each metrics entry must be an object.');
    const name = string(sample.name, 'metrics.name', 40, { empty: false });
    if (seen.has(name)) fail('INVALID_INPUT', `Duplicate metrics name in one call: ${name}`);
    seen.add(name);
    const value = finite(sample.value, `metrics.${name}`);
    const unit = unitOf(sample);
    const existing = metrics.find(series => series.name === name);
    if (existing) {
      existing.samples.push({ at: now, value });
      if (unit.unit !== undefined) existing.unit = unit.unit;
      if (existing.samples.length > MAX_SAMPLES) existing.samples = existing.samples.slice(-MAX_SAMPLES);
    } else {
      if (metrics.length >= MAX_METRICS) fail('INVALID_INPUT', `An activity tracks at most ${MAX_METRICS} series; clear metrics or start a new card.`);
      metrics.push({ name, ...unit, samples: [{ at: now, value }] });
    }
  }
  return metrics;
}

/**
 * Partial content-state merge. `undefined` keeps the previous value, `null`
 * clears it, and a value replaces it. `phase` is required on the first state.
 * Counts (completed/total) derive the fraction, so a tqdm-style loop reports
 * the numbers it already has.
 */
export function normalizeState(input, previous, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_INPUT', 'The content state must be an object.');
  const phase = input.phase === undefined ? previous?.phase : string(input.phase, 'phase', 60, { empty: false });
  if (!phase) fail('INVALID_INPUT', 'phase is required.');
  const state = { phase };
  if (input.detail === undefined) {
    if (previous?.detail !== undefined) state.detail = previous.detail;
  } else if (input.detail !== null) {
    state.detail = string(input.detail, 'detail', 400);
  }

  const clearsProgress = input.progress === null;
  const total = clearsProgress ? undefined : input.total === undefined ? previous?.total : input.total;
  const completed = clearsProgress ? undefined : input.completed === undefined ? previous?.completed : input.completed;
  if (total !== undefined) {
    if (!Number.isInteger(total) || total <= 0) fail('INVALID_INPUT', 'total must be a positive integer.');
    state.total = total;
  }
  if (completed !== undefined) {
    if (!Number.isInteger(completed) || completed < 0) fail('INVALID_INPUT', 'completed must be a nonnegative integer.');
    state.completed = state.total === undefined ? completed : Math.min(completed, state.total);
  }
  if (clearsProgress) {
    // progress: null clears the fraction and its counts together.
  } else if (state.total !== undefined && state.completed !== undefined) {
    state.progress = state.completed / state.total;
  } else if (input.progress !== undefined) {
    const progress = finite(input.progress, 'progress');
    if (progress < 0 || progress > 1) fail('INVALID_INPUT', 'progress must be between 0 and 1.');
    state.progress = progress;
  } else if (previous?.progress !== undefined) {
    state.progress = previous.progress;
    if (previous.completed !== undefined) state.completed = previous.completed;
    if (previous.total !== undefined) state.total = previous.total;
  }

  if (input.etaEpochSeconds !== undefined) {
    if (input.etaEpochSeconds !== null) {
      const eta = finite(input.etaEpochSeconds, 'etaEpochSeconds');
      if (!Number.isInteger(eta) || eta <= 0) fail('INVALID_INPUT', 'etaEpochSeconds must be a positive integer of Unix seconds.');
      state.etaEpochSeconds = eta;
    }
  } else if (previous?.etaEpochSeconds !== undefined) {
    state.etaEpochSeconds = previous.etaEpochSeconds;
  }

  if (input.metrics !== undefined) {
    const metrics = mergeMetrics(input.metrics, previous?.metrics, now);
    if (metrics) state.metrics = metrics;
  } else if (previous?.metrics) {
    state.metrics = previous.metrics;
  }
  return state;
}

/** Whether a state carries something worth watching over time. */
export function tracksProgress(state) {
  if (!state) return false;
  if (state.progress !== undefined) return true;
  return Array.isArray(state.metrics) && state.metrics.some(series => Array.isArray(series.samples) && series.samples.length > 0);
}

/** Stored records are validated strictly, and never gated: older cards still load. */
function validateState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_RECORD', 'Stored state is not an object.');
  const state = { phase: string(value.phase, 'phase', 60, { empty: false }) };
  if (value.detail !== undefined) state.detail = string(value.detail, 'detail', 400);
  if (value.progress !== undefined) {
    const progress = finite(value.progress, 'progress');
    if (progress < 0 || progress > 1) fail('INVALID_RECORD', 'Stored progress is outside 0–1.');
    state.progress = progress;
  }
  if (value.completed !== undefined) state.completed = integer(value.completed, 'completed', 0, Number.MAX_SAFE_INTEGER);
  if (value.total !== undefined) state.total = integer(value.total, 'total', 1, Number.MAX_SAFE_INTEGER);
  if (value.etaEpochSeconds !== undefined) state.etaEpochSeconds = integer(value.etaEpochSeconds, 'etaEpochSeconds', 1, Number.MAX_SAFE_INTEGER);
  if (value.metrics !== undefined) {
    if (!Array.isArray(value.metrics) || value.metrics.length > MAX_METRICS) fail('INVALID_RECORD', `Stored metrics must hold at most ${MAX_METRICS} series.`);
    state.metrics = value.metrics.map(series => {
      if (!series || typeof series !== 'object' || Array.isArray(series)) fail('INVALID_RECORD', 'Stored series is not an object.');
      const samples = series.samples;
      if (!Array.isArray(samples) || samples.length < 1 || samples.length > MAX_SAMPLES) fail('INVALID_RECORD', `Stored series must hold 1–${MAX_SAMPLES} samples.`);
      const row = { name: string(series.name, 'metrics.name', 40, { empty: false }) };
      if (series.unit !== undefined) row.unit = string(series.unit, 'metrics.unit', 24);
      row.samples = samples.map(sample => {
        if (!sample || typeof sample !== 'object' || Array.isArray(sample)) fail('INVALID_RECORD', 'Stored sample is not an object.');
        return { at: finite(sample.at, 'at'), value: finite(sample.value, 'sample.value') };
      });
      return row;
    });
  }
  return state;
}

export function normalizeStale(value, previous = null) {
  if (value === undefined) return previous;
  if (value === null) return null;
  const seconds = finite(value, 'staleAfterSeconds');
  if (!Number.isInteger(seconds) || seconds < STALE_MIN_SECONDS || seconds > STALE_MAX_SECONDS) {
    fail('INVALID_INPUT', `staleAfterSeconds must be an integer from ${STALE_MIN_SECONDS} to ${STALE_MAX_SECONDS}, or null to never expire.`);
  }
  return seconds;
}

export function normalizeRelevance(value, previous = 0) {
  if (value === undefined) return previous;
  const relevance = finite(value, 'relevance');
  if (relevance < -1000 || relevance > 1000) fail('INVALID_INPUT', 'relevance must be between -1000 and 1000.');
  return relevance;
}

export function normalizeDismissal(policy) {
  if (policy === undefined || policy === null) return { type: 'default' };
  if (policy === 'immediate' || policy === 'default') return { type: policy };
  if (typeof policy === 'object' && !Array.isArray(policy)) {
    const seconds = policy.afterSeconds;
    if (Number.isInteger(seconds) && seconds >= 1 && seconds <= MAX_RETENTION_MS / 1000) return { type: 'after', afterSeconds: seconds };
  }
  fail('INVALID_INPUT', 'dismissalPolicy must be "immediate", "default" or { "afterSeconds": 1–14400 }.');
}

/** How long an ended card stays on screen before it is removed. */
export function retentionOf(policy) {
  if (!policy || policy.type === 'default') return DEFAULT_RETENTION_MS;
  if (policy.type === 'immediate') return 0;
  return Math.min(MAX_RETENTION_MS, Math.max(1000, policy.afterSeconds * 1000));
}

function dismissAtOf(record) {
  if (record.status !== 'ended' || !record.endedAt) return null;
  return record.endedAt + retentionOf(record.dismissalPolicy);
}

function expiresAtOf(record) {
  return record.startedAt + HARD_LIFETIME_MS;
}

function alive(record, now) {
  if (record.status === 'active') return now < expiresAtOf(record);
  const dismissAt = dismissAtOf(record);
  return dismissAt === null || now < dismissAt;
}

/**
 * The value an agent reads and the card renders: the stored record plus the
 * deadlines the system derives from it, exactly like ActivityKit's `staleDate`
 * and dismissal policy.
 */
/**
 * Who last wrote a card. `agent` is the tool, `local` is a program on this
 * machine, `lan` is another machine dialing the endpoint directly, and `tunnel`
 * is a machine reached through a reverse forward (which is why the peer address
 * cannot be used for the last one: it is always loopback).
 */
export function normalizeSource(source) {
  if (!source || typeof source !== 'object') return { type: 'agent' };
  const type = ['agent', 'local', 'lan', 'tunnel'].includes(source.type) ? source.type : 'agent';
  const row = { type };
  if (typeof source.ip === 'string' && source.ip.trim()) row.ip = source.ip.trim().slice(0, 64);
  if (typeof source.via === 'string' && source.via.trim()) row.via = source.via.trim().slice(0, 64);
  return row;
}

export function snapshot(record, now = Date.now()) {
  const value = structuredClone(record);
  value.stale = record.status === 'active' && record.staleAfterSeconds != null && now > record.updatedAt + record.staleAfterSeconds * 1000;
  value.expiresAt = expiresAtOf(record);
  value.dismissAt = dismissAtOf(record);
  value.sampledAt = now;
  return value;
}

/**
 * Validation run against every stored record when the domain opens. A corrupt
 * record is backed up and skipped rather than preventing the store from loading.
 */
export function validateRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_RECORD', 'Stored activity is not an object.');
  const record = {
    id: string(value.id, 'id', 100, { empty: false }),
    attributes: normalizeAttributes(value.attributes),
    state: validateState(value.state),
    status: oneOf(value.status, 'status', STATUSES),
    staleAfterSeconds: normalizeStale(value.staleAfterSeconds, null),
    relevance: normalizeRelevance(value.relevance, 0),
    startedAt: finite(value.startedAt, 'startedAt'),
    updatedAt: finite(value.updatedAt, 'updatedAt'),
  };
  if (value.endedAt !== undefined) record.endedAt = finite(value.endedAt, 'endedAt');
  if (value.dismissalPolicy !== undefined) record.dismissalPolicy = normalizeDismissal(value.dismissalPolicy);
  if (value.ownerSessionId !== undefined) record.ownerSessionId = string(value.ownerSessionId, 'ownerSessionId', 100, { empty: false });
  if (value.reporter !== undefined) {
    const reporter = normalizeSource(value.reporter);
    if (Number.isFinite(value.reporter?.at)) reporter.at = value.reporter.at;
    record.reporter = reporter;
  }
  if (record.status === 'ended' && record.endedAt === undefined) record.endedAt = record.updatedAt;
  return record;
}

export class LiveActivityStore {
  constructor(table, { now = Date.now, id = randomUUID } = {}) {
    this.table = table;
    this.now = now;
    this.id = id;
    this.tail = Promise.resolve();
  }

  list({ status = 'all', limit = 20 } = {}) {
    oneOf(status, 'status', ['all', ...STATUSES]);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail('INVALID_INPUT', 'limit must be an integer from 1 to 50.');
    const now = this.now();
    const matched = [...this.table.entries()]
      .map(([, record]) => record)
      .filter(record => alive(record, now) && (status === 'all' || record.status === status))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        if (b.relevance !== a.relevance) return b.relevance - a.relevance;
        return b.updatedAt - a.updatedAt;
      });
    return { activities: matched.slice(0, limit).map(record => snapshot(record, now)), total: matched.length, now };
  }

  get(id) {
    const record = this.table.get(string(id, 'id', 100, { empty: false }));
    if (!record) fail('NOT_FOUND', `Live activity ${id} does not exist.`);
    return snapshot(record, this.now());
  }

  async run(input, ownerSessionId, source) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_INPUT', 'Operation must be an object.');
    if (input.action === 'list') return this.list(input);
    if (input.action === 'get') return this.get(input.id);
    const operation = this.tail.then(() => this.mutate(input, ownerSessionId, source));
    this.tail = operation.catch(() => {});
    return operation;
  }

  async mutate(input, ownerSessionId, source) {
    const now = this.now();
    if (input.action === 'create') {
      const state = normalizeState(input, null, now);
      if (!tracksProgress(state)) fail('NOT_PROGRESS_TRACKING', GATE_MESSAGE);
      const active = [...this.table.entries()].filter(([, record]) => record.status === 'active').length;
      if (active >= MAX_ACTIVE) fail('LIMIT_REACHED', `${MAX_ACTIVE} live activities are already active. End one with live_activity end before creating another.`);
      if (this.table.size >= MAX_RECORDS) fail('LIMIT_REACHED', `This profile already stores ${MAX_RECORDS} activity records. Dismiss or end old ones and retry.`);
      const record = {
        id: this.id(),
        attributes: normalizeAttributes(input),
        state,
        status: 'active',
        staleAfterSeconds: normalizeStale(input.staleAfterSeconds, null),
        relevance: normalizeRelevance(input.relevance, 0),
        reporter: { ...normalizeSource(source), at: now },
        startedAt: now,
        updatedAt: now,
        ...(ownerSessionId ? { ownerSessionId } : {}),
      };
      await this.table.put(record.id, record);
      return snapshot(record, now);
    }
    const current = this.table.get(string(input.id, 'id', 100, { empty: false }));
    if (!current) fail('NOT_FOUND', `Live activity ${input.id} does not exist.`);
    if (input.action === 'dismiss') {
      await this.table.delete(current.id);
      return { id: current.id, dismissed: true, sampledAt: now };
    }
    if (current.status !== 'active') {
      if (input.action === 'end') return snapshot(current, now);
      fail('ENDED', `Live activity ${current.id} already ended at ${new Date(current.endedAt).toISOString()}.`);
    }
    const record = structuredClone(current);
    const state = normalizeState(input, current.state, now);
    // A card that showed progress must not quietly become a status badge; an
    // older card that never tracked anything can only be closed, not updated.
    // `end` stays open so any card can always be shut down gracefully.
    if (input.action !== 'end' && !tracksProgress(state)) {
      fail(
        'NOT_PROGRESS_TRACKING',
        tracksProgress(current.state)
          ? 'An update must keep the measurable progress or series this card was created with. To close the card, call end instead.'
          : 'This card tracks neither progress nor a series, so it cannot be updated. Call end to close it.',
      );
    }
    record.state = state;
    if (input.staleAfterSeconds !== undefined) record.staleAfterSeconds = normalizeStale(input.staleAfterSeconds, current.staleAfterSeconds);
    if (input.relevance !== undefined) record.relevance = normalizeRelevance(input.relevance, current.relevance);
    record.updatedAt = now;
    record.reporter = { ...normalizeSource(source), at: now };
    if (input.action === 'end') {
      record.status = 'ended';
      record.endedAt = now;
      record.dismissalPolicy = normalizeDismissal(input.dismissalPolicy);
    }
    await this.table.put(record.id, record);
    return snapshot(record, now);
  }

  /**
   * Housekeeping the Harness has to do because it owns the surface: end cards
   * that outlived the 8 hour limit and remove ended cards past their retention.
   */
  async sweep() {
    const now = this.now();
    const expired = [];
    const retained = [];
    for (const [key, record] of this.table.entries()) {
      if (record.status === 'active') {
        if (now >= expiresAtOf(record)) expired.push(key);
        continue;
      }
      const dismissAt = dismissAtOf(record);
      if (dismissAt !== null && now >= dismissAt) retained.push(key);
    }
    const keys = [...expired, ...retained];
    if (keys.length) await this.table.deleteMany(keys);
    return { expired: expired.length, dismissed: retained.length };
  }
}
