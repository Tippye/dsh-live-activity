import { randomUUID } from 'node:crypto';
import { access, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LiveActivityError } from './model.js';

/**
 * Reverse SSH tunnels owned by this plugin instance.
 *
 * A machine on another network cannot reach the loopback endpoint, and binding
 * the listener to the LAN exposes a port to everything nearby. A tunnel is the
 * middle ground: it opens one port on the *remote* host that forwards back to
 * the local loopback endpoint, so only that host can use it and nothing is
 * exposed here.
 *
 * The supervisor spawns through `ctx.subprocess`, whose own disposal terminates
 * managed children, and kills whatever is left when this plugin unloads — so a
 * tunnel never outlives the window it was created from.
 */
export const TUNNEL_SSH_OPTIONS = [
  '-o', 'BatchMode=yes',
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
];

const HOST_PATTERN = /^[A-Za-z0-9._:-]{1,255}$/;
const USER_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function expandHome(path) {
  if (typeof path !== 'string' || !path.trim()) return undefined;
  const trimmed = path.trim();
  if (trimmed === '~') return homedir();
  if (trimmed.startsWith('~/')) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

function port(value, name) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new LiveActivityError('INVALID_INPUT', `${name} must be an integer from 1 to 65535.`);
  }
  return value;
}

/**
 * Build the argv for one reverse tunnel. Arguments are passed as an array, so
 * neither the host nor the identity path can turn into shell syntax.
 */
export async function buildTunnelArgv(request) {
  const { host, user, sshPort = 22, remotePort, localPort, identityFile } = request ?? {};
  if (typeof host !== 'string' || !HOST_PATTERN.test(host.trim())) {
    throw new LiveActivityError('INVALID_INPUT', 'host must be a hostname or IP address.');
  }
  if (typeof user !== 'string' || !USER_PATTERN.test(user.trim())) {
    throw new LiveActivityError('INVALID_INPUT', 'user must be a plain account name.');
  }
  const options = [...TUNNEL_SSH_OPTIONS, '-p', String(port(sshPort, 'sshPort'))];
  const key = expandHome(identityFile);
  if (key !== undefined) {
    if (!key.startsWith('/')) throw new LiveActivityError('INVALID_INPUT', 'identityFile must be an absolute path or start with ~/.');
    try {
      const info = await stat(key);
      if (!info.isFile()) throw new LiveActivityError('INVALID_INPUT', `identityFile is not a file: ${key}`);
      await access(key);
    } catch (error) {
      if (error instanceof LiveActivityError) throw error;
      throw new LiveActivityError('INVALID_INPUT', `identityFile cannot be read: ${key}`);
    }
    options.push('-i', key);
  }
  const remote = port(remotePort, 'remotePort');
  const local = port(localPort, 'localPort');
  // Name the remote bind address explicitly: with GatewayPorts off, sshd picks a
  // loopback family on its own and happily lands on [::1] while the caller dials
  // 127.0.0.1, which looks like a dead tunnel.
  const argv = ['ssh', '-N', ...options, '-R', `127.0.0.1:${remote}:127.0.0.1:${local}`, `${user.trim()}@${host.trim()}`];
  return {
    argv,
    key,
    remotePort: remote,
    localPort: local,
    remoteBind: `127.0.0.1:${remote}`,
    target: `${user.trim()}@${host.trim()}:${sshPort}`,
    sshPort,
  };
}

/** Reads whatever a handle has collected without consuming it. */
export function collectedText(handle, stream) {
  try {
    const reader = stream === 'stderr' ? handle.collected?.stderr : handle.collected?.stdout;
    if (!reader) return '';
    return reader.readFrom(0).text.trim();
  } catch (_) {
    return '';
  }
}

export class TunnelRegistry {
  constructor({ spawn, resolveExecutable, cwd, logger, now = Date.now, id = randomUUID, startupWaitMs = 1200 }) {
    this.spawn = spawn;
    this.resolveExecutable = resolveExecutable;
    this.cwd = cwd;
    this.logger = logger;
    this.now = now;
    this.id = id;
    this.startupWaitMs = startupWaitMs;
    this.tunnels = new Map();
    this.tail = Promise.resolve();
  }

  view(record) {
    const { handle, ...rest } = record;
    return { ...rest, output: collectedText(handle, 'stderr') };
  }

  list() {
    return [...this.tunnels.values()].map(record => this.view(record));
  }

  async start(request) {
    const built = await buildTunnelArgv(request);
    const executable = await this.resolveExecutable('ssh');
    const handle = this.spawn({
      argv: [executable, ...built.argv.slice(1)],
      cwd: this.cwd,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } },
      graceMs: 3000,
    });
    const record = {
      id: this.id(),
      target: built.target,
      remotePort: built.remotePort,
      localPort: built.localPort,
      sshPort: built.sshPort,
      remoteBind: built.remoteBind,
      argv: [executable, ...built.argv.slice(1)],
      startedAt: this.now(),
      state: 'running',
      handle,
    };
    this.tunnels.set(record.id, record);
    handle.done
      .then(outcome => {
        record.state = 'exited';
        record.exit = outcome;
        const output = collectedText(handle, 'stderr');
        if (output) record.error = output.slice(0, 1200);
        this.logger?.warn?.('Live activity tunnel to %s exited: %s', record.target, JSON.stringify(outcome));
        this.tunnels.delete(record.id);
      })
      .catch(error => {
        record.state = 'failed';
        record.error = error.message;
        this.tunnels.delete(record.id);
      });
    // `ssh -N` stays silent while healthy; a failure such as a refused key or a
    // taken remote port exits inside this window because of ExitOnForwardFailure.
    await new Promise(resolve => setTimeout(resolve, this.startupWaitMs));
    if (record.state === 'running') {
      this.logger?.info?.('Live activity tunnel %s -> 127.0.0.1:%d is up', record.target, record.localPort);
    } else {
      throw new LiveActivityError('TUNNEL_FAILED', `ssh exited while opening the tunnel: ${record.error ?? 'no diagnostic'}`);
    }
    return this.view(record);
  }

  async stop(id) {
    const record = this.tunnels.get(id) ?? [...this.tunnels.values()].find(entry => entry.target === id);
    if (!record) return { id, stopped: false, reason: 'no such tunnel' };
    this.tunnels.delete(record.id);
    record.handle.terminate();
    await record.handle.waitForExit().catch(() => false);
    record.state = 'stopped';
    return { id: record.id, stopped: true, target: record.target };
  }

  /**
   * Synchronous best-effort used from a process `exit` hook, where nothing can
   * be awaited. A terminated child exits on its own; this only has to signal it.
   */
  killAllSync() {
    const records = [...this.tunnels.values()];
    this.tunnels.clear();
    for (const record of records) {
      try {
        record.handle.terminate();
      } catch (_) {
        // Already gone.
      }
    }
    return records.length;
  }

  async disposeAll() {
    const records = [...this.tunnels.values()];
    this.tunnels.clear();
    for (const record of records) {
      record.handle.terminate();
    }
    await Promise.all(records.map(record => record.handle.waitForExit().catch(() => false)));
    if (records.length && this.logger) this.logger.info('Live activity closed %d tunnel(s)', records.length);
  }
}