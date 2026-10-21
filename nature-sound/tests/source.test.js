import test from 'node:test';
import assert from 'node:assert/strict';
import { Source } from '../src/source.js';

const make = () => new Source('kit', { ringSeconds: 1, staleAfterMs: 5000 });

test('a power message marks the source low-power and notifies', () => {
  const s = make();
  let notified = 0;
  s.onPowerChange = () => notified++;
  s.onControl('{"type":"power","low":true,"battery":0.12}');
  assert.equal(s.lowPower, true);
  assert.equal(s.battery, 0.12);
  assert.equal(notified, 1);
  s.onControl('{"type":"power","low":false}');
  assert.equal(s.lowPower, false);
});

test('malformed or unknown control messages are ignored', () => {
  const s = make();
  s.onControl('not json');
  s.onControl('{"type":"other","low":true}');
  s.onControl('null');
  assert.equal(s.lowPower, false);
});

import { execFileSync } from 'node:child_process';
import { WebSocket, WebSocketServer } from 'ws';
import { hasFfmpeg, until } from './util.js';
import { makePcm } from './helpers.js';

test('pcm is stored frame-aligned, marks the source online, and is reported in status', () => {
  const s = make();
  const pcm = makePcm(0.1, (t) => 0.1 * Math.sin(2 * Math.PI * 440 * t));
  s.connected = true;
  s.onPcm(pcm.subarray(0, 7)); // not a whole frame: carried over
  assert.equal(s.ring.written, 4);
  s.onPcm(pcm.subarray(7));
  assert.equal(s.ring.written, pcm.length);
  assert.equal(s.online, true);
  const status = s.status('kit');
  assert.equal(status.active, true);
  assert.equal(status.maintenance, false);
  assert.ok(status.bufferedSec > 0.09);
  assert.equal(status.score, null);
  s.onPcm(Buffer.alloc(2)); // less than a frame: nothing written
  assert.equal(s.ring.written, pcm.length);
});

test('a source goes offline when its data goes stale or it disconnects', () => {
  const s = make();
  s.connected = true;
  s.lastDataAt = Date.now() - 10_000;
  assert.equal(s.online, false);
  s.lastDataAt = Date.now();
  assert.equal(s.online, true);
  s.detach();
  assert.equal(s.online, false);
});

test('status includes analysis results once present', () => {
  const s = make();
  s.analysis = { score: 0.8, flags: ['wind'], metrics: { rmsDb: -30 } };
  s.analysisAt = Date.now();
  const status = s.status(null);
  assert.equal(status.score, 0.8);
  assert.deepEqual(status.flags, ['wind']);
  assert.ok(status.analyzedAt);
});

test('an encoded stream sent over websocket is decoded into the ring buffer', { skip: !hasFfmpeg }, async () => {
  const ogg = execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-ac', '2', '-c:a', 'libopus', '-f', 'ogg', 'pipe:1'],
    { maxBuffer: 1 << 24 },
  );
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => wss.once('listening', resolve));
  const source = make();
  wss.on('connection', (ws) => source.attach(ws));
  const client = new WebSocket(`ws://127.0.0.1:${wss.address().port}`);
  await new Promise((resolve) => client.once('open', resolve));
  client.send(ogg);
  await until(() => source.ring.written > 48000 * 4);
  assert.equal(source.online, true);

  // A control message on the same connection is not mistaken for audio.
  client.send(JSON.stringify({ type: 'power', low: true }));
  await until(() => source.lowPower);

  // Reconnecting replaces the old connection and clears the low-power flag.
  const second = new WebSocket(`ws://127.0.0.1:${wss.address().port}`);
  await new Promise((resolve) => second.once('open', resolve));
  await until(() => source.lowPower === false);

  client.terminate();
  second.close();
  source.detach();
  await new Promise((resolve) => wss.close(resolve));
});
