import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analysis.js';
import { makePcm, rng, sine } from './helpers.js';

const noise = rng(7);
// Crude "forest": broadband hiss with a slow-varying chirp, nothing speech-like.
const forest = (t) => 0.02 * noise() + 0.05 * Math.sin(2 * Math.PI * (3000 + 800 * Math.sin(t * 0.7)) * t) * (0.5 + 0.5 * Math.sin(t * 0.9));

test('clean ambience scores high with no flags', () => {
  const r = analyze(makePcm(10, forest));
  assert.ok(r.score > 0.85, `score ${r.score}`);
  assert.deepEqual(r.flags, []);
});

test('clipping is penalised', () => {
  const r = analyze(makePcm(10, (t) => 3 * Math.sin(2 * Math.PI * 800 * t)));
  assert.ok(r.flags.includes('clipping'));
  assert.ok(r.score < 0.4, `score ${r.score}`);
});

test('low frequency rumble (wind) is flagged', () => {
  const n = rng(3);
  let lp = 0;
  const r = analyze(makePcm(10, () => (lp += 0.01 * (n() - lp)) * 4));
  assert.ok(r.flags.includes('wind'), JSON.stringify(r.metrics));
});

test('mains hum is flagged', () => {
  const n = rng(5);
  const r = analyze(makePcm(10, (t) => 0.01 * n() + sine(50, 0.2)(t) + sine(100, 0.1)(t)));
  assert.ok(r.flags.includes('hum'), JSON.stringify(r.metrics));
});

test('loud bumps are flagged as impulsive', () => {
  const n = rng(9);
  const r = analyze(makePcm(10, (t) => (t > 4 && t < 4.08 ? 0.9 * n() : 0.01 * n())));
  assert.ok(r.flags.includes('impulse'), JSON.stringify(r.metrics));
});

test('syllable-rate modulated speech-band energy is flagged as voice-like', () => {
  const n = rng(11);
  const r = analyze(makePcm(10, (t) => (0.3 * n() + sine(1200, 0.3)(t)) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t))));
  assert.ok(r.flags.includes('voice'), JSON.stringify(r.metrics));
});

test('a dead mic scores zero', () => {
  const r = analyze(makePcm(10, () => 0));
  assert.equal(r.score, 0);
  assert.ok(r.flags.includes('silent'));
});
