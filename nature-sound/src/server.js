import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { BYTES_PER_FRAME, SAMPLE_RATE, config } from './config.js';
import { Source } from './source.js';
import { Selector } from './selector.js';
import { Broadcaster } from './broadcaster.js';
import { analyze } from './analysis.js';

const sources = new Map();
const selector = new Selector(config);
const broadcaster = new Broadcaster(config);

function getSource(id) {
  let source = sources.get(id);
  if (!source) {
    source = new Source(id, config);
    source.onPowerChange = reselect; // switch away from a low-power kit immediately
    sources.set(id, source);
  }
  return source;
}

function authorized(req) {
  const header = req.headers.authorization ?? '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(config.token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function analyzeSource(source) {
  const bytes = Math.floor(config.analysisWindowSec * SAMPLE_RATE) * BYTES_PER_FRAME;
  const pcm = source.ring.tail(bytes);
  if (!pcm) return; // not enough audio buffered yet
  source.analysis = analyze(pcm);
  source.analysisAt = Date.now();
  console.log(`[${source.id}] score=${source.analysis.score.toFixed(2)} flags=${source.analysis.flags.join(',') || '-'}`);
}

function reselect() {
  broadcaster.setTarget(selector.choose([...sources.values()]));
}

const app = express();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
app.use(express.static(publicDir));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/status', (_req, res) => {
  res.json({
    active: broadcaster.activeId,
    listeners: broadcaster.listeners.size,
    sources: [...sources.values()].map((s) => s.status(broadcaster.activeId)),
  });
});

// Operator API: put a kit into (or out of) maintenance mode. A kit in maintenance is never chosen,
// so listeners are faded over to another source straight away.
app.put('/admin/sources/:id/maintenance', express.json(), (req, res) => {
  if (!config.token) return res.status(503).json({ error: 'TOKEN is not set on the server' });
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid source id' });
  if (typeof req.body?.value !== 'boolean') return res.status(400).json({ error: 'Body must be {"value": true|false}' });
  const source = getSource(req.params.id);
  source.maintenance = req.body.value;
  console.log(`[${source.id}] maintenance=${source.maintenance}`);
  reselect();
  res.json({ id: source.id, maintenance: source.maintenance, active: broadcaster.activeId });
});

app.get('/listen', (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
  reselect();
  broadcaster.addListener(res);
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });

server.on('upgrade', (req, socket, head) => {
  const match = new URL(req.url, 'http://x').pathname.match(/^\/ingest\/([A-Za-z0-9_-]{1,40})$/);
  if (!match) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const source = getSource(match[1]);
    console.log(`[${source.id}] kit connected`);
    source.attach(ws);
  });
});

// Analyse each online source when it is new or its last analysis is a full interval old, then re-choose.
function tick() {
  for (const source of sources.values()) {
    if (source.online && Date.now() - source.analysisAt >= config.analyzeIntervalSec * 1000) analyzeSource(source);
  }
  reselect();
}

export { server, sources, broadcaster, tick };

// Only start listening and ticking when run directly, so tests can import the app.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  setInterval(tick, 2000);
  server.listen(config.port, () => console.log(`nature-sound listening on :${config.port}`));
}
