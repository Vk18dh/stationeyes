import { describe, it, expect } from 'vitest';
import { extractRailwayDetails, buildSpokenSummary } from './detailExtractor.js';

describe('extractRailwayDetails', () => {
  it('extracts platform and direction from a platform billboard', () => {
    const lines = [
      'INDIAN RAILWAYS',
      'PLATFORM NO 2',
      'WAY TO PLATFORM 2 →',
    ];
    const details = extractRailwayDetails(lines);
    expect(details.platform).toBe('2');
    expect(details.direction).toBe('Right (→)');
    expect(details.lines.length).toBe(3);

    const summary = buildSpokenSummary(details);
    expect(summary).toContain('Platform number is 2');
    expect(summary).toContain('Direction is Right (→)');
  });

  it('extracts train, platform, PNR and coach from a train ticket', () => {
    const lines = [
      'INDIAN RAILWAYS RESERVATION TICKET',
      'PNR: 421-589-3201',
      'TRAIN: 12627 KARNATAKA EXPRESS',
      'PLATFORM: 3',
      'COACH: B2 35',
    ];
    const details = extractRailwayDetails(lines);
    expect(details.platform).toBe('3');
    expect(details.trainNumber).toBe('12627');
    expect(details.pnr).toBe('4215893201');
    expect(details.coachSeat).toContain('Coach B2, Seat 35');

    const summary = buildSpokenSummary(details);
    expect(summary).toContain('Platform number is 3');
    expect(summary).toContain('Train number is 12627');
    expect(summary).toContain('Coach B2, Seat 35');
  });

  it('handles multiple photos with different details', () => {
    // Photo 1: Ticket (has PNR and train number)
    const photo1Lines = [
      { text: 'INDIAN RAILWAYS RESERVATION', photoName: 'Photo 1 (Ticket)' },
      { text: 'PNR: 9876543210', photoName: 'Photo 1 (Ticket)' },
      { text: 'TRAIN: 22691 RAJDHANI EXP', photoName: 'Photo 1 (Ticket)' },
    ];
    // Photo 2: Station Board (has Platform and Arrow Direction)
    const photo2Lines = [
      { text: 'STATION CONCOURSE', photoName: 'Photo 2 (Board)' },
      { text: 'PLATFORM 5', photoName: 'Photo 2 (Board)' },
      { text: '← WAY TO PLATFORM 5', photoName: 'Photo 2 (Board)' },
    ];

    const combinedLines = [...photo1Lines, ...photo2Lines];
    const details = extractRailwayDetails(combinedLines);

    expect(details.pnr).toBe('9876543210');
    expect(details.trainNumber).toBe('22691');
    expect(details.platform).toBe('5');
    expect(details.direction).toBe('Left (←)');
    expect(details.lines[1].photoName).toBe('Photo 1 (Ticket)');
    expect(details.lines[4].photoName).toBe('Photo 2 (Board)');

    const summary = buildSpokenSummary(details);
    expect(summary).toContain('Platform number is 5');
    expect(summary).toContain('Direction is Left (←)');
    expect(summary).toContain('Train number is 22691');
    expect(summary).toContain('P N R is 9 8 7 6 5 4 3 2 1 0');
  });

  it('handles signs with only platform number', () => {
    const lines = ['PF 1A'];
    const details = extractRailwayDetails(lines);
    expect(details.platform).toBe('1A');
  });
});
