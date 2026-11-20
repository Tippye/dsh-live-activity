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

/**
 * Partial content-state merge. `undefined` keeps the previous value, `null`
 * clears it, and a value replaces it. `phase` is required on the first state.
 */
export function normalizeState(input, previous) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_INPUT', 'The content state must be an object.');
  const phase = input.phase === undefined ? previous?.phase : string(input.phase, 'phase', 60, { empty: false });
  if (!phase) fail('INVALID_INPUT', 'phase is required.');
  const state = { phase };
  if (input.detail === undefined) {
    if (previous?.detail !== undefined) state.detail = previous.detail;
  } else if (input.detail !== null) {
    state.detail = string(input.detail, 'detail', 400);
  }
  if (input.progress !== undefined) {
    if (input.progress !== null) {
      const progress = finite(input.progress, 'progress');
      if (progress < 0 || progress > 1) fail('INVALID_INPUT', 'progress must be between 0 and 1.');
      state.progress = progress;
    }
  } else if (previous?.progress !== undefined) {
    state.progress = previous.progress;
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
    state: normalizeState(value.state, null),
    status: oneOf(value.status, 'status', STATUSES),
    staleAfterSeconds: normalizeStale(value.staleAfterSeconds, null),
    relevance: normalizeRelevance(value.relevance, 0),
    startedAt: finite(value.startedAt, 'startedAt'),
    updatedAt: finite(value.updatedAt, 'updatedAt'),
  };
  if (value.endedAt !== undefined) record.endedAt = finite(value.endedAt, 'endedAt');
  if (value.dismissalPolicy !== undefined) record.dismissalPolicy = normalizeDismissal(value.dismissalPolicy);
  if (value.ownerSessionId !== undefined) record.ownerSessionId = string(value.ownerSessionId, 'ownerSessionId', 100, { empty: false });
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

  async run(input, ownerSessionId) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_INPUT', 'Operation must be an object.');
    if (input.action === 'list') return this.list(input);
    if (input.action === 'get') return this.get(input.id);
    const operation = this.tail.then(() => this.mutate(input, ownerSessionId));
    this.tail = operation.catch(() => {});
    return operation;
  }

  async mutate(input, ownerSessionId) {
    const now = this.now();
    if (input.action === 'create') {
      const active = [...this.table.entries()].filter(([, record]) => record.status === 'active').length;
      if (active >= MAX_ACTIVE) fail('LIMIT_REACHED', `${MAX_ACTIVE} live activities are already active. End one with live_activity end before creating another.`);
      if (this.table.size >= MAX_RECORDS) fail('LIMIT_REACHED', `This profile already stores ${MAX_RECORDS} activity records. Dismiss or end old ones and retry.`);
      const record = {
        id: this.id(),
        attributes: normalizeAttributes(input),
        state: normalizeState(input, null),
        status: 'active',
        staleAfterSeconds: normalizeStale(input.staleAfterSeconds, null),
        relevance: normalizeRelevance(input.relevance, 0),
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
    record.state = normalizeState(input, current.state);
    if (input.staleAfterSeconds !== undefined) record.staleAfterSeconds = normalizeStale(input.staleAfterSeconds, current.staleAfterSeconds);
    if (input.relevance !== undefined) record.relevance = normalizeRelevance(input.relevance, current.relevance);
    record.updatedAt = now;
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
