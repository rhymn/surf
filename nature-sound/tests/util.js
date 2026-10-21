import { spawnSync } from 'node:child_process';

export const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

// Poll until fn() is truthy (or throw after `ms`), so tests wait on real state, not fixed sleeps.
export async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 25));
  }
}
