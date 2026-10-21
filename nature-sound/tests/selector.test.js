import test from 'node:test';
import assert from 'node:assert/strict';
import { Selector } from '../src/selector.js';

const opts = { minScore: 0.35, switchMargin: 0.1, minDwellMs: 1000, maxAnalysisAgeMs: 10000 };
const src = (id, score, { online = true, at = 0, lowPower = false, maintenance = false, demo = false } = {}) => ({ id, online, lowPower, maintenance, demo, analysis: score == null ? null : { score }, analysisAt: at });

test('picks the best eligible source', () => {
  const s = new Selector(opts);
  assert.equal(s.choose([src('a', 0.6), src('b', 0.9), src('c', 0.2)], 0).id, 'b');
});

test('does not switch inside the dwell time or without a clear margin', () => {
  const s = new Selector(opts);
  s.choose([src('a', 0.8), src('b', 0.5)], 0);
  assert.equal(s.choose([src('a', 0.6), src('b', 0.95)], 500).id, 'a', 'too soon');
  assert.equal(s.choose([src('a', 0.85), src('b', 0.9)], 2000).id, 'a', 'margin too small');
  assert.equal(s.choose([src('a', 0.6), src('b', 0.9)], 2000).id, 'b');
});

test('switches immediately when the current source goes bad or offline', () => {
  const s = new Selector(opts);
  s.choose([src('a', 0.8), src('b', 0.5)], 0);
  assert.equal(s.choose([src('a', 0.1), src('b', 0.5)], 10).id, 'b', 'score collapsed');
  assert.equal(s.choose([src('a', 0.9, { online: false }), src('b', 0.5)], 20).id, 'b', 'offline');
});

test('ignores stale analyses and unanalysed sources', () => {
  const s = new Selector(opts);
  assert.equal(s.choose([src('a', 0.9, { at: 0 }), src('b', null)], 60000), null);
});

test('keeps playing a live current source when nothing is good enough', () => {
  const s = new Selector(opts);
  s.choose([src('a', 0.8)], 0);
  assert.equal(s.choose([src('a', 0.1)], 10).id, 'a');
  assert.equal(s.choose([src('a', 0.1, { online: false })], 20), null);
});

test('a low-power source is never chosen over a healthy one', () => {
  const s = new Selector(opts);
  assert.equal(s.choose([src('a', 1, { lowPower: true }), src('b', 0.5)], 0).id, 'b');
});

test('the current source is replaced immediately when it reports low power', () => {
  const s = new Selector(opts);
  s.choose([src('a', 0.9), src('b', 0.5)], 0);
  assert.equal(s.choose([src('a', 0.9, { lowPower: true }), src('b', 0.5)], 10).id, 'b', 'no dwell wait');
});

test('a low-power source is only a last resort', () => {
  const s = new Selector(opts);
  s.choose([src('a', 0.9)], 0);
  assert.equal(s.choose([src('a', 0.9, { lowPower: true })], 10).id, 'a');
});

test('a source in maintenance is never chosen, even if it scores best', () => {
  const s = new Selector(opts);
  assert.equal(s.choose([src('a', 1, { maintenance: true }), src('b', 0.5)], 0).id, 'b');
});

test('the current source is replaced at once when put into maintenance', () => {
  const s = new Selector(opts);
  s.choose([src('a', 0.9), src('b', 0.5)], 0);
  assert.equal(s.choose([src('a', 0.9, { maintenance: true }), src('b', 0.5)], 10).id, 'b', 'no dwell wait');
});

test('a source in maintenance is not kept as a last resort', () => {
  const s = new Selector(opts);
  s.choose([src('a', 0.9)], 0);
  assert.equal(s.choose([src('a', 0.9, { maintenance: true })], 10), null);
});

test('a demo source is never chosen unless demoOnAir is set', () => {
  const off = new Selector(opts);
  assert.equal(off.choose([src('d', 1, { demo: true }), src('r', 0.5)], 0).id, 'r');
  const lonely = new Selector(opts);
  assert.equal(lonely.choose([src('d', 1, { demo: true })], 0), null);
  const on = new Selector({ ...opts, demoOnAir: true });
  assert.equal(on.choose([src('d', 1, { demo: true }), src('r', 0.5)], 0).id, 'd');
});

test('a demo source already on air is dropped when demoOnAir is off', () => {
  const s = new Selector({ ...opts, demoOnAir: true });
  s.choose([src('d', 0.9, { demo: true })], 0);
  s.demoOnAir = false;
  assert.equal(s.choose([src('d', 0.9, { demo: true })], 10), null);
});
