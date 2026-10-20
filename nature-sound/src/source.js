import { spawn } from 'node:child_process';
import { BYTES_PER_FRAME, CHANNELS, SAMPLE_RATE } from './config.js';
import { PcmRing } from './ring.js';

// One microphone kit. The kit pushes an encoded stream (Ogg/Opus, FLAC, WebM, WAV...) as binary
// WebSocket frames; ffmpeg decodes it to raw PCM which lands in a ring buffer. Text frames carry
// JSON control messages, e.g. {"type":"power","low":true,"battery":0.12}.
export class Source {
  constructor(id, { ringSeconds, staleAfterMs }) {
    this.id = id;
    this.ring = new PcmRing(ringSeconds, SAMPLE_RATE);
    this.staleAfterMs = staleAfterMs;
    this.lastDataAt = 0;
    this.connected = false;
    this.analysis = null;
    this.analysisAt = 0;
    this.ffmpeg = null;
    this.carry = Buffer.alloc(0);
    this.lowPower = false;
    this.battery = null;
    this.maintenance = false; // set centrally by an operator; survives kit reconnects
    this.onPowerChange = () => {};
  }

  get online() {
    return this.connected && Date.now() - this.lastDataAt < this.staleAfterMs;
  }

  attach(ws) {
    this.detach();
    this.connected = true;
    this.carry = Buffer.alloc(0);
    this.lowPower = false; // a rebooted kit reports its state again
    this.battery = null;

    const ff = spawn(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', String(CHANNELS), 'pipe:1'],
      { stdio: ['pipe', 'pipe', 'inherit'] },
    );
    this.ffmpeg = ff;
    ff.stdin.on('error', () => {});
    ff.on('error', (err) => console.error(`[${this.id}] ffmpeg failed to start:`, err.message));
    ff.stdout.on('data', (chunk) => this.onPcm(chunk));
    ff.on('close', () => {
      if (this.ffmpeg === ff) this.connected = false;
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) ff.stdin.writable && ff.stdin.write(data);
      else this.onControl(data.toString());
    });
    ws.on('close', () => {
      ff.stdin.end();
      if (this.ffmpeg === ff) console.log(`[${this.id}] kit disconnected`);
    });
    ws.on('error', () => ws.terminate());
    this.ws = ws;
  }

  detach() {
    if (this.ffmpeg) {
      const old = this.ffmpeg;
      this.ffmpeg = null;
      old.kill('SIGKILL');
    }
    this.ws?.terminate();
    this.ws = null;
    this.connected = false;
  }

  onControl(text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg?.type !== 'power') return;
    this.lowPower = Boolean(msg.low);
    this.battery = typeof msg.battery === 'number' ? msg.battery : null;
    console.log(`[${this.id}] power: low=${this.lowPower} battery=${this.battery ?? '?'}`);
    this.onPowerChange();
  }

  onPcm(chunk) {
    const data = this.carry.length ? Buffer.concat([this.carry, chunk]) : chunk;
    const usable = data.length - (data.length % BYTES_PER_FRAME);
    this.carry = data.subarray(usable);
    if (usable === 0) return;
    this.ring.write(data.subarray(0, usable));
    this.lastDataAt = Date.now();
  }

  status(activeId) {
    return {
      id: this.id,
      online: this.online,
      active: this.id === activeId,
      bufferedSec: Math.min(this.ring.written, this.ring.size) / BYTES_PER_FRAME / SAMPLE_RATE,
      maintenance: this.maintenance,
      lowPower: this.lowPower,
      battery: this.battery,
      score: this.analysis?.score ?? null,
      flags: this.analysis?.flags ?? [],
      metrics: this.analysis?.metrics ?? null,
      analyzedAt: this.analysisAt ? new Date(this.analysisAt).toISOString() : null,
    };
  }
}
