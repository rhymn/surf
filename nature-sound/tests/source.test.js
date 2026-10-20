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
