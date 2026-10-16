import { Position, Direction, Arrow } from './model.js';
import { PlatformParser } from './platformParser.js';
import { Arrows } from './arrows.js';

export const DEFAULT_OCR_CONFIDENCE = 0.8;

export class LocatedMention {
  constructor(mention, text, box, ocrConfidence, arrow) {
    this.mention = mention;
    this.text = text;
    this.box = box;
    this.ocrConfidence = ocrConfidence;
    this.arrow = arrow;
  }

  get confidence() {
    const c = this.ocrConfidence * (1.0 - this.mention.penalty);
    return Math.max(0, Math.min(1, c));
  }
}

export class TargetResult {
  constructor({
    isRelevant,
    matchedText,
    platforms,
    confidence,
    position,
    direction,
    arrow,
    box,
  }) {
    this.isRelevant = isRelevant;
    this.matchedText = matchedText;
    this.platforms = platforms;
    this.confidence = confidence;
    this.position = position;
    this.direction = direction;
    this.arrow = arrow;
    this.box = box;
  }
}

export class PageAnalysis {
  constructor(target, others, hasReadableText) {
    this.target = target;
    this.others = others;
    this.hasReadableText = hasReadableText;
  }
}

export class TicketReading {
  constructor(platform, confident) {
    this.platform = platform;
    this.confident = confident;
  }
}

export class TargetRecognitionEngine {
  constructor(leftEdge = 0.35, rightEdge = 0.65, minOtherConfidence = 0.55) {
    this.leftEdge = leftEdge;
    this.rightEdge = rightEdge;
    this.minOtherConfidence = minOtherConfidence;
  }

  analyze(page, target) {
    const wanted = PlatformParser.normalizeId(target);
    const mentions = this.findMentions(page);

    const results = mentions.map((lm) => {
      const pos = this.position(lm.box, page.width);
      return new TargetResult({
        isRelevant: lm.mention.platforms.includes(wanted),
        matchedText: lm.text.trim(),
        platforms: lm.mention.platforms,
        confidence: lm.confidence,
        position: pos,
        direction: this.direction(pos, lm.arrow),
        arrow: lm.arrow,
        box: lm.box,
      });
    });

    const relevantList = results.filter((r) => r.isRelevant);
    let bestTarget = null;
    if (relevantList.length > 0) {
      bestTarget = relevantList.reduce((max, r) => (r.confidence > max.confidence ? r : max), relevantList[0]);
    }

    const others = results.filter((r) => !r.isRelevant && r.confidence >= this.minOtherConfidence);

    const hasReadableText = page.lines.some((line) => {
      const alphanumCount = (line.text.match(/[A-Za-z0-9]/g) || []).length;
      return alphanumCount >= 2;
    });

    return new PageAnalysis(bestTarget, others, hasReadableText);
  }

  readTicket(page, minConfident = 0.75) {
    const mentions = this.findMentions(page).filter((m) => m.mention.platforms.length === 1);
    if (mentions.length === 0) return new TicketReading(null, false);

    const byId = new Map();
    for (const m of mentions) {
      const id = m.mention.platforms[0];
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(m);
    }

    let bestKey = null;
    let bestMentions = [];

    for (const [key, list] of byId.entries()) {
      if (!bestKey) {
        bestKey = key;
        bestMentions = list;
      } else {
        const bestMaxConf = Math.max(...bestMentions.map((m) => m.confidence));
        const curMaxConf = Math.max(...list.map((m) => m.confidence));
        if (list.length > bestMentions.length) {
          bestKey = key;
          bestMentions = list;
        } else if (list.length === bestMentions.length && curMaxConf > bestMaxConf) {
          bestKey = key;
          bestMentions = list;
        }
      }
    }

    const maxConf = Math.max(...bestMentions.map((m) => m.confidence));
    const isConfident = byId.size === 1 && maxConf >= minConfident;
    return new TicketReading(bestKey, isConfident);
  }

  position(box, imageWidth) {
    if (!box || imageWidth <= 0) return Position.UNKNOWN;
    if (box.width > imageWidth * 0.7) return Position.CENTER;
    const x = box.centerX / imageWidth;
    if (x < this.leftEdge) return Position.LEFT;
    if (x > this.rightEdge) return Position.RIGHT;
    return Position.CENTER;
  }

  direction(position, arrow) {
    switch (arrow) {
      case Arrow.LEFT:
        return Direction.LEFT;
      case Arrow.RIGHT:
        return Direction.RIGHT;
      case Arrow.UP:
        return Direction.STRAIGHT;
      default:
        switch (position) {
          case Position.LEFT:
            return Direction.LEFT;
          case Position.CENTER:
            return Direction.STRAIGHT;
          case Position.RIGHT:
            return Direction.RIGHT;
          default:
            return Direction.UNKNOWN;
        }
    }
  }

  findMentions(page) {
    const lines = page.lines;
    const used = new Array(lines.length).fill(false);
    const out = [];

    for (let i = 0; i < lines.length; i++) {
      if (used[i]) continue;
      const line = lines[i];

      const direct = PlatformParser.parse(line.text);
      if (direct.length > 0) {
        used[i] = true;
        for (const mention of direct) {
          out.push(this.locate(mention, line.text, line.box, this.confidenceOf(line), lines));
        }
        continue;
      }

      if (!PlatformParser.endsWithKeyword(line.text)) continue;
      const partnerIndex = this.findNumberPartner(i, lines, used);
      if (partnerIndex === null) continue;

      const partner = lines[partnerIndex];
      const joined = `${line.text} ${partner.text}`;
      const merged = PlatformParser.parse(joined);
      if (merged.length === 0) continue;

      used[i] = true;
      used[partnerIndex] = true;

      const a = line.box;
      const b = partner.box;
      const box = a && b ? a.union(b) : a || b;
      const confidence = Math.min(this.confidenceOf(line), this.confidenceOf(partner));

      for (const mention of merged) {
        out.push(this.locate(mention, joined, box, confidence, lines));
      }
    }

    return out;
  }

  confidenceOf(line) {
    return line.confidence && line.confidence > 0 ? line.confidence : DEFAULT_OCR_CONFIDENCE;
  }

  locate(mention, text, box, confidence, lines) {
    const detectedArrow = Arrows.detect(text) || this.nearbyArrow(box, lines);
    return new LocatedMention(mention, text, box, confidence, detectedArrow);
  }

  nearbyArrow(box, lines) {
    if (!box) return null;
    const reach = 3 * Math.max(1, box.height);
    const matching = [];

    for (const l of lines) {
      if (Arrows.isArrowOnly(l.text)) {
        if (l.box && l.box.verticallyOverlaps(box) && l.box.horizontalGap(box) <= reach) {
          const arr = Arrows.detect(l.text);
          if (arr && !matching.includes(arr)) {
            matching.push(arr);
          }
        }
      }
    }

    return matching.length === 1 ? matching[0] : null;
  }

  findNumberPartner(i, lines, used) {
    const keyword = lines[i];
    const next = i + 1 < lines.length ? lines[i + 1] : null;

    if (
      next &&
      next.block === keyword.block &&
      !used[i + 1] &&
      PlatformParser.loneId(next.text) !== null
    ) {
      return i + 1;
    }

    const kb = keyword.box;
    if (!kb) return null;
    const h = Math.max(1, kb.height);

    let best = null;
    let bestDistance = Infinity;

    for (let j = 0; j < lines.length; j++) {
      if (j === i || used[j]) continue;
      const ob = lines[j].box;
      if (!ob) continue;
      if (PlatformParser.loneId(lines[j].text) === null) continue;

      const below =
        ob.top >= kb.top + h / 2 &&
        ob.top <= kb.bottom + 3 * h &&
        ob.left < kb.right &&
        ob.right > kb.left;

      const rightOf =
        kb.verticallyOverlaps(ob) &&
        ob.left >= kb.left + kb.width / 2 &&
        ob.left - kb.right <= 3 * h;

      if (!below && !rightOf) continue;

      const d = Math.hypot(ob.centerX - kb.centerX, ob.centerY - kb.centerY);
      if (d < bestDistance) {
        bestDistance = d;
        best = j;
      }
    }

    return best;
  }
}
