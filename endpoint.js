import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';

/**
 * A program-facing HTTP endpoint, so a build script, a training loop or a
 * device on the LAN can drive a card without going through the agent.
 *
 * It listens on loopback by default. Binding it wider is an explicit decision:
 * `host: '0.0.0.0'` in the plugin config makes it reachable from other
 * machines, and the bearer token in the profile is then the only gate.
 */
export const LOOPBACK_HOST = '127.0.0.1';
export const LAN_HOST = '0.0.0.0';
export const DEFAULT_HOST = LOOPBACK_HOST;
export const DEFAULT_PORT = 41363;
export const MAX_BODY = 65536;
export const ALLOWED_ACTIONS = ['create', 'update', 'end', 'dismiss', 'list', 'get'];

const STATUS = {
  INVALID_INPUT: 400,
  INVALID_RECORD: 400,
  NOT_PROGRESS_TRACKING: 422,
  NOT_FOUND: 404,
  ENDED: 409,
  LIMIT_REACHED: 429,
  TOO_LARGE: 413,
  FORBIDDEN: 403,
};

/**
 * The interface the listener binds. LAN access is opt-in and off by default:
 * turning it on exposes an authenticated but unencrypted HTTP port to the
 * local network, so it stays a deliberate choice.
 */
export function bindHost(lanAccess) {
  return lanAccess === true ? LAN_HOST : LOOPBACK_HOST;
}

/** IPv4 addresses other machines can dial when the listener is bound wild. */
export function lanUrls(port) {
  const urls = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const entry of list ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) urls.push(`http://${entry.address}:${port}`);
    }
  }
  return urls;
}

/** `$DSH_HOME/plugin-data/dsh-live-activity`, the same place plugins keep data. */
export function endpointDir() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  return join(home, 'plugin-data', 'dsh-live-activity');
}

/**
 * The token file is the handoff: a program reads it once, or its operator
 * pastes its contents into the script's environment. Creating it is idempotent.
 */
export async function readOrCreateToken(dir = endpointDir()) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, 'token');
  try {
    const existing = (await readFile(file, 'utf8')).trim();
    if (/^[a-f0-9]{32,128}$/i.test(existing)) return { token: existing.toLowerCase(), file, created: false };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const token = randomBytes(24).toString('hex');
  await writeFile(file, token + '\n', { mode: 0o600 });
  return { token, file, created: true };
}

function authorised(request, token) {
  const header = request.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  const presented = (match ? match[1] : request.headers['x-live-activity-token']) ?? '';
  const expected = Buffer.from(token);
  const actual = Buffer.from(String(presented).trim());
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

async function readBody(request) {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (declared > MAX_BODY) {
    const error = new Error('Request exceeds 64 KiB.');
    error.code = 'TOO_LARGE';
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const error = new Error('Request exceeds 64 KiB.');
      error.code = 'TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    const error = new Error('Send a JSON body with an action.');
    error.code = 'INVALID_INPUT';
    throw error;
  }
  return JSON.parse(raw);
}

function reply(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  response.end(body);
}

/**
 * Start the listener. A busy port falls back to an ephemeral one, which the
 * caller reports rather than swallowing: the URL a program uses must be real.
 */
export async function startEndpoint(store, options = {}) {
  const { host = DEFAULT_HOST, port = DEFAULT_PORT, config = {}, logger } = options;
  const endpointConfigured = config && typeof config === 'object' ? config : {};
  const desiredHost = typeof endpointConfigured.host === 'string' && endpointConfigured.host.trim()
    ? endpointConfigured.host.trim()
    : bindHost(endpointConfigured.lanAccess ?? options.lanAccess);
  const desiredPort = Number.isInteger(endpointConfigured.port) ? endpointConfigured.port : port;
  const { token, file, created } = await readOrCreateToken();

  const handler = async (request, response) => {
    try {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return reply(response, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST a JSON body.' } });
      }
      if (!authorised(request, token)) {
        return reply(response, 401, {
          ok: false,
          error: { code: 'UNAUTHORIZED', message: `Send the bearer token from ${file} as "Authorization: Bearer <token>".` },
        });
      }
      const input = await readBody(request);
      if (!input || typeof input !== 'object' || !ALLOWED_ACTIONS.includes(input.action)) {
        return reply(response, 400, {
          ok: false,
          error: { code: 'INVALID_INPUT', message: `action must be one of ${ALLOWED_ACTIONS.join(', ')}.` },
        });
      }
      const value = await store.run(input);
      return reply(response, 200, { ok: true, value });
    } catch (error) {
      const code = error.code ?? 'INVALID_REQUEST';
      return reply(response, STATUS[code] ?? 400, { ok: false, error: { code, message: error.message } });
    }
  };

  const listen = attemptPort =>
    new Promise((resolve, reject) => {
      const server = http.createServer(handler);
      server.once('error', reject);
      server.listen(attemptPort, desiredHost, () => {
        server.removeListener('error', reject);
        server.on('error', error => logger?.warn?.('Live activity endpoint: %s', error.message));
        resolve(server);
      });
    });

  let server;
  try {
    server = await listen(desiredPort);
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    logger?.warn?.('Live activity endpoint: port %d is busy, using an ephemeral port', desiredPort);
    server = await listen(0);
  }

  const actualPort = server.address().port;
  // A wildcard bind has no dialable address of its own, so report the interfaces.
  const wildcard = desiredHost === LAN_HOST || desiredHost === '::';
  const urls = wildcard ? lanUrls(actualPort) : [`http://${desiredHost}:${actualPort}`];
  const url = urls[0] ?? `http://${desiredHost}:${actualPort}`;
  if (logger) logger.info('Live activity endpoint listening on %s%s (token in %s%s)', `${desiredHost}:${actualPort}`, wildcard ? ` as ${urls.join(', ')}` : '', file, created ? ', newly created' : '');

  return {
    url,
    urls,
    host: desiredHost,
    port: actualPort,
    tokenFile: file,
    dispose: () =>
      new Promise(resolve => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}