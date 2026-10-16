import { describe, it, expect } from 'vitest';
import {
  parseStationBoard,
  extractAllPlatformsFromText,
  extractDistance,
  buildBoardSpeech,
} from './stationBoardParser.js';
import { Direction } from './model.js';

describe('stationBoardParser', () => {
  it('extracts facilities, board title, and target platform path', () => {
    const lines = [
      'FOOT OVER BRIDGE',
      'WAY TO PLATFORMS 1 TO 4',
      'PLATFORM 3 →',
      'WAITING HALL',
    ];

    const result = parseStationBoard(lines, '3');
    expect(result.facilities).toContain('Foot Over Bridge (FOB)');
    expect(result.facilities).toContain('Waiting Room / Hall');
    expect(result.allPlatforms).toEqual(expect.arrayContaining(['1', '2', '3', '4']));
    expect(result.targetFound).toBe(true);
    expect(result.targetDirection).toBe(Direction.RIGHT);
    expect(result.pathInstruction).toContain('Turn to Your Right');

    const speech = buildBoardSpeech(result);
    expect(speech).toContain('Foot Over Bridge');
    expect(speech).toContain('Platform 3 is on this board');
    expect(speech).toContain('Turn to your right');
  });

  it('detects when the board is for different platforms (wrong board)', () => {
    const lines = [
      'SUBWAY TO PLATFORM 1 & 2 ←',
      'CANTEEN & REFRESHMENT',
    ];

    const result = parseStationBoard(lines, '3');
    expect(result.facilities).toContain('Subway / Underpass');
    expect(result.facilities).toContain('Canteen / Food Plaza');
    expect(result.allPlatforms).toEqual(expect.arrayContaining(['1', '2']));
    expect(result.targetFound).toBe(false);

    const speech = buildBoardSpeech(result);
    expect(speech).toContain('This board is for Platform 1 and 2');
    expect(speech).toContain('Your Platform 3 is not on this sign');
  });

  it('handles platform ranges like PF 1-5 and glued PF-3', () => {
    expect(extractAllPlatformsFromText('PLATFORMS 1-5')).toEqual(
      expect.arrayContaining(['1', '2', '3', '4', '5'])
    );
    expect(extractAllPlatformsFromText('WAY TO PF-3 ↑')).toEqual(
      expect.arrayContaining(['3'])
    );
  });

  it('extracts lift and escalator board information', () => {
    const lines = ['LIFT & ESCALATOR TO PLATFORM 2', 'CLOAK ROOM'];
    const result = parseStationBoard(lines, '2');
    expect(result.facilities).toContain('Escalator / Lift');
    expect(result.facilities).toContain('Cloak Room / Luggage');
    expect(result.targetFound).toBe(true);
  });

  it('extracts distance in metres accurately from sign text', () => {
    expect(extractDistance('WAY TO PLATFORM 3 (100 M) →')?.formatted).toBe('100 metres');
    expect(extractDistance('PLATFORM 2 - 50 MTRS')?.formatted).toBe('50 metres');
    expect(extractDistance('PF 4: 200 METERS ↑')?.formatted).toBe('200 metres');
    expect(extractDistance('FOOT OVER BRIDGE 25 MTR')?.formatted).toBe('25 metres');
    expect(extractDistance('SUBWAY (50M)')?.formatted).toBe('50 metres');
    expect(extractDistance('DISTANCE: 75 M')?.formatted).toBe('75 metres');
    expect(extractDistance('STATION EXIT 1.5 KM')?.formatted).toBe('1500 metres');
  });

  it('associates distance with target platform board and speaks distance', () => {
    const lines = [
      'WAY TO PLATFORM 3 (100 M) →',
      'FOOT OVER BRIDGE',
      'WAITING ROOM',
    ];

    const result = parseStationBoard(lines, '3');
    expect(result.targetFound).toBe(true);
    expect(result.distance).toBe('100 metres');
    expect(result.distanceMeters).toBe(100);
    expect(result.targetDirection).toBe(Direction.RIGHT);

    const speech = buildBoardSpeech(result);
    expect(speech).toContain('Platform 3 is on this board');
    expect(speech).toContain('Turn to your right');
    expect(speech).toContain('100 metres away');
  });

  it('picks target platform line distance when multiple platforms have distances', () => {
    const lines = [
      'PLATFORM 1 & 2 (30 M) ←',
      'PLATFORM 3 & 4 (150 M) →',
    ];

    const result = parseStationBoard(lines, '3');
    expect(result.targetFound).toBe(true);
    expect(result.distance).toBe('150 metres');
    expect(result.distanceMeters).toBe(150);
    expect(result.targetDirection).toBe(Direction.RIGHT);
  });
});

