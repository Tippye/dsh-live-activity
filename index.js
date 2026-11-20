import { z } from 'zod';
import { LiveActivityError, LiveActivityStore, validateRecord } from './model.js';

export const inject = ['storageDomain', 'tools', 'connection', 'systemPrompt', 'timer'];

const string = description => ({ type: 'string', ...(description ? { description } : {}) });
const nullable = schema => ({ oneOf: [schema, { type: 'null' }] });

export const toolSchema = {
  name: 'live_activity',
  description:
    'Create, update and end live activity cards: small status windows that float over the DSH app while a long task runs, and keep showing phase, progress and an expected-finish countdown after the reply ends. Call create once, update on every real phase change, and end when the work finishes.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'update', 'end', 'dismiss', 'list', 'get'] },
      id: string('Activity id returned by create; required for update, end, get and dismiss.'),
      title: string('Card title, set once on create and never changed afterwards (max 80).'),
      subtitle: string('Optional small line above the phase, such as the project or the target host (max 120).'),
      symbol: { type: 'string', enum: ['task', 'run', 'build', 'deploy', 'download', 'search', 'sync', 'alert'], description: 'Glyph shown on the card; defaults to task.' },
      accent: { type: 'string', enum: ['brand', 'success', 'warn', 'error', 'idle'], description: 'Tint of the glyph, progress bar and countdown; defaults to brand.' },
      phase: string('Short current state, for example "Building" or "Waiting for review" (max 60). Required on create.'),
      detail: nullable({ type: 'string', description: 'One or two clarifying sentences (max 400). Send null to clear it.' }),
      progress: nullable({ type: 'number', description: 'Fraction complete from 0 to 1. Send null to hide the bar.' }),
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

export async function apply(ctx) {
  const domain = await ctx.storageDomain.open({
    name: 'dsh_live_activity',
    version: 1,
    layout: 'per-record',
    invalidRecords: 'backup-and-skip',
    tables: { activities: { valueSchema: z.unknown().transform(validateRecord) } },
  });
  ctx.effect(() => () => domain.close());
  const store = new LiveActivityStore(domain.table('activities'));

  ctx.tools.register({
    ...toolSchema,
    output: { schema: {}, render: (_args, value) => resultBlocks(value) },
    isConcurrencySafe: args => args?.action === 'get' || args?.action === 'list',
    execute: (args, exec) => store.run(args, exec.agent?.id),
    presentCall: args => ({ card: 'generic', title: `Live activity · ${args.action}`, kind: ['get', 'list'].includes(args.action) ? 'read' : 'edit' }),
  });

  ctx.systemPrompt.section({
    name: 'dsh-live-activity',
    order: 826,
    text: 'Live activity cards: use the live_activity tool to show long-running work as floating status cards in the DSH window. Create one when a task will outlive the current reply (builds, deploys, test runs, multi-step jobs), update it at each real phase change with a short phase plus optional progress or etaEpochSeconds, and end it when the work finishes. The card counts down from etaEpochSeconds by itself, so do not update it just to tick a timer, and do not narrate progress the card already shows. Do not create a card for work that finishes in one tool call. Cards outlive the reply and are visible until the task ends; end a card you stop maintaining instead of leaving it to expire, and reuse the id from create in every later update or end. At most 8 cards can be active at once.',
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
        if (!input || typeof input !== 'object' || !['list', 'get', 'dismiss'].includes(input.action)) {
          throw new LiveActivityError('FORBIDDEN', 'The card view can only list, get or dismiss activities.');
        }
        const value = await store.run(input);
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
