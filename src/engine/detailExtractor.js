import { PlatformParser } from './platformParser.js';
import { Arrows } from './arrows.js';

/**
 * Extracts senior-friendly key railway details from raw OCR text lines across one or more photos.
 * @param {Array<string|{text: string, photoName?: string}>} lines
 */
export function extractRailwayDetails(lines = []) {
  const cleanLineObjects = [];
  const textStrings = [];

  for (const l of lines) {
    const text = typeof l === 'string' ? l.trim() : (l.text || '').trim();
    if (text.length > 0) {
      cleanLineObjects.push({
        text,
        photoName: typeof l === 'object' && l.photoName ? l.photoName : null,
      });
      textStrings.push(text);
    }
  }

  const fullText = textStrings.join('\n');

  let platform = null;
  let direction = null;
  let pnr = null;
  let trainNumber = null;
  let coachSeat = null;

  // 1. Platform & Direction Extraction
  for (const item of cleanLineObjects) {
    const mentions = PlatformParser.parse(item.text);
    if (mentions.length > 0 && !platform) {
      platform = mentions[0].platforms.join(', ');
    }
    const arrow = Arrows.detect(item.text);
    if (arrow && !direction) {
      direction = arrow === 'LEFT' ? 'Left (←)' : arrow === 'RIGHT' ? 'Right (→)' : 'Straight Ahead (↑)';
    }
  }

  // Fallback platform regex if not caught
  if (!platform) {
    const pfMatch = fullText.match(/\b(?:PF|PLATFORM|PLT)\s*(?:NO\.?|NUMBER)?\s*[:\-]?\s*([0-9]{1,2}[A-Z]?)\b/i);
    if (pfMatch) {
      platform = pfMatch[1].toUpperCase();
    }
  }

  // 2. PNR Number (10 digits in Indian Railways)
  const pnrMatch = fullText.match(/\b([0-9]{3}[-\s]?[0-9]{3}[-\s]?[0-9]{4}|[0-9]{10})\b/);
  if (pnrMatch) {
    pnr = pnrMatch[1].replace(/[-\s]/g, '');
  }

  // 3. Train Number (usually 5 digits, e.g. 12627)
  const trainMatch = fullText.match(/\b(?:TRAIN|TRN|EXP|EXPRESS)?\s*[:\-#]?\s*([12][0-9]{4}|0[0-9]{4})\b/i);
  if (trainMatch) {
    trainNumber = trainMatch[1];
  }

  // 4. Coach & Seat / Berth (e.g. S1-45, B2 23, A1 12)
  const coachMatch = fullText.match(/\b([A-Z][0-9]{1,2})[\s\-]+([0-9]{1,2})\b/);
  if (coachMatch) {
    coachSeat = `Coach ${coachMatch[1]}, Seat ${coachMatch[2]}`;
  }

  return {
    platform,
    direction,
    pnr,
    trainNumber,
    coachSeat,
    lines: cleanLineObjects,
    rawText: fullText,
  };
}

/**
 * Builds a natural, easy-to-understand spoken summary for seniors.
 */
export function buildSpokenSummary(details) {
  const parts = [];

  if (details.platform) {
    parts.push(`Platform number is ${details.platform}.`);
  }
  if (details.direction) {
    parts.push(`Direction is ${details.direction}.`);
  }
  if (details.trainNumber) {
    parts.push(`Train number is ${details.trainNumber}.`);
  }
  if (details.coachSeat) {
    parts.push(`Your seat is ${details.coachSeat}.`);
  }
  if (details.pnr) {
    parts.push(`P N R is ${details.pnr.split('').join(' ')}.`);
  }

  if (parts.length === 0) {
    if (details.lines.length > 0) {
      const topLines = details.lines.slice(0, 5).map((l) => l.text).join('. ');
      return `Here is what was read from your photos: ${topLines}`;
    }
    return "I couldn't detect any railway details from these photos. Please try taking a clearer photo.";
  }

  return parts.join(' ');
}
