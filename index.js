import { z } from 'zod';
import { LiveActivityError, LiveActivityStore, validateRecord } from './model.js';
import { startEndpoint } from './endpoint.js';
import { TunnelRegistry } from './tunnel.js';

export const inject = ['storageDomain', 'tools', 'connection', 'systemPrompt', 'timer', 'configEditor', 'subprocess'];

const PACKAGE = '@local/dsh-live-activity';
const ROW_ID = 'dsh-live-activity';

const string = description => ({ type: 'string', ...(description ? { description } : {}) });
const nullable = schema => ({ oneOf: [schema, { type: 'null' }] });

export const toolSchema = {
  name: 'live_activity',
  description:
    'Floating progress cards for work that keeps reporting measurable progress: a determinate fraction or a tqdm-style count, or a numeric series sampled over time such as training loss, throughput or latency. Create is refused when neither exists, so a status-only task must be answered in the reply instead (use dsh_board for a durable checklist). Call create once, update as the numbers change, and end when the work finishes.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'update', 'end', 'dismiss', 'list', 'get', 'endpoint', 'settings', 'set-lan-access', 'set-allow-tunnel', 'tunnel'] },
      operation: { type: 'string', enum: ['start', 'stop', 'list'], description: 'tunnel only: start a reverse SSH tunnel, stop one, or list the active ones.' },
      tunnelId: string('tunnel stop only: the id a start returned.'),
      host: string('tunnel start only: the remote host to open the forward on.'),
      user: string('tunnel start only: the account on that host.'),
      sshPort: { type: 'integer', description: 'tunnel start only: the remote SSH port; defaults to 22.' },
      identityFile: string('tunnel start only: absolute path to the private key, such as ~/.ssh/id_ed25519.'),
      remotePort: { type: 'integer', description: 'tunnel start only: the port opened on the remote host; defaults to the local endpoint port.' },
      enabled: { type: 'boolean', description: 'set-lan-access and set-allow-tunnel only: the new value of the switch.' },
      id: string('Activity id returned by create; required for update, end, get and dismiss.'),
      title: string('Card title, set once on create and never changed afterwards (max 80).'),
      subtitle: string('Optional small line above the phase, such as the project or the target host (max 120).'),
      symbol: { type: 'string', enum: ['task', 'run', 'build', 'deploy', 'download', 'search', 'sync', 'alert'], description: 'Glyph shown on the card; defaults to task.' },
      accent: { type: 'string', enum: ['brand', 'success', 'warn', 'error', 'idle'], description: 'Tint of the glyph, progress bar and countdown; defaults to brand.' },
      phase: string('Short current state, for example "Building" or "Waiting for review" (max 60). Required on create.'),
      detail: nullable({ type: 'string', description: 'One or two clarifying sentences (max 400). Send null to clear it.' }),
      progress: nullable({ type: 'number', description: 'Fraction complete from 0 to 1. Prefer completed and total when the work has a known count. Send null to hide the bar and clear its counts.' }),
      completed: { type: 'integer', description: 'Items finished so far, for a tqdm-style bar such as step 120 of 500. Needs total to derive the fraction; a later update may send completed alone.' },
      total: { type: 'integer', description: 'Total item count for the bar, greater than zero. Send it with completed.' },
      metrics: nullable({
        type: 'array',
        maxItems: 3,
        description: 'One sample per named series per call; a known name appends to that series, so a training loop reports { name: "loss", value: 0.42 } each epoch and the card draws the curve. Keeps the latest 60 samples per series; at most 3 series. Send null to clear every series.',
        items: {
          type: 'object',
          properties: {
            name: string('Series name, for example "loss" (max 40).'),
            value: { type: 'number', description: 'Latest value of this series.' },
            unit: string('Optional unit shown after the latest value, such as "%" or "ms".'),
          },
          required: ['name', 'value'],
          additionalProperties: false,
        },
      }),
      etaEpochSeconds: nullable({ type: 'integer', description: 'Unix seconds when the work should finish. The card counts down locally, so no repeat updates are needed. Send null to hide it.' }),
      staleAfterSeconds: nullable({ type: 'integer', description: 'Seconds after the last update when the card starts marking itself as needing a refresh; 5 to 86400. Defaults to never.' }),
      relevance: { type: 'number', description: 'Ordering hint between -1000 and 1000; higher cards float above. Defaults to 0.' },
      dismissalPolicy: {
        description: 'How long the final state stays on screen after end. "default" keeps it 10 minutes, "immediate" removes it at once, and afterSeconds keeps it 1 to 14400 seconds.',
        oneOf: [
          { type: 'string', enum: ['default', 'immediate'] },
          { type: 'object', properties: { afterSeconds: { type: 'integer', minimum: 1, maximum: 14400 } }, required: ['afterSeconds'], additionalProperties: false },
        ],
      },
      status: { type: 'string', enum: ['all', 'active', 'ended'], description: 'list filter; defaults to all.' },
      limit: { type: 'integer', description: 'list page size from 1 to 50; defaults to 20.' },
    },
    required: ['action'],
    additionalProperties: false,
  },
};

const resultBlocks = value => [{ type: 'text', text: JSON.stringify(value) }];

export async function apply(ctx, config = {}) {
  const domain = await ctx.storageDomain.open({
    name: 'dsh_live_activity',
    version: 1,
    layout: 'per-record',
    invalidRecords: 'backup-and-skip',
    tables: { activities: { valueSchema: z.unknown().transform(validateRecord) } },
  });
  ctx.effect(() => () => domain.close());
  const store = new LiveActivityStore(domain.table('activities'));

  // A program can drive a card on its own through this endpoint; the token file
  // is the handoff, and the same progress gate applies to every call.
  let endpoint = await startEndpoint(store, { config, logger: ctx.logger });

  /** Persist a new row config; the Loader re-applies this row, rebinding the listener. */
  const settings = () => ({
    lanAccess: endpoint.host !== '127.0.0.1',
    host: endpoint.host,
    port: endpoint.port,
    url: endpoint.url,
    urls: endpoint.urls,
    tokenFile: endpoint.tokenFile,
    allowTunnel,
    tunnels: tunnels.list(),
  });

  const configValue = key => (config && typeof config === 'object' ? config[key] : undefined);
  const allowTunnel = configValue('allowTunnel') === true;

  const tunnels = new TunnelRegistry({
    spawn: spec => ctx.subprocess.spawn(spec),
    resolveExecutable: command => ctx.subprocess.resolveExecutable(command),
    cwd: process.env.HOME || process.env.DSH_HOME || '.',
    logger: ctx.logger,
  });
  // The row unloading (window closed, plugin disabled, config changed) and a
  // normal process exit both close the tunnels; a force-kill of DSH cannot run
  // anything, so document `pkill -f "ssh -N -R"` as the manual fallback.
  const onExit = () => tunnels.killAllSync();
  process.once('exit', onExit);
  ctx.effect(() => () => {
    process.removeListener('exit', onExit);
    return tunnels.disposeAll();
  });

  const setSwitch = async (key, enabled) => {
    const candidates = ctx.configEditor.entries();
    const entry = candidates.find(candidate => candidate.options?.id === ROW_ID || candidate.options?.name === PACKAGE);
    if (!entry) throw new LiveActivityError('FORBIDDEN', `Cannot find the ${ROW_ID} row in this profile, so the setting cannot be saved.`);
    await ctx.configEditor.edit(entry, current => ({ ...current, [key]: enabled === true }));
    return { saved: true, [key]: enabled === true };
  };

  const tunnel = async args => {
    const operation = args.operation ?? 'list';
    if (operation === 'list') return { allowed: allowTunnel, tunnels: tunnels.list(), endpointPort: endpoint.port };
    if (!allowTunnel) {
      throw new LiveActivityError('FORBIDDEN', 'Tunnels are disabled. Ask the user first, then enable the switch with action "set-allow-tunnel" and enabled: true.');
    }
    if (operation === 'stop') return tunnels.stop(args.tunnelId);
    if (operation !== 'start') throw new LiveActivityError('INVALID_INPUT', 'operation must be start, stop or list.');
    const remotePort = args.remotePort ?? endpoint.port;
    // One private loopback listener per tunnel: a forwarded call arrives from
    // loopback, so this is the only place that knows which machine it came from.
    const forwarder = await startEndpoint(store, {
      host: '127.0.0.1',
      port: 0,
      config: {},
      logger: ctx.logger,
      source: { type: 'tunnel', ip: args.host, via: `127.0.0.1:${remotePort}` },
    });
    let started;
    try {
      started = await tunnels.start({
        host: args.host,
        user: args.user,
        sshPort: args.sshPort,
        identityFile: args.identityFile,
        remotePort,
        localPort: forwarder.port,
        dispose: forwarder.dispose,
      });
    } catch (error) {
      await forwarder.dispose();
      throw error;
    }
    return {
      ...started,
      remoteUrl: `http://127.0.0.1:${started.remotePort}`,
      note: `On ${started.target}, POST to ${`http://127.0.0.1:${started.remotePort}`} with the bearer token from the token file. The tunnel closes when DSH closes.`,
    };
  };

  const setLanAccess = enabled => setSwitch('lanAccess', enabled);

  ctx.tools.register({
    ...toolSchema,
    output: { schema: {}, render: (_args, value) => resultBlocks(value) },
    isConcurrencySafe: args => ['get', 'list', 'endpoint', 'settings'].includes(args?.action),
    execute: async (args, exec) => {
      if (args?.action === 'settings') return settings();
      if (args?.action === 'set-lan-access' || args?.action === 'set-allow-tunnel') {
        if (typeof args.enabled !== 'boolean') throw new LiveActivityError('INVALID_INPUT', 'enabled must be a boolean.');
        return setSwitch(args.action === 'set-lan-access' ? 'lanAccess' : 'allowTunnel', args.enabled);
      }
      if (args?.action === 'tunnel') return tunnel(args);
      if (args?.action !== 'endpoint') return store.run(args, exec.agent?.id);
      return {
            url: endpoint.url,
            urls: endpoint.urls,
            host: endpoint.host,
            port: endpoint.port,
            tokenFile: endpoint.tokenFile,
        usage: 'POST JSON with the same operations this tool accepts, and send "Authorization: Bearer <token>" where <token> is the content of tokenFile. The listener binds loopback only; use action "set-lan-access" with enabled: true when a program on another machine must reach it.',
      };
    },
    presentCall: args => ({ card: 'generic', title: `Live activity · ${args.action}`, kind: ['get', 'list', 'endpoint', 'settings'].includes(args.action) ? 'read' : 'edit' }),
  });
  ctx.effect(() => endpoint.dispose);

  ctx.systemPrompt.section({
    name: 'dsh-live-activity',
    order: 826,
    text:
      'Live activity cards are for work that keeps reporting measurable progress, nothing else. Create one only when the task exposes a determinate fraction or a tqdm-style count of steps, or a numeric series over time such as training loss, throughput, latency or memory. Supply that in the very first call: progress, or completed plus total, or a metrics sample — create is refused without one. Never create a card for a status-only narration, an already finished step, a decision, a single tool call, or work you can simply describe in the reply; use dsh_board when a durable checklist is what the user needs. While the card exists, drive it from real numbers: update completed as items finish, or send one metrics sample per new point, so the bar or curve moves on its own. Do not update just to tick a timer or to restate the phase text; the countdown from etaEpochSeconds runs locally. An update that drops the progress and the series is refused, so call end when the work is done rather than leaving a stale card. At most 8 cards may be active at once. A machine on another network can reach the endpoint through a reverse SSH tunnel: action "tunnel" with operation start (host, user, sshPort, identityFile, remotePort) opens one port on that host and keeps it until DSH closes; it is refused unless the user has enabled the tunnel switch, so ask before turning that switch on with action "set-allow-tunnel". When the user\'s own script, a build job or a device should report progress without you relaying it, call this tool with action "endpoint": it returns a local HTTP API URL and the token file that authorises it, and the same operations and gate apply there.',
  });

  // The floating card navigates the same store the agent writes: the page only
  // reads, dismisses a card the user removed, and acknowledges nothing else.
  ctx.connection.fetch.register({
    path: '/api/dsh-live-activity',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async request => {
      try {
        if (Number(request.headers.get('content-length') ?? 0) > 65536) throw new LiveActivityError('TOO_LARGE', 'Request exceeds 64 KiB.');
        const raw = await request.text();
        if (raw.length > 65536) throw new LiveActivityError('TOO_LARGE', 'Request exceeds 64 KiB.');
        const input = JSON.parse(raw);
        if (!input || typeof input !== 'object' || !['list', 'get', 'dismiss', 'settings', 'set-lan-access', 'set-allow-tunnel'].includes(input.action)) {
          throw new LiveActivityError('FORBIDDEN', 'The card view can only list, get, dismiss or read and change its own settings.');
        }
        const value =
          input.action === 'settings'
            ? settings()
            : input.action === 'set-lan-access'
              ? await setSwitch('lanAccess', input.enabled === true)
              : input.action === 'set-allow-tunnel'
                ? await setSwitch('allowTunnel', input.enabled === true)
              : await store.run(input);
        return Response.json({ ok: true, value }, { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) {
        const code = error.code ?? 'INVALID_REQUEST';
        const status = code === 'NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : code === 'ENDED' ? 409 : 400;
        return Response.json({ ok: false, error: { code, message: error.message } }, { status, headers: { 'Cache-Control': 'no-store' } });
      }
    },
  });

  let sweeping = false;
  ctx.interval(async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      const result = await store.sweep();
      if (result.expired || result.dismissed) ctx.logger.info('Live activity sweep: %d expired, %d dismissed', result.expired, result.dismissed);
    } catch (error) {
      ctx.logger.warn('Live activity sweep failed: %s', error.message);
    } finally {
      sweeping = false;
    }
  }, 15000);
}
