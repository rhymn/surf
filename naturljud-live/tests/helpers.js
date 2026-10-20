import { SAMPLE_RATE } from '../src/config.js';

// Deterministic PRNG so tests don't flake.
export function rng(seed = 1) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}

export function makePcm(seconds, fn) {
  const n = Math.floor(seconds * SAMPLE_RATE);
  const buf = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, fn(i / SAMPLE_RATE, i)));
    const s = Math.round(v * 32767);
    buf.writeInt16LE(s, i * 4);
    buf.writeInt16LE(s, i * 4 + 2);
  }
  return buf;
}

export const sine = (f, a) => (t) => a * Math.sin(2 * Math.PI * f * t);
