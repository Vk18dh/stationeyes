import { Position, Direction, Arrow } from './model.js';
import { SnapOutcomeType } from './snapInterpreter.js';

function where(position) {
  switch (position) {
    case Position.LEFT:
      return 'to your left';
    case Position.RIGHT:
      return 'to your right';
    case Position.CENTER:
      return 'straight ahead';
    case Position.UNKNOWN:
    default:
      return null;
  }
}

function arrowWord(arrow) {
  switch (arrow) {
    case Arrow.LEFT:
      return 'left';
    case Arrow.RIGHT:
      return 'right';
    case Arrow.UP:
      return 'straight on';
    default:
      return '';
  }
}

function joinAnd(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

export const Phrases = {
  // Ticket
  ASK_TICKET: 'Show me your ticket. Take a photo of it, or type the platform number.',
  TICKET_NONE: "I couldn't find a platform number on this ticket. You can type it instead.",
  ticketConfident(p) {
    return `Your target is Platform ${p}.`;
  },
  ticketCheck(p) {
    return `I found Platform ${p}. Is that correct?`;
  },
  targetSet(p) {
    return `Your target is Platform ${p}. Choose Live Guide or Snap a Board.`;
  },

  // Live guide
  liveStart(p) {
    return `Looking for Platform ${p}. Move your phone slowly.`;
  },
  detected(p, pos) {
    const w = where(pos);
    return w ? `Platform ${p} detected. It is ${w}.` : `Platform ${p} detected.`;
  },
  foundAgain(p, pos) {
    const w = where(pos);
    return w ? `Platform ${p} found again. It is ${w}.` : `Platform ${p} found again.`;
  },
  position(p, pos, arrow) {
    const base = `Platform ${p} is ${where(pos)}.`;
    return pos === Position.CENTER && arrow ? `${base} The sign points ${arrowWord(arrow)}.` : base;
  },
  lost(p) {
    return `I lost Platform ${p}. Slowly move the camera.`;
  },

  // Snap a board
  snap(outcome, p) {
    switch (outcome.type) {
      case SnapOutcomeType.FOUND:
        switch (outcome.result.direction) {
          case Direction.STRAIGHT:
            return `Platform ${p} found. Go straight ahead.`;
          case Direction.LEFT:
            return `Platform ${p} found. It is to your left.`;
          case Direction.RIGHT:
            return `Platform ${p} found. It is to your right.`;
          case Direction.UNKNOWN:
          default:
            return `Platform ${p} detected. Follow the signs for Platform ${p}.`;
        }
      case SnapOutcomeType.WRONG_BOARD:
        if (outcome.platforms.length === 1) {
          return `This is Platform ${outcome.platforms[0]}. You need Platform ${p}.`;
        }
        return `This board is for Platforms ${joinAnd(outcome.platforms)}. You need Platform ${p}.`;
      case SnapOutcomeType.UNCLEAR:
        return "I couldn't read that board. Try again.";
      case SnapOutcomeType.NOT_VISIBLE:
        return `I can't see Platform ${p} here. Try another board.`;
      default:
        return "I couldn't read that board. Try again.";
    }
  },
};
