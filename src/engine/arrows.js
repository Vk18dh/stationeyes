/**
 * Reads direction arrows printed on signs, as OCR tends to return them.
 */

import { Arrow } from './model.js';

const LEFT_LIST = ['←', '⬅', '⇐', '⇦', '◀', '◄', '<-', '<—', '<–', '<<'];
const RIGHT_LIST = ['→', '➡', '⇒', '⇨', '▶', '►', '->', '—>', '–>', '>>'];
const UP_LIST = ['↑', '⬆', '⇑', '⇧', '▲'];

const ARROW_CHARS = new Set([
  ...LEFT_LIST.flatMap(s => s.split('')),
  ...RIGHT_LIST.flatMap(s => s.split('')),
  ...UP_LIST.flatMap(s => s.split('')),
  '<', '>', '-', '—', '–', '\uFE0F',
]);

export const Arrows = {
  /** The single arrow in [text], or null if there is none or the text points several ways. */
  detect(text) {
    if (!text) return null;
    const t = text.trim();
    if (t === '<') return Arrow.LEFT;
    if (t === '>') return Arrow.RIGHT;

    const found = [];
    if (LEFT_LIST.some(it => t.includes(it))) found.push(Arrow.LEFT);
    if (RIGHT_LIST.some(it => t.includes(it))) found.push(Arrow.RIGHT);
    if (UP_LIST.some(it => t.includes(it))) found.push(Arrow.UP);

    return found.length === 1 ? found[0] : null;
  },

  isArrowOnly(text) {
    if (!text) return false;
    const t = text.replace(/\s+/g, '');
    if (!t) return false;
    for (const c of t) {
      if (!ARROW_CHARS.has(c)) return false;
    }
    return true;
  },
};
