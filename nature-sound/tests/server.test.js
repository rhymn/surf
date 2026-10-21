import './env-token.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { makePcm, rng, sine } from './helpers.js';
import { until } from './util.js';

const { server, sources, tick, broadcaster } = await import('../src/server.js');

let base;
before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

const put = (path, body, token = 'secret') =>
  fetch(base + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const status = async () => (await fetch(`${base}/status`)).json();
const maintenance = (id, value) => put(`/admin/sources/${id}/maintenance`, { value });

// 10 s of plausible forest (good) and of low-frequency rumble (wind).
const noise = rng(21);
const forest = makePcm(10.5, (t) => 0.02 * noise() + 0.05 * Math.sin(2 * Math.PI * 3000 * t) * (0.5 + 0.5 * Math.sin(t * 0.9)));
let lp = 0;
const wind = makePcm(10.5, () => (lp += 0.01 * (noise() - lp)) * 4);

test('health and the site are served', async () => {
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { ok: true });
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>/);
});

test('the admin page is served', async () => {
  const page = await fetch(`${base}/admin.html`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Admin/);
});

test('status starts empty', async () => {
  const s = await status();
  assert.equal(s.active, null);
  assert.deepEqual(s.sources, []);
});

test('maintenance endpoint rejects bad requests', async () => {
  assert.equal((await put('/admin/sources/a/maintenance', { value: true }, null)).status, 401);
  assert.equal((await put('/admin/sources/a/maintenance', { value: true }, 'wrong')).status, 401);
  assert.equal((await put('/admin/sources/a%20b/maintenance', { value: true })).status, 400);
  assert.equal((await put('/admin/sources/a/maintenance', { on: true })).status, 400);
  assert.equal((await put('/admin/sources/a/maintenance', { value: 'yes' })).status, 400);
  assert.equal((await status()).sources.length, 0, 'rejected requests create nothing');
});

test('analysis picks the cleaner source, and maintenance routes away from it', async () => {
  assert.equal((await maintenance('forest', false)).status, 200);
  await maintenance('windy', false);
  for (const [id, pcm] of [['forest', forest], ['windy', wind]]) {
    const source = sources.get(id);
    source.connected = true;
    source.onPcm(pcm);
  }
  tick();

  let s = await status();
  assert.equal(s.active, 'forest');
  const byId = Object.fromEntries(s.sources.map((x) => [x.id, x]));
  assert.ok(byId.forest.score > byId.windy.score);
  assert.ok(byId.windy.flags.includes('wind'));

  const res = await maintenance('forest', true);
  assert.deepEqual(await res.json(), { id: 'forest', maintenance: true, active: 'windy' });
  assert.equal((await status()).active, 'windy');

  await maintenance('forest', false);
  assert.equal((await status()).sources.find((x) => x.id === 'forest').maintenance, false);
});

test('a maintenance flag can be set for a kit that has never connected', async () => {
  const res = await maintenance('offline-kit', true);
  assert.equal((await res.json()).maintenance, true);
  assert.equal((await status()).sources.find((x) => x.id === 'offline-kit').online, false);
});

test('kits connect over websocket and can report low power', async () => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ingest/kit-ws`);
  await new Promise((resolve, reject) => ws.once('open', resolve).once('error', reject));
  ws.send(JSON.stringify({ type: 'power', low: true, battery: 0.1 }));
  const kit = await until(async () => (await status()).sources.find((x) => x.id === 'kit-ws' && x.lowPower));
  assert.equal(kit.battery, 0.1);
  ws.close();
});

test('websocket paths other than /ingest/<id> are refused', async () => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/nope`);
  const code = await new Promise((resolve) => ws.once('unexpected-response', (_req, res) => resolve(res.statusCode)));
  assert.equal(code, 404);
});

test('listeners get an audio/mpeg stream and the broadcaster stops when they leave', async () => {
  const res = await new Promise((resolve) => http.get(`${base}/listen`, resolve));
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'audio/mpeg');
  assert.equal(broadcaster.listeners.size, 1);
  res.destroy();
  await until(() => broadcaster.listeners.size === 0);
  assert.equal(broadcaster.running, false);
});
