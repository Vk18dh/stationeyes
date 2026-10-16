/**
 * PlatformParser
 * Turns noisy OCR text into platform mentions.
 *
 * Handles: PLATFORM 2, Platform No. 2, PLAT 2, PF 2, PF NO 2, PLATFORM-2, P.F. 2, PF2,
 * Platform 02, Platform 1A, Platforms 2, 3 & 4, Platforms 1 to 4.
 */

const KEYWORDS = new Set(['PLATFORM', 'PLATFORMS', 'PLATF', 'PLAT', 'PLT', 'PF', 'PFS', 'PFM']);
const NUMBER_WORDS = new Set(['NO', 'NOS', 'N0', 'NUMBER', 'NUM']);
const JOINERS = new Set(['AND', '&']);
const UNITS = new Set([
  'MIN', 'MINS', 'MINUTE', 'MINUTES', 'M', 'MTR', 'MTRS', 'METER', 'METERS', 'METRE', 'METRES',
  'KM', 'AM', 'PM', 'HR', 'HRS',
]);

const CLEAN_ID = /^[0-9]{1,2}[A-Z]?$/;
const GLUED = /^(PLATFORMS?|PLATF|PLAT|PLT|PFS|PFM|PF)(NOS?|N0)?([0-9]{1,2}[A-Z]?)$/;
const PF_DOTTED = /\bP\s*[./:]\s*F\b\.?/gi;
const NON_TOKEN = /[^A-Z0-9&]+/g;
const SPACES = /\s+/g;
const ID_PARTS = /^0*([0-9]+)([A-Z]?)$/;

const DIGIT_LOOKALIKES = {
  O: '0',
  I: '1',
  L: '1',
  Z: '2',
  S: '5',
  B: '8',
};

const FUZZY_KEYWORD_PENALTY = 0.10;
const LOOKALIKE_PENALTY = 0.15;
const MAX_IDS = 8;
const MAX_RANGE = 10;

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1);
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

export class PlatformMention {
  constructor(platforms, rawText, penalty = 0) {
    this.platforms = platforms;
    this.rawText = rawText;
    this.penalty = penalty;
  }
}

export const PlatformParser = {
  normalize(raw) {
    let s = raw.toUpperCase().replace(/\|/g, 'I');
    s = s.replace(PF_DOTTED, 'PF ');
    s = s.replace(/&/g, ' & ');
    s = s.replace(NON_TOKEN, ' ');
    return s.replace(SPACES, ' ').trim();
  },

  /** "02" -> "2", "1a" -> "1A". Returns the input uppercased if it isn't an id. */
  normalizeId(raw) {
    const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = s.match(ID_PARTS);
    if (!m) return s;
    return m[1] + m[2];
  },

  isValidId(raw) {
    return CLEAN_ID.test(this.normalizeId(raw));
  },

  tokens(raw) {
    return this.normalize(raw).split(' ').filter(Boolean);
  },

  keywordPenalty(token) {
    if (KEYWORDS.has(token)) return 0;
    if (token.length >= 7 && token.length <= 10) {
      if (editDistance(token, 'PLATFORM') <= 1 || editDistance(token, 'PLATFORMS') <= 1) {
        return FUZZY_KEYWORD_PENALTY;
      }
    }
    return null;
  },

  readFirstId(token) {
    if (CLEAN_ID.test(token)) {
      return { id: this.normalizeId(token), penalty: 0 };
    }
    if (token.length > 2) return null;

    let fixes = 0;
    let mapped = '';
    for (const c of token) {
      if (/[0-9]/.test(c)) {
        mapped += c;
      } else if (DIGIT_LOOKALIKES[c] !== undefined) {
        mapped += DIGIT_LOOKALIKES[c];
        fixes++;
      } else {
        return null;
      }
    }
    if (fixes > 1) return null;
    return { id: this.normalizeId(mapped), penalty: LOOKALIKE_PENALTY * fixes };
  },

  collectFollowing(tokens, start, first) {
    const ids = [];
    let last = first;
    let k = start;
    while (k < tokens.length && ids.length < MAX_IDS) {
      const t = tokens[k];
      const nextIsId = k + 1 < tokens.length && CLEAN_ID.test(tokens[k + 1]);

      if (JOINERS.has(t) && nextIsId) {
        k++;
      } else if (t === 'TO' && nextIsId) {
        const from = parseInt(last, 10);
        const to = parseInt(this.normalizeId(tokens[k + 1]), 10);
        if (isNaN(from) || isNaN(to) || to <= from || to - from > MAX_RANGE) break;
        for (let n = from + 1; n <= to; n++) {
          ids.push(String(n));
        }
        last = String(to);
        k += 2;
      } else if (CLEAN_ID.test(t)) {
        if (k + 1 < tokens.length && UNITS.has(tokens[k + 1])) break;
        const id = this.normalizeId(t);
        ids.push(id);
        last = id;
        k++;
      } else {
        break;
      }
    }
    return { ids, next: k };
  },

  parse(raw) {
    const tokens = this.tokens(raw);
    const out = [];
    let i = 0;

    while (i < tokens.length) {
      const glued = tokens[i].match(GLUED);
      if (glued) {
        const first = this.normalizeId(glued[3]);
        const rest = this.collectFollowing(tokens, i + 1, first);
        const allIds = Array.from(new Set([first, ...rest.ids]));
        out.push(new PlatformMention(allIds, raw.trim(), 0));
        i = rest.next;
        continue;
      }

      const kwPenalty = this.keywordPenalty(tokens[i]);
      if (kwPenalty !== null) {
        let j = i + 1;
        while (j < tokens.length && NUMBER_WORDS.has(tokens[j])) j++;
        const first = j < tokens.length ? this.readFirstId(tokens[j]) : null;
        if (first) {
          const rest = this.collectFollowing(tokens, j + 1, first.id);
          const allIds = Array.from(new Set([first.id, ...rest.ids]));
          out.push(new PlatformMention(allIds, raw.trim(), kwPenalty + first.penalty));
          i = rest.next;
          continue;
        }
      }
      i++;
    }

    return out;
  },

  /** True for lines like "PLATFORM" or "PF NO." whose number is printed on the next line. */
  endsWithKeyword(raw) {
    const t = [...this.tokens(raw)];
    while (t.length > 0 && NUMBER_WORDS.has(t[t.length - 1])) {
      t.pop();
    }
    if (t.length === 0) return false;
    return this.keywordPenalty(t[t.length - 1]) !== null;
  },

  /** A line that is just a platform number, e.g. a big "2" under the word PLATFORM. */
  loneId(raw) {
    const t = this.tokens(raw);
    return t.length === 1 && CLEAN_ID.test(t[0]) ? this.normalizeId(t[0]) : null;
  },
};
