#!/usr/bin/env node
/**
 * Drive a live activity card from any script without hand-rolling HTTP.
 *
 *   node bin/live-activity.mjs '{"action":"update","id":"...","completed":120}'
 *   echo '{"action":"create",...}' | node bin/live-activity.mjs
 *
 * Configuration comes from the environment, so a script on another machine only
 * needs the URL and the token:
 *   LIVE_ACTIVITY_URL   http://127.0.0.1:41363   (the /endpoint action prints it)
 *   LIVE_ACTIVITY_TOKEN the content of the token file
 *
 * The token defaults to the profile's token file, which makes the local case a
 * single command with no setup.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_PORT = 41363;

async function token() {
  if (process.env.LIVE_ACTIVITY_TOKEN) return process.env.LIVE_ACTIVITY_TOKEN.trim();
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  const file = join(home, 'plugin-data', 'dsh-live-activity', 'token');
  try {
    return (await readFile(file, 'utf8')).trim();
  } catch (error) {
    throw new Error(`No token: set LIVE_ACTIVITY_TOKEN or read ${file} (${error.code}).`);
  }
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    console.log('usage: live-activity.mjs \'{"action":"update","id":"<id>","completed":3}\'');
    console.log('       echo \'{"action":"list"}\' | live-activity.mjs');
    process.exit(args.length ? 0 : 2);
  }
  const payload = args.join(' ').trim() || (await readStdin()).trim();
  if (!payload) throw new Error('Nothing to send: pass JSON as an argument or on stdin.');

  let input;
  try {
    input = JSON.parse(payload);
  } catch (error) {
    throw new Error(`Payload is not JSON: ${error.message}`);
  }

  const base = (process.env.LIVE_ACTIVITY_URL || `http://127.0.0.1:${DEFAULT_PORT}`).replace(/\/+$/, '');
  const response = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify(input),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  if (!response.ok || !data.ok) {
    console.error(`HTTP ${response.status} ${data.error?.code ?? ''} ${data.error?.message ?? ''}`.trim());
    process.exit(1);
  }
  console.log(JSON.stringify(data.value));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});