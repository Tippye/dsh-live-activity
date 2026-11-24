import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTunnelArgv, TunnelRegistry, expandHome } from '../tunnel.js';

test('the tunnel argv cannot be turned into shell syntax', async () => {
  const built = await buildTunnelArgv({ host: 'example.com', user: 'me', sshPort: 63286, remotePort: 41410, localPort: 41363 });
  assert.equal(built.argv[0], 'ssh');
  assert.equal(built.argv[1], '-N');
  assert.ok(built.argv.includes('ExitOnForwardFailure=yes'), 'a failed forward must exit instead of hanging');
  assert.equal(built.argv[built.argv.indexOf('-R') + 1], '127.0.0.1:41410:127.0.0.1:41363', 'the remote bind address is explicit');
  assert.equal(built.remoteBind, '127.0.0.1:41410');
  assert.equal(built.argv.at(-1), 'me@example.com');
  assert.equal(built.target, 'me@example.com:63286');

  await assert.rejects(() => buildTunnelArgv({ host: 'a b', user: 'me', remotePort: 1, localPort: 2 }), /host must be/);
  await assert.rejects(() => buildTunnelArgv({ host: 'h', user: 'me; rm -rf /', remotePort: 1, localPort: 2 }), /user must be/);
  await assert.rejects(() => buildTunnelArgv({ host: 'h', user: 'me', remotePort: 0, localPort: 2 }), /remotePort must be/);
  await assert.rejects(() => buildTunnelArgv({ host: 'h', user: 'me', remotePort: 1, localPort: 2, identityFile: 'relative/key' }), /identityFile must be/);
  await assert.rejects(() => buildTunnelArgv({ host: 'h', user: 'me', remotePort: 1, localPort: 2, identityFile: '/no/such/key' }), /cannot be read/);
});

test('a home-relative key path becomes absolute', () => {
  assert.ok(expandHome('~/.ssh/PathX').startsWith('/'));
  assert.ok(expandHome('~/.ssh/PathX').endsWith('/.ssh/PathX'));
  assert.equal(expandHome(undefined), undefined);
});

function fakeSpawn(script) {
  const calls = [];
  const spawn = spec => {
    const state = { spec, terminated: false };
    state.done = script(state);
    state.terminate = () => {
      state.terminated = true;
    };
    state.waitForExit = async () => true;
    state.collected = { stderr: { readFrom: () => ({ text: state.stderr ?? '', nextOffset: 0, lossy: false }) } };
    calls.push(state);
    return state;
  };
  return { spawn, calls };
}

test('a healthy tunnel is tracked and torn down', async () => {
  const { spawn, calls } = fakeSpawn(() => new Promise(() => {}));
  const registry = new TunnelRegistry({ spawn, resolveExecutable: async () => '/usr/bin/ssh', cwd: '/tmp', startupWaitMs: 0, id: () => 't1' });
  const started = await registry.start({ host: 'example.com', user: 'me', remotePort: 41410, localPort: 41363 });
  assert.equal(started.id, 't1');
  assert.equal(started.state, 'running');
  assert.equal(started.remotePort, 41410);
  assert.equal(calls[0].spec.argv[0], '/usr/bin/ssh');
  assert.equal(registry.list().length, 1);

  const stopped = await registry.stop('t1');
  assert.equal(stopped.stopped, true);
  assert.equal(calls[0].terminated, true, 'stopping terminates the ssh process');
  assert.equal(registry.list().length, 0);
});

test('a tunnel that dies at startup reports the diagnostic', async () => {
  const { spawn } = fakeSpawn(state => {
    state.stderr = 'Permission denied (publickey).';
    return Promise.resolve({ exitCode: 255, signal: null });
  });
  const registry = new TunnelRegistry({ spawn, resolveExecutable: async () => '/usr/bin/ssh', cwd: '/tmp', startupWaitMs: 30 });
  await assert.rejects(
    () => registry.start({ host: 'example.com', user: 'me', remotePort: 41410, localPort: 41363 }),
    /Permission denied/,
  );
  assert.equal(registry.list().length, 0, 'a failed tunnel is not left in the registry');
});

test('disposal closes every tunnel', async () => {
  const { spawn, calls } = fakeSpawn(() => new Promise(() => {}));
  const registry = new TunnelRegistry({ spawn, resolveExecutable: async () => '/usr/bin/ssh', cwd: '/tmp', startupWaitMs: 0 });
  await registry.start({ host: 'a.example', user: 'me', remotePort: 1, localPort: 2 });
  await registry.start({ host: 'b.example', user: 'me', remotePort: 1, localPort: 2 });
  assert.equal(registry.list().length, 2);
  await registry.disposeAll();
  assert.equal(registry.list().length, 0);
  assert.ok(calls.every(call => call.terminated), 'every ssh process is terminated');
});