// Picks which source to broadcast. Pure function of the sources' state and the clock, so it is
// easy to test. A source in maintenance mode is never chosen, not even as a last resort. A source reporting low power is never preferred and is replaced at once (no dwell
// time); it is only kept as a last resort when nothing else is usable. Hysteresis (minimum dwell + score margin) avoids flapping between similar sources.
export class Selector {
  constructor({ minScore, switchMargin, minDwellMs, maxAnalysisAgeMs }) {
    Object.assign(this, { minScore, switchMargin, minDwellMs, maxAnalysisAgeMs });
    this.currentId = null;
    this.since = 0;
  }

  eligible(source, now) {
    return (
      source.online &&
      !source.maintenance &&
      !source.lowPower &&
      source.analysis &&
      now - source.analysisAt <= this.maxAnalysisAgeMs &&
      source.analysis.score >= this.minScore
    );
  }

  choose(sources, now = Date.now()) {
    const candidates = sources.filter((s) => this.eligible(s, now));
    const current = sources.find((s) => s.id === this.currentId);
    const best = candidates.reduce((a, b) => (!a || b.analysis.score > a.analysis.score ? b : a), null);

    if (!best) {
      // Nothing good enough: keep playing the current source if it is at least alive.
      if (current?.online && !current.maintenance) return current;
      this.set(null, now);
      return null;
    }
    if (!current || !this.eligible(current, now)) return this.set(best, now);
    if (best.id === current.id) return current;

    const dwelled = now - this.since >= this.minDwellMs;
    const clearlyBetter = best.analysis.score - current.analysis.score >= this.switchMargin;
    return dwelled && clearlyBetter ? this.set(best, now) : current;
  }

  set(source, now) {
    this.currentId = source?.id ?? null;
    this.since = now;
    return source;
  }
}
