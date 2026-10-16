import { describe, it, expect } from 'vitest';
import { LiveGuideTracker } from './liveGuideTracker.js';
import { TargetResult } from './targetRecognitionEngine.js';
import { Position, Direction } from './model.js';

describe('LiveGuideTracker', () => {
  const hit = (pos) =>
    new TargetResult({
      isRelevant: true,
      matchedText: 'PLATFORM 2',
      platforms: ['2'],
      confidence: 0.9,
      position: pos,
      direction: Direction.UNKNOWN,
      arrow: null,
      box: null,
    });

  it('confirms then guides then stays quiet then reports loss', () => {
    const t = new LiveGuideTracker('2');
    let now = 0;

    // Needs 3 sightings before speaking
    expect(t.onFrame(hit(Position.RIGHT), now).speech).toBeNull();
    now += 250;
    expect(t.onFrame(hit(Position.RIGHT), now).speech).toBeNull();
    now += 250;
    expect(t.onFrame(hit(Position.RIGHT), now).speech).toBe('Platform 2 detected. It is to your right.');

    // Nothing changes: silence
    for (let i = 0; i < 6; i++) {
      now += 250;
      expect(t.onFrame(hit(Position.RIGHT), now).speech).toBeNull();
    }

    // One centre frame is not enough; two of the last three is
    now += 250;
    expect(t.onFrame(hit(Position.CENTER), now).speech).toBeNull();
    now += 250;
    expect(t.onFrame(hit(Position.CENTER), now).speech).toBe('Platform 2 is straight ahead.');
    const lastSeen = now;

    // Short dropouts are silent; a long one is reported once
    let lostAt = -1;
    while (lostAt < 0) {
      now += 250;
      const s = t.onFrame(null, now).speech;
      if (s !== null) {
        expect(s).toBe('I lost Platform 2. Slowly move the camera.');
        lostAt = now;
      }
    }
    expect(lostAt).toBe(lastSeen + 3000);

    for (let i = 0; i < 10; i++) {
      now += 250;
      expect(t.onFrame(null, now).speech).toBeNull();
    }
  });

  it('ignores irrelevant and low confidence frames', () => {
    const t = new LiveGuideTracker('2');
    const other = new TargetResult({
      isRelevant: false,
      matchedText: 'PLATFORM 4',
      platforms: ['4'],
      confidence: 0.9,
      position: Position.CENTER,
      direction: Direction.UNKNOWN,
      arrow: null,
      box: null,
    });
    const weak = new TargetResult({
      isRelevant: true,
      matchedText: 'PLATFORM 2',
      platforms: ['2'],
      confidence: 0.2,
      position: Position.CENTER,
      direction: Direction.UNKNOWN,
      arrow: null,
      box: null,
    });

    for (let i = 0; i < 10; i++) {
      expect(t.onFrame(i % 2 === 0 ? other : weak, i * 250).speech).toBeNull();
    }
  });
});
