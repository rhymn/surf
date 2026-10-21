import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Broadcaster } from '../src/broadcaster.js';
import { PcmRing } from '../src/ring.js';
import { SAMPLE_RATE } from '../src/config.js';

const TICK_BYTES = (SAMPLE_RATE * 20) / 1000 * 4;
const opts = { latencyMs: 100, crossfadeMs: 60, mp3Bitrate: '64k' };

// A fake source whose ring is filled with a constant sample value, so output is easy to assert on.
function fakeSource(id, value, seconds = 2) {
  const ring = new PcmRing(5, SAMPLE_RATE);
  const buf = Buffer.alloc(seconds * SAMPLE_RATE * 4);
  for (let i = 0; i < buf.length; i += 2) buf.writeInt16LE(value, i);
  ring.write(buf);
  return { id, ring };
}
const level = (chunk) => chunk.readInt16LE(0);

test('with no target the broadcaster outputs silence', () => {
  const b = new Broadcaster(opts);
  b.running = true;
  assert.equal(b.activeId, null);
  assert.equal(level(b.mixTick()), 0);
});

test('the selected source is played, and a switch crossfades to the new one', () => {
  const b = new Broadcaster(opts);
  b.running = true;
  const a = fakeSource('a', 1000);
  const c = fakeSource('c', 3000);

  b.setTarget(a);
  assert.equal(b.activeId, 'a');
  assert.equal(level(b.mixTick()), 1000);

  b.setTarget(c);
  assert.equal(b.activeId, 'c');
  const fade = [];
  for (let i = 0; i < 3; i++) fade.push(level(b.mixTick()));
  assert.ok(fade[0] > 1000 && fade[0] < 3000, `mid-fade ${fade[0]}`);
  assert.ok(fade[0] < fade[1] && fade[1] < fade[2] + 1);
  assert.equal(fade[2], 3000, 'fade complete after crossfadeMs');
  assert.equal(b.fading, null);
  assert.equal(level(b.mixTick()), 3000);

  b.setTarget(c); // same target again is a no-op
  assert.equal(b.fading, null);
  b.setTarget(null);
  assert.equal(b.activeId, null);
  assert.equal(level(b.mixTick()), 0);
});

test('a target set before the loop starts is applied when it starts', () => {
  const b = new Broadcaster(opts);
  const a = fakeSource('a', 500);
  b.setTarget(a);
  assert.equal(b.cursor, null);
  b.running = true;
  b.applyTarget();
  assert.equal(b.activeId, 'a');
});

test('the cursor resyncs when it falls too far behind live, and plays silence when it runs dry', () => {
  const b = new Broadcaster(opts);
  b.running = true;
  const src = fakeSource('a', 700, 3);
  b.setTarget(src);
  b.cursor.pos = 0; // 3 s behind live, far more than the latency allows
  assert.equal(level(b.mixTick()), 700);
  assert.ok(src.ring.written - b.cursor.pos < SAMPLE_RATE * 4 * 0.5, 'jumped back near live');

  b.cursor.pos = src.ring.written; // nothing left to read
  assert.equal(level(b.mixTick()), 0);
});

test('pump emits the ticks that wall-clock time says are due', () => {
  const b = new Broadcaster(opts);
  b.running = true;
  b.setTarget(fakeSource('a', 100));
  const written = [];
  b.encoder = { stdin: { write: (chunk) => written.push(chunk) } };
  b.t0 = process.hrtime.bigint() - 1_000_000_000n; // pretend 1 s has passed
  b.emitted = 0;
  b.pump();
  assert.ok(written.length >= 48 && written.length <= 50, `emitted ${written.length}`);
  assert.equal(written[0].length, TICK_BYTES);
});

test('listeners start and stop the output loop and receive encoded data', async () => {
  const b = new Broadcaster(opts);
  const res = Object.assign(new EventEmitter(), { chunks: [], write(chunk) { this.chunks.push(chunk); } });
  b.addListener(res);
  assert.equal(b.running, true);
  assert.equal(b.listeners.size, 1);

  b.encoder?.stdout.emit('data', Buffer.from('mp3'));
  assert.equal(res.chunks.length, 1);

  res.emit('close');
  assert.equal(b.listeners.size, 0);
  assert.equal(b.running, false);
  assert.equal(b.encoder, null);
});
