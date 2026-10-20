import { spawn } from 'node:child_process';
import { BYTES_PER_FRAME, CHANNELS, SAMPLE_RATE } from './config.js';

const TICK_MS = 20;
const SAMPLES_PER_TICK = (SAMPLE_RATE * TICK_MS) / 1000;
const TICK_BYTES = SAMPLES_PER_TICK * BYTES_PER_FRAME;

// Follows one source's ring at a fixed latency behind live, so network jitter doesn't glitch the output.
class Cursor {
  constructor(source, latencyBytes) {
    this.source = source;
    this.latency = latencyBytes;
    this.pos = Math.max(0, source.ring.written - latencyBytes);
  }

  next() {
    const ring = this.source.ring;
    const lag = ring.written - this.pos;
    // Fell too far behind (or the data got overwritten): jump back to the nominal latency.
    if (lag > this.latency * 2 || lag > ring.size - TICK_BYTES * 2) {
      this.pos = Math.max(0, ring.written - this.latency);
    }
    const chunk = ring.read(this.pos, TICK_BYTES);
    if (chunk) this.pos += TICK_BYTES;
    return chunk;
  }
}

// Mixes the currently selected source into one continuous MP3 stream, crossfading on switches,
// and fans it out to HTTP listeners. Only runs (and only burns CPU) while someone is listening.
export class Broadcaster {
  constructor({ latencyMs, crossfadeMs, mp3Bitrate }) {
    this.latencyBytes = Math.floor((latencyMs / 1000) * SAMPLE_RATE) * BYTES_PER_FRAME;
    this.fadeTicks = Math.max(1, Math.round(crossfadeMs / TICK_MS));
    this.bitrate = mp3Bitrate;
    this.listeners = new Set();
    this.target = null; // source we want to play
    this.cursor = null;
    this.fading = null; // { from: Cursor, tick }
    this.encoder = null;
    this.timer = null;
    this.running = false;
  }

  get activeId() {
    return this.target?.id ?? null;
  }

  setTarget(source) {
    if (source === this.target) return;
    this.target = source;
    if (!this.running) return; // applied when the loop starts
    this.applyTarget();
  }

  applyTarget() {
    const wanted = this.target;
    if (wanted?.id === this.cursor?.source.id) return;
    if (this.cursor && wanted) this.fading = { from: this.cursor, tick: 0 };
    else this.fading = null;
    this.cursor = wanted ? new Cursor(wanted, this.latencyBytes) : null;
  }

  addListener(res) {
    this.listeners.add(res);
    res.on('close', () => this.removeListener(res));
    if (this.listeners.size === 1) this.start();
  }

  removeListener(res) {
    this.listeners.delete(res);
    if (this.listeners.size === 0) this.stop();
  }

  start() {
    const enc = spawn(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', String(CHANNELS), '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', this.bitrate, '-f', 'mp3', 'pipe:1'],
      { stdio: ['pipe', 'pipe', 'inherit'] },
    );
    this.encoder = enc;
    enc.stdin.on('error', () => {});
    enc.on('error', (err) => console.error('encoder failed to start:', err.message));
    enc.stdout.on('data', (chunk) => {
      for (const res of this.listeners) res.write(chunk);
    });

    this.cursor = null;
    this.fading = null;
    this.running = true;
    this.applyTarget();
    this.t0 = process.hrtime.bigint();
    this.emitted = 0;
    this.timer = setInterval(() => this.pump(), TICK_MS / 2);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    this.cursor = null;
    this.fading = null;
    this.encoder?.stdin.end();
    this.encoder?.kill();
    this.encoder = null;
  }

  // Emit as many ticks as wall-clock time says are due, so setInterval jitter never drifts the stream.
  pump() {
    const elapsedMs = Number(process.hrtime.bigint() - this.t0) / 1e6;
    while (this.emitted * TICK_MS <= elapsedMs - TICK_MS) {
      this.encoder?.stdin.write(this.mixTick());
      this.emitted++;
    }
  }

  mixTick() {
    const main = this.cursor?.next();
    let out = main ?? Buffer.alloc(TICK_BYTES);
    if (this.fading) {
      const old = this.fading.from.next();
      const t = (this.fading.tick + 1) / this.fadeTicks;
      if (old) out = crossfade(old, out, t);
      if (++this.fading.tick >= this.fadeTicks) this.fading = null;
    }
    return out;
  }
}

export function crossfade(from, to, t) {
  const out = Buffer.allocUnsafe(to.length);
  for (let i = 0; i + 1 < to.length; i += 2) {
    const v = from.readInt16LE(i) * (1 - t) + to.readInt16LE(i) * t;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), i);
  }
  return out;
}
