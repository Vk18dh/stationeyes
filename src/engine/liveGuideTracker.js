import { Position, Cue } from './model.js';
import { PlatformParser } from './platformParser.js';
import { Phrases } from './phrases.js';

export const TrackerState = Object.freeze({
  SEARCHING: 'SEARCHING',
  TRACKING: 'TRACKING',
  LOST: 'LOST',
});

export class Display {
  constructor(state, position, arrow) {
    this.state = state;
    this.position = position;
    this.arrow = arrow;
  }
}

export class Update {
  constructor(display, speech, cue) {
    this.display = display;
    this.speech = speech;
    this.cue = cue;
  }
}

export class LiveGuideTracker {
  constructor(
    target,
    windowSize = 5,
    hitsToConfirm = 3,
    lossAnnounceMs = 3000,
    minGapMs = 1800,
    minConfidence = 0.5
  ) {
    this.platform = PlatformParser.normalizeId(target);
    this.window = windowSize;
    this.hitsToConfirm = hitsToConfirm;
    this.lossAnnounceMs = lossAnnounceMs;
    this.minGapMs = minGapMs;
    this.minConfidence = minConfidence;

    this.recent = [];
    this.state = TrackerState.SEARCHING;
    this.spokenPosition = Position.UNKNOWN;
    this.lastSeenAt = 0;
    this.lastSpokeAt = -1e9;
  }

  onFrame(result, nowMs) {
    const hit =
      result && result.isRelevant && result.confidence >= this.minConfidence ? result : null;

    this.recent.push(hit);
    while (this.recent.length > this.window) {
      this.recent.shift();
    }
    if (hit) {
      this.lastSeenAt = nowMs;
    }

    let speech = null;
    let cue = null;

    switch (this.state) {
      case TrackerState.SEARCHING:
      case TrackerState.LOST: {
        const hitCount = this.recent.filter(Boolean).length;
        if (hitCount >= this.hitsToConfirm) {
          const pos = this.stablePosition() || Position.UNKNOWN;
          speech =
            this.state === TrackerState.LOST
              ? Phrases.foundAgain(this.platform, pos)
              : Phrases.detected(this.platform, pos);
          cue = Cue.FOUND;
          this.state = TrackerState.TRACKING;
          this.spokenPosition = pos;
          this.lastSpokeAt = nowMs;
        }
        break;
      }

      case TrackerState.TRACKING: {
        if (!hit) {
          if (nowMs - this.lastSeenAt >= this.lossAnnounceMs) {
            this.state = TrackerState.LOST;
            this.recent = [];
            this.spokenPosition = Position.UNKNOWN;
            speech = Phrases.lost(this.platform);
            cue = Cue.LOST;
            this.lastSpokeAt = nowMs;
          }
        } else {
          const pos = this.stablePosition();
          if (
            pos &&
            pos !== Position.UNKNOWN &&
            pos !== this.spokenPosition &&
            nowMs - this.lastSpokeAt >= this.minGapMs
          ) {
            speech = Phrases.position(this.platform, pos, this.stableArrow());
            cue = pos === Position.CENTER ? Cue.CENTERED : null;
            this.spokenPosition = pos;
            this.lastSpokeAt = nowMs;
          }
        }
        break;
      }
    }

    const shownArrow = this.state === TrackerState.TRACKING ? this.stableArrow() : null;
    return new Update(
      new Display(this.state, this.spokenPosition, shownArrow),
      speech,
      cue
    );
  }

  stablePosition() {
    const hits = this.recent.filter(Boolean).slice(-3);
    if (hits.length === 0) return null;
    const needed = Math.min(2, hits.length);

    const counts = {};
    for (const h of hits) {
      counts[h.position] = (counts[h.position] || 0) + 1;
    }

    let bestPos = null;
    let bestCount = -1;
    for (const [pos, count] of Object.entries(counts)) {
      if (count >= needed && count > bestCount) {
        bestCount = count;
        bestPos = pos;
      }
    }
    return bestPos;
  }

  stableArrow() {
    const arrows = this.recent.filter(Boolean).map((h) => h.arrow).filter(Boolean);
    const counts = {};
    for (const a of arrows) {
      counts[a] = (counts[a] || 0) + 1;
    }

    for (const [a, count] of Object.entries(counts)) {
      if (count >= 2) return a;
    }
    return null;
  }
}
