/**
 * Engine data structures and enums
 */

export class Box {
  constructor(left, top, right, bottom) {
    this.left = Math.round(left);
    this.top = Math.round(top);
    this.right = Math.round(right);
    this.bottom = Math.round(bottom);
  }

  get width() {
    return this.right - this.left;
  }

  get height() {
    return this.bottom - this.top;
  }

  get centerX() {
    return (this.left + this.right) / 2;
  }

  get centerY() {
    return (this.top + this.bottom) / 2;
  }

  union(other) {
    if (!other) return this;
    return new Box(
      Math.min(this.left, other.left),
      Math.min(this.top, other.top),
      Math.max(this.right, other.right),
      Math.max(this.bottom, other.bottom)
    );
  }

  verticallyOverlaps(other) {
    if (!other) return false;
    return this.top < other.bottom && other.top < this.bottom;
  }

  horizontalGap(other) {
    if (!other) return 0;
    return Math.max(0, Math.max(this.left, other.left) - Math.min(this.right, other.right));
  }
}

export class OcrLine {
  constructor(text, box = null, confidence = null, block = 0) {
    this.text = text || '';
    this.box = box;
    this.confidence = confidence;
    this.block = block;
  }
}

export class OcrPage {
  constructor(lines = [], width = 0, height = 0) {
    this.lines = lines;
    this.width = width;
    this.height = height;
  }
}

export const Position = Object.freeze({
  LEFT: 'LEFT',
  CENTER: 'CENTER',
  RIGHT: 'RIGHT',
  UNKNOWN: 'UNKNOWN',
});

export const Direction = Object.freeze({
  LEFT: 'LEFT',
  STRAIGHT: 'STRAIGHT',
  RIGHT: 'RIGHT',
  UNKNOWN: 'UNKNOWN',
});

export const Arrow = Object.freeze({
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  UP: 'UP',
});

export const Cue = Object.freeze({
  FOUND: 'FOUND',
  CENTERED: 'CENTERED',
  WRONG: 'WRONG',
  LOST: 'LOST',
});
