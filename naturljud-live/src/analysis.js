import { SAMPLE_RATE } from './config.js';

// Heuristic "is this take usable?" analysis of a PCM window (s16le, interleaved stereo).
// Everything is plain DSP so it has no model dependency. detectors are intentionally
// separate so an ML classifier (e.g. YAMNet) can be added as another penalty later.

const FRAME = 4096;
const HOP = 2048;

export function toMono(pcm) {
  const frames = Math.floor(pcm.length / 4);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    out[i] = (pcm.readInt16LE(i * 4) + pcm.readInt16LE(i * 4 + 2)) / 65536;
  }
  return out;
}

// In-place iterative radix-2 FFT.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const HANN = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
const binHz = SAMPLE_RATE / FRAME;
const bin = (hz) => Math.round(hz / binHz);

function bandEnergy(power, lo, hi) {
  let sum = 0;
  for (let k = bin(lo); k <= Math.min(bin(hi), power.length - 1); k++) sum += power[k];
  return sum;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
// 0 at `from`, 1 at `to`
const ramp = (x, from, to) => clamp01((x - from) / (to - from));

// Modulation depth of an envelope in the syllable range (2-8 Hz) relative to its total variance.
function syllableModulation(envelope, envRate) {
  const n = envelope.length;
  if (n < 16) return 0;
  const mean = envelope.reduce((a, b) => a + b, 0) / n;
  const x = envelope.map((v) => v - mean);
  const variance = x.reduce((a, b) => a + b * b, 0) / n;
  if (variance < 1e-12) return 0;
  let best = 0;
  for (let f = 2; f <= 8; f += 0.5) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const phase = (2 * Math.PI * f * i) / envRate;
      re += x[i] * Math.cos(phase);
      im += x[i] * Math.sin(phase);
    }
    best = Math.max(best, (2 * (re * re + im * im)) / (n * n) / variance);
  }
  return clamp01(best);
}

export function analyze(pcm) {
  const mono = toMono(pcm);
  const n = mono.length;
  if (n < FRAME * 2) return { score: 0, flags: ['too_short'], metrics: {} };

  // Level / clipping / DC
  let sumSq = 0;
  let sum = 0;
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    const s = mono[i];
    sumSq += s * s;
    sum += s;
    if (Math.abs(s) >= 0.985) clipped++;
  }
  const rms = Math.sqrt(sumSq / n);
  const rmsDb = 20 * Math.log10(rms + 1e-9);
  const clipRatio = clipped / n;

  // Spectrum per frame
  const avgPower = new Float64Array(FRAME / 2);
  const speechEnv = [];
  const frameEnergy = [];
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  let frames = 0;
  for (let start = 0; start + FRAME <= n; start += HOP) {
    for (let i = 0; i < FRAME; i++) {
      re[i] = mono[start + i] * HANN[i];
      im[i] = 0;
    }
    fft(re, im);
    const power = new Float64Array(FRAME / 2);
    for (let k = 0; k < FRAME / 2; k++) {
      power[k] = re[k] * re[k] + im[k] * im[k];
      avgPower[k] += power[k];
    }
    speechEnv.push(Math.log10(bandEnergy(power, 300, 3400) + 1e-12));
    let total = 0;
    for (let k = 1; k < power.length; k++) total += power[k];
    frameEnergy.push(total);
    frames++;
  }

  const total = bandEnergy(avgPower, 20, SAMPLE_RATE / 2 - 1) + 1e-12;
  const lowShare = bandEnergy(avgPower, 20, 150) / total;

  // Mains hum: narrow peaks at 50/60 Hz (+ harmonics) far above their neighbourhood.
  let humRatio = 0;
  for (const f0 of [50, 60]) {
    for (const mult of [1, 2, 3]) {
      const f = f0 * mult;
      const peak = Math.max(avgPower[bin(f) - 1], avgPower[bin(f)], avgPower[bin(f) + 1]);
      let neighbours = 0;
      let count = 0;
      for (const off of [-7, -6, -5, -4, 4, 5, 6, 7]) {
        const idx = bin(f) + off;
        if (idx < 1 || idx >= avgPower.length) continue;
        neighbours += avgPower[idx];
        count++;
      }
      humRatio = Math.max(humRatio, peak / (neighbours / count + 1e-12));
    }
  }

  // Impulsiveness: loudest frame vs typical frame (bumps, handling, door slams, rain drops on the case).
  const sortedEnergy = [...frameEnergy].sort((a, b) => a - b);
  const medianEnergy = sortedEnergy[Math.floor(sortedEnergy.length / 2)] + 1e-12;
  const impulse = 10 * Math.log10(sortedEnergy[sortedEnergy.length - 1] / medianEnergy);

  const envRate = SAMPLE_RATE / HOP;
  const voiceLike = syllableModulation(speechEnv, envRate);

  const penalties = {
    clipping: 0.8 * ramp(clipRatio, 0.0005, 0.01),
    wind: 0.6 * ramp(lowShare, 0.5, 0.9),
    hum: 0.4 * ramp(Math.log10(humRatio + 1), 1.0, 2.0),
    impulse: 0.4 * ramp(impulse, 12, 30),
    voice: 0.5 * ramp(voiceLike, 0.35, 0.7),
  };
  const flags = Object.entries(penalties)
    .filter(([, p]) => p > 0.1)
    .map(([name]) => name);

  let score = 1 - Object.values(penalties).reduce((a, b) => a + b, 0);
  // A dead or unplugged mic is the worst possible take, whatever else it looks like.
  if (rmsDb < -75) {
    flags.push('silent');
    score = 0;
  }

  return {
    score: clamp01(score),
    flags,
    penalties,
    metrics: { rmsDb, clipRatio, lowShare, humRatio, impulseDb: impulse, voiceLike },
  };
}
