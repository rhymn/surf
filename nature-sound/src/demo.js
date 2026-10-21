import { SAMPLE_RATE } from './config.js';

// Built-in dummy microphone cubes, so the admin page and routing can be tried without hardware.
// They synthesise audio in-process and feed it to ordinary sources, so analysis, scoring,
// maintenance mode and selection all behave as they do for a real kit.

const KINDS = {
  // hiss plus a slowly warbling tone, standing in for a calm forest with birdsong
  clean: (state, rand) => {
    state.phase += (2 * Math.PI * (3000 + 800 * Math.sin(state.t * 0.7))) / SAMPLE_RATE;
    return 0.02 * rand() + 0.05 * Math.sin(state.phase) * (0.5 + 0.5 * Math.sin(state.t * 0.9));
  },
  // low-frequency rumble, like wind on the microphone
  windy: (state, rand) => {
    state.lp += 0.01 * (rand() - state.lp);
    return state.lp * 4;
  },
};

export class DemoKit {
  constructor(kind, seed = 1) {
    if (!KINDS[kind]) throw new Error(`unknown demo kind: ${kind}`);
    this.kind = kind;
    this.seed = seed;
    this.state = { t: 0, phase: 0, lp: 0 };
  }

  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return (this.seed / 2 ** 32) * 2 - 1;
  }

  // The next `frames` stereo frames as s16le PCM.
  next(frames) {
    const out = Buffer.alloc(frames * 4);
    for (let i = 0; i < frames; i++) {
      this.state.t += 1 / SAMPLE_RATE;
      const v = Math.max(-1, Math.min(1, KINDS[this.kind](this.state, () => this.rand())));
      const s = Math.round(v * 32767);
      out.writeInt16LE(s, i * 4);
      out.writeInt16LE(s, i * 4 + 2);
    }
    return out;
  }
}

export const DEMO_CUBES = [
  { id: 'demo-1', kind: 'clean' },
  { id: 'demo-2', kind: 'windy' },
];

// Starts the demo cubes. Returns a function that stops them.
export function startDemoKits(getSource, { intervalMs = 100 } = {}) {
  const cubes = DEMO_CUBES.map(({ id, kind }, i) => {
    const source = getSource(id);
    source.demo = true;
    return { source, kit: new DemoKit(kind, i + 1) };
  });
  const t0 = process.hrtime.bigint();
  let produced = 0;
  const timer = setInterval(() => {
    // Produce what wall-clock time says is due, so timer jitter never drifts the stream.
    const due = Math.floor((Number(process.hrtime.bigint() - t0) / 1e9) * SAMPLE_RATE);
    const frames = due - produced;
    if (frames <= 0) return;
    produced = due;
    for (const { source, kit } of cubes) {
      source.connected = true;
      source.onPcm(kit.next(frames));
    }
  }, intervalMs);
  return () => {
    clearInterval(timer);
    for (const { source } of cubes) source.connected = false;
  };
}
