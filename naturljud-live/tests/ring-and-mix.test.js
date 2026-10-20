import test from 'node:test';
import assert from 'node:assert/strict';
import { PcmRing } from '../src/ring.js';
import { crossfade } from '../src/broadcaster.js';

test('ring wraps and only serves data still held', () => {
  const ring = new PcmRing(1, 8); // 8 frames = 32 bytes
  ring.write(Buffer.from(Array.from({ length: 24 }, (_, i) => i)));
  ring.write(Buffer.from(Array.from({ length: 16 }, (_, i) => 100 + i)));
  assert.equal(ring.written, 40);
  assert.equal(ring.read(0, 8), null, 'overwritten');
  assert.deepEqual([...ring.read(24, 16)], Array.from({ length: 16 }, (_, i) => 100 + i));
  assert.equal(ring.read(30, 16), null, 'not written yet');
  assert.equal(ring.tail(8).length, 8);
});

test('crossfade blends from one signal to the other', () => {
  const a = Buffer.alloc(4);
  const b = Buffer.alloc(4);
  a.writeInt16LE(1000, 0);
  b.writeInt16LE(3000, 0);
  assert.equal(crossfade(a, b, 0).readInt16LE(0), 1000);
  assert.equal(crossfade(a, b, 0.5).readInt16LE(0), 2000);
  assert.equal(crossfade(a, b, 1).readInt16LE(0), 3000);
});
