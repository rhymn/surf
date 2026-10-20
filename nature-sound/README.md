# Nature Sound

Live nature-sound streaming. Microphone kits in forests push audio to this server; every
minute the server analyses the last 10 s of each source for unwanted
sound (wind, clipping, mains hum, bumps, voice-like modulation, dead mic) and broadcasts the
cleanest one, crossfading on switches.

![Data flow](docs/data-flow.svg)

Solid arrows carry audio; the dashed arrow carries the decision of which source to play.

- `GET /` – public site with the live player
- `GET /listen` – the live MP3 stream
- `GET /status` (per-source scores and flags as JSON), `GET /health`
- `WS /ingest/<id>` – kits connect here. Binary frames carry the encoded stream (Ogg/Opus or FLAC recommended). Text frames are JSON control messages: `{"type":"power","low":true,"battery":0.12}` tells the server the kit is low on power, so it stops being chosen and the broadcast moves to another source straight away; send `"low":false` when it has recovered.

## Config

All tunables are constants in `src/config.js` (only `PORT` comes from the environment).

## Run locally

Needs Node 20+ and `ffmpeg` (with libopus and libmp3lame) on the PATH.

```
npm install
npm start
npm run simulate -- --id forest-1 --kind good
npm run simulate -- --id forest-2 --kind wind
```

Then open http://localhost:3000. `npm test` runs the unit tests (no ffmpeg needed).

## Notes

- There is no authentication: anyone who can reach the server can push audio to `/ingest/<id>` or listen. Put it behind something before real use.
- Render only exposes HTTP(S)/WebSocket, so kits must use WebSocket ingest, not RTSP/RTMP.
- Runs on a paid always-on plan; free services sleep and would drop the streams.
- The analysis is heuristic DSP. Thresholds live in `src/analysis.js` and need tuning against real recordings.
