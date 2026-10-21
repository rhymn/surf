import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoKit, DEMO_CUBES, startDemoKits } from '../src/demo.js';
import { Source } from '../src/source.js';
import { analyze } from '../src/analysis.js';
import { until } from './util.js';

test('demo kits produce whole stereo frames', () => {
  const chunk = new DemoKit('clean').next(480);
  assert.equal(chunk.length, 480 * 4);
  assert.equal(chunk.readInt16LE(0), chunk.readInt16LE(2), 'both channels carry the same signal');
});

test('the clean demo scores well and the windy demo is flagged as wind', () => {
  const clean = analyze(new DemoKit('clean', 1).next(48000 * 10));
  const windy = analyze(new DemoKit('windy', 2).next(48000 * 10));
  assert.ok(clean.score > 0.85, `clean ${clean.score}`);
  assert.ok(windy.flags.includes('wind'), JSON.stringify(windy.metrics));
  assert.ok(clean.score > windy.score);
});

test('an unknown demo kind is rejected', () => {
  assert.throws(() => new DemoKit('nope'), /unknown demo kind/);
});

test('startDemoKits creates online, flagged sources and stops cleanly', async () => {
  const sources = new Map();
  const getSource = (id) => {
    if (!sources.has(id)) sources.set(id, new Source(id, { ringSeconds: 5, staleAfterMs: 5000 }));
    return sources.get(id);
  };
  const stop = startDemoKits(getSource, { intervalMs: 10 });
  await until(() => DEMO_CUBES.every(({ id }) => sources.get(id)?.ring.written > 4800 * 4));
  for (const { id } of DEMO_CUBES) {
    assert.equal(sources.get(id).demo, true);
    assert.equal(sources.get(id).online, true);
  }
  stop();
  for (const { id } of DEMO_CUBES) assert.equal(sources.get(id).online, false);
});
