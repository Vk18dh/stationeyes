import { describe, it, expect } from 'vitest';
import { TargetRecognitionEngine } from './targetRecognitionEngine.js';
import { Box, OcrLine, OcrPage, Position, Direction } from './model.js';
import { SnapInterpreter, SnapOutcomeType } from './snapInterpreter.js';

describe('TargetRecognitionEngine', () => {
  const engine = new TargetRecognitionEngine();

  const line = (text, l, t, r, b, block = 0, conf = 0.95) =>
    new OcrLine(text, new Box(l, t, r, b), conf, block);

  const page = (...lines) => new OcrPage(lines, 1000, 1500);

  it('finds only the target and its position', () => {
    const a = engine.analyze(
      page(
        line('PLATFORM 1', 20, 100, 250, 160, 0),
        line('EXIT', 420, 100, 580, 160, 1),
        line('PLATFORM 2', 720, 100, 980, 160, 2)
      ),
      '2'
    );
    const t = a.target;
    expect(t).toBeDefined();
    expect(t.position).toBe(Position.RIGHT);
    expect(t.direction).toBe(Direction.RIGHT);
    expect(a.others.flatMap((it) => it.platforms)).toEqual(['1']);
  });

  it('arrow on sign beats position in frame', () => {
    const t = engine.analyze(page(line('PLATFORM 2 ←', 700, 100, 980, 160)), '2').target;
    expect(t.position).toBe(Position.RIGHT);
    expect(t.direction).toBe(Direction.LEFT);
  });

  it('arrow as separate element on same row', () => {
    const t = engine.analyze(
      page(line('PF 2', 400, 100, 560, 160, 0), line('→', 600, 105, 660, 155, 1)),
      '2'
    ).target;
    expect(t.direction).toBe(Direction.RIGHT);
  });

  it('joins stacked keyword and number', () => {
    const t = engine.analyze(
      page(line('PLATFORM', 400, 100, 600, 150, 0), line('2', 450, 160, 550, 320, 1)),
      '2'
    ).target;
    expect(t.position).toBe(Position.CENTER);
    expect(t.direction).toBe(Direction.STRAIGHT);
  });

  it('missing box means no invented direction', () => {
    const t = engine.analyze(new OcrPage([new OcrLine('PLATFORM 2', null, 0.9, 0)], 1000, 1500), '2').target;
    expect(t.direction).toBe(Direction.UNKNOWN);
  });

  it('snap outcomes', () => {
    const snap = (...l) => SnapInterpreter.interpret(engine.analyze(page(...l), '2'));

    expect(snap(line('PLATFORM 2', 400, 100, 600, 160)).type).toBe(SnapOutcomeType.FOUND);

    const wrong = snap(line('PLATFORM 4', 400, 100, 600, 160));
    expect(wrong.type).toBe(SnapOutcomeType.WRONG_BOARD);
    expect(wrong.platforms).toEqual(['4']);

    expect(snap(line('WAITING ROOM', 400, 100, 600, 160)).type).toBe(SnapOutcomeType.NOT_VISIBLE);
    expect(snap().type).toBe(SnapOutcomeType.UNCLEAR);
    expect(snap(line('PLATFORM 2', 400, 100, 600, 160, 0, 0.4)).type).toBe(SnapOutcomeType.UNCLEAR);
  });

  it('reads ticket', () => {
    const r = engine.readTicket(
      page(
        line('TRAIN: 12627', 0, 0, 300, 40),
        line('FROM: BENGALURU', 0, 50, 300, 90),
        line('TO: MANGALURU', 0, 100, 300, 140),
        line('PLATFORM: 2', 0, 150, 300, 190)
      )
    );
    expect(r.platform).toBe('2');
    expect(r.confident).toBe(true);
  });

  it('ticket without platform', () => {
    const r = engine.readTicket(page(line('TRAIN: 12627', 0, 0, 300, 40)));
    expect(r.platform).toBeNull();
  });
});
