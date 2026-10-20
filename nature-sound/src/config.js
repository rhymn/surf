export const SAMPLE_RATE = 48000;
export const CHANNELS = 2;
export const BYTES_PER_FRAME = CHANNELS * 2; // s16le

export const config = {
  port: Number(process.env.PORT) || 3000,

  // How often every source's latest clip is analysed and the best one re-chosen.
  analyzeIntervalSec: 60,
  analysisWindowSec: 10,
  ringSeconds: 30,

  // Selection: switch only to a source that is clearly better, and not too often.
  minScore: 0.35,
  switchMargin: 0.1,
  minDwellMs: 120_000,
  maxAnalysisAgeMs: 300_000,
  staleAfterMs: 5000,

  // Output stream
  latencyMs: 3000,
  crossfadeMs: 2000,
  mp3Bitrate: '192k',
};
