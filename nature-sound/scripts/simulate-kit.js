// Pretends to be a microphone kit: generates audio with ffmpeg and pushes it to the server.
//   node scripts/simulate-kit.js --id forest-1 [--url ws://localhost:3000] [--kind good|wind|hum] [--low-after seconds]
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const { id = 'forest-1', url = 'ws://localhost:3000', kind = 'good', 'low-after': lowAfter } = args;

const sources = {
  // pink "forest" background plus a 4.5 kHz warble standing in for birdsong
  good: ['-f', 'lavfi', '-i', 'anoisesrc=c=pink:a=0.05', '-f', 'lavfi', '-i', 'sine=f=4500,tremolo=f=5:d=0.9,volume=0.15', '-filter_complex', 'amix=inputs=2'],
  // heavy low-frequency rumble, like wind on the capsule
  wind: ['-f', 'lavfi', '-i', 'anoisesrc=c=brown:a=0.6', '-af', 'lowpass=f=80'],
  // mains hum on top of quiet noise
  hum: ['-f', 'lavfi', '-i', 'anoisesrc=c=pink:a=0.01', '-f', 'lavfi', '-i', 'sine=f=50,volume=0.4', '-filter_complex', 'amix=inputs=2'],
};
if (!sources[kind]) throw new Error(`--kind must be one of ${Object.keys(sources).join(', ')}`);

const ws = new WebSocket(`${url}/ingest/${id}`);
ws.on('open', () => {
  console.log(`${id} (${kind}) connected, streaming...`);
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-re', ...sources[kind], '-ar', '48000', '-ac', '2', '-c:a', 'libopus', '-b:a', '128k', '-f', 'ogg', 'pipe:1'], { stdio: ['ignore', 'pipe', 'inherit'] });
  ff.stdout.on('data', (chunk) => ws.send(chunk));
  // Pretend the battery ran low: text frames are control messages, binary frames are audio.
  if (lowAfter) setTimeout(() => ws.send(JSON.stringify({ type: 'power', low: true, battery: 0.1 })), lowAfter * 1000);
  ws.on('close', () => ff.kill());
});
ws.on('unexpected-response', (_req, res) => {
  console.error(`rejected: HTTP ${res.statusCode}`);
  process.exit(1);
});
ws.on('close', () => process.exit(0));
