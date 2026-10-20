import { createServer } from 'node:http';
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
    const id = match[1];
    let source = sources.get(id);
    if (!source) {
      source = new Source(id, config);
      sources.set(id, source);
    }
    console.log(`[${id}] kit connected`);
    source.attach(ws);
  });
});

// Analyse each online source when it is new or its last analysis is a full interval old, then re-choose.
setInterval(() => {
  for (const source of sources.values()) {
    if (source.online && Date.now() - source.analysisAt >= config.analyzeIntervalSec * 1000) analyzeSource(source);
  }
  reselect();
}, 2000);

server.listen(config.port, () => console.log(`naturljud-live listening on :${config.port}`));
