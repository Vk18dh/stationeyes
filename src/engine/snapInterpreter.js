export const SnapOutcomeType = Object.freeze({
  FOUND: 'FOUND',
  WRONG_BOARD: 'WRONG_BOARD',
  UNCLEAR: 'UNCLEAR',
  NOT_VISIBLE: 'NOT_VISIBLE',
});

export class SnapOutcome {
  static Found(result) {
    return { type: SnapOutcomeType.FOUND, result };
  }

  static WrongBoard(platforms) {
    return { type: SnapOutcomeType.WRONG_BOARD, platforms };
  }

  static Unclear() {
    return { type: SnapOutcomeType.UNCLEAR };
  }

  static NotVisible() {
    return { type: SnapOutcomeType.NOT_VISIBLE };
  }
}

export const SnapInterpreter = {
  interpret(analysis, foundThreshold = 0.6) {
    const target = analysis.target;
    if (target && target.confidence >= foundThreshold) {
      return SnapOutcome.Found(target);
    }
    // We may have glimpsed it but aren't sure: ask for a better photo rather than guess
    if (target) {
      return SnapOutcome.Unclear();
    }
    if (analysis.others && analysis.others.length > 0) {
      const allPlatforms = Array.from(new Set(analysis.others.flatMap((it) => it.platforms)));
      return SnapOutcome.WrongBoard(allPlatforms);
    }
    if (!analysis.hasReadableText) {
      return SnapOutcome.Unclear();
    }
    return SnapOutcome.NotVisible();
  },
};
