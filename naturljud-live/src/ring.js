import { BYTES_PER_FRAME } from './config.js';

// Fixed-size PCM ring addressed by absolute byte position, so readers can hold a cursor
// that stays valid while the writer keeps going. `written` is always frame-aligned.
export class PcmRing {
  constructor(seconds, sampleRate) {
    this.size = Math.floor(seconds * sampleRate) * BYTES_PER_FRAME;
    this.buf = Buffer.alloc(this.size);
    this.written = 0;
  }

  write(chunk) {
    let data = chunk;
    if (data.length > this.size) {
      this.written += data.length - this.size;
      data = data.subarray(data.length - this.size);
    }
    const pos = this.written % this.size;
    const first = Math.min(data.length, this.size - pos);
    data.copy(this.buf, pos, 0, first);
    if (first < data.length) data.copy(this.buf, 0, first);
    this.written += data.length;
  }

  // Returns a copy of [start, start+len), or null if that range is no longer (or not yet) available.
  read(start, len) {
    if (start < 0 || start < this.written - this.size || start + len > this.written) return null;
    const out = Buffer.allocUnsafe(len);
    const pos = start % this.size;
    const first = Math.min(len, this.size - pos);
    this.buf.copy(out, 0, pos, pos + first);
    if (first < len) this.buf.copy(out, first, 0, len - first);
    return out;
  }

  // The newest `len` bytes, or null if fewer than `len` have been written.
  tail(len) {
    return this.read(this.written - len, len);
  }
}
