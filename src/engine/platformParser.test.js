import { describe, it, expect } from 'vitest';
import { PlatformParser } from './platformParser.js';

describe('PlatformParser', () => {
  const ids = (text) => PlatformParser.parse(text).flatMap((it) => it.platforms);

  it('reads common railway board variants', () => {
    const variants = [
      'PLATFORM 2',
      'Platform No. 2',
      'PLAT 2',
      'PF 2',
      'PF NO 2',
      'PLATFORM-2',
      'P.F. No. 2',
      'PF2',
      'Platform 02',
      'platform no:2',
    ];
    for (const v of variants) {
      expect(ids(v)).toEqual(['2']);
    }
  });

  it('reads lettered platforms', () => {
    expect(ids('Platform 1A')).toEqual(['1A']);
  });

  it('reads lists and ranges', () => {
    expect(ids('Platforms 2, 3 & 4')).toEqual(['2', '3', '4']);
    expect(ids('Platforms 1 to 4')).toEqual(['1', '2', '3', '4']);
  });

  it('does not treat walking times as platforms', () => {
    expect(ids('PF 2 5 MIN')).toEqual(['2']);
  });

  it('ignores text without a platform', () => {
    const nonPlatforms = ['EXIT', 'TRAIN 12627', 'WAY OUT TO PLATFORM', 'PLATFORM IS CLOSED'];
    for (const np of nonPlatforms) {
      expect(ids(np)).toEqual([]);
    }
  });

  it('corrects one lookalike but penalises it', () => {
    const list = PlatformParser.parse('PLATFORM Z');
    expect(list.length).toBe(1);
    const m = list[0];
    expect(m.platforms).toEqual(['2']);
    expect(m.penalty).toBeGreaterThan(0);
  });

  it('tolerates one typo in keyword', () => {
    const list = PlatformParser.parse('PLATF0RM 2');
    expect(list.length).toBe(1);
    const m = list[0];
    expect(m.platforms).toEqual(['2']);
    expect(m.penalty).toBeGreaterThan(0);
  });

  it('reads two signs on one line', () => {
    expect(ids('PF 1 PF 2')).toEqual(['1', '2']);
  });
});
