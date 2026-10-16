import { PlatformParser } from './platformParser.js';
import { Arrows } from './arrows.js';
import { Direction, Position } from './model.js';

// Common Indian Railways station facilities and board headings
const COMMON_FACILITIES = [
  { key: 'FOOT OVER BRIDGE', label: 'Foot Over Bridge (FOB)', regex: /\b(FOOT\s*OVER\s*BRIDGE|F\.?O\.?B\.?|OVER\s*BRIDGE)\b/i },
  { key: 'SUBWAY', label: 'Subway / Underpass', regex: /\b(SUBWAY|UNDER\s*PASS|SUB\s*WAY)\b/i },
  { key: 'WAITING ROOM', label: 'Waiting Room / Hall', regex: /\b(WAITING\s*ROOM|WAITING\s*HALL|REST\s*ROOM|LOUNGE)\b/i },
  { key: 'ESCALATOR', label: 'Escalator / Lift', regex: /\b(ESCALATOR|LIFT|ELEVATOR|RAMP)\b/i },
  { key: 'EXIT', label: 'Station Exit / Way Out', regex: /\b(WAY\s*OUT|EXIT|NARI\s*DWAR|OUT)\b/i },
  { key: 'ENTRY', label: 'Main Entry / Concourse', regex: /\b(MAIN\s*ENTRY|ENTRANCE|CONCOURSE|ENTRY)\b/i },
  { key: 'BOOKING OFFICE', label: 'Ticket Booking / Reservation', regex: /\b(BOOKING|TICKET\s*COUNTER|RESERVATION|CURRENT\s*BOOKING)\b/i },
  { key: 'INQUIRY', label: 'Enquiry / Help Desk', regex: /\b(ENQUIRY|INQUIRY|HELP\s*DESK|MAY\s*I\s*HELP\s*YOU|SAHAYATA)\b/i },
  { key: 'CLOAK ROOM', label: 'Cloak Room / Luggage', regex: /\b(CLOAK\s*ROOM|LUGGAGE|PARCEL)\b/i },
  { key: 'REFRESHMENT', label: 'Canteen / Food Plaza', regex: /\b(REFRESHMENT|CANTEEN|FOOD\s*PLAZA|RESTAURANT|AHAAR)\b/i },
  { key: 'TOILET', label: 'Restroom / Toilets', regex: /\b(TOILET|LAVATORY|W\.?C\.?|WASH\s*ROOM|GENTS|LADIES)\b/i },
];

/**
 * Extracts distance in metres and walking time from text lines.
 * Handles formats like:
 * - "100 M", "100M", "100 MTR", "100 MTRS", "100 METRES", "100 METERS"
 * - "(50 M)", "50 MTRS AHEAD", "DISTANCE 75 M", "150 M →"
 * - "1.5 KM", "1 KM"
 * - Hindi text: "50 मी", "50 मीटर"
 * - "2 MIN", "5 MINS", "3 MINUTES"
 */
export function extractDistance(text) {
  if (!text) return null;
  const upper = text.toUpperCase();

  let meters = null;
  let formatted = null;
  let walkingTime = null;

  // 1. Explicit meters / mtrs / metres regex (e.g. 50 MTR, 50 MTRS, 100 METRES, 200 METERS)
  const mtrMatch = upper.match(/\b([0-9]{1,4})\s*(?:MTRS?|METRES?|METERS?|MTR)\b/);
  if (mtrMatch) {
    meters = parseInt(mtrMatch[1], 10);
    formatted = `${meters} metres`;
  }

  // 2. Kilometres regex (e.g. 1 KM or 0.5 KM)
  if (!meters) {
    const kmMatch = upper.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:KM|KMS|KILOMETRES?|KILOMETERS?)\b/);
    if (kmMatch) {
      const kmVal = parseFloat(kmMatch[1]);
      meters = Math.round(kmVal * 1000);
      formatted = `${meters} metres`;
    }
  }

  // 3. Distance in parentheses or next to arrows / distance prefix:
  // e.g. "(50 M)", "(100M)", "DISTANCE: 75 M", "100 M →", "← 50 M", "150 M AHEAD"
  if (!meters) {
    const shortMatch = upper.match(
      /(?:\(|\b(?:DIST|DISTANCE)[:\s]*)\s*([0-9]{1,4})\s*M(?:\)|\b)|\b([0-9]{1,4})\s*M(?:\)|\s*(?:AHEAD|AWAY|FAR|→|->|>|←|<-|<|↑|\^))\b/
    );
    if (shortMatch) {
      const val = parseInt(shortMatch[1] || shortMatch[2], 10);
      if (!isNaN(val) && val > 0 && val <= 5000) {
        meters = val;
        formatted = `${meters} metres`;
      }
    }
  }

  // 4. Standalone e.g. "100 M" with word boundary if preceded by facility or platform keyword
  if (!meters) {
    const contextMatch = upper.match(
      /(?:PLATFORM|PF|FOB|BRIDGE|SUBWAY|GATE|EXIT|ENTRY|WAY)[^0-9\n]*([0-9]{1,4})\s*M(?:\b|\.)/
    );
    if (contextMatch) {
      const val = parseInt(contextMatch[1], 10);
      if (!isNaN(val) && val > 0 && val <= 5000) {
        meters = val;
        formatted = `${meters} metres`;
      }
    }
  }

  // 5. General "XX M" pattern where XX >= 10 and not followed by AM/PM
  if (!meters) {
    const generalMatch = upper.match(/\b([0-9]{2,4})\s*M(?:\b|\.)(?!\s*(?:AM|PM))/);
    if (generalMatch) {
      const val = parseInt(generalMatch[1], 10);
      if (!isNaN(val) && val >= 10 && val <= 5000) {
        meters = val;
        formatted = `${meters} metres`;
      }
    }
  }

  // 6. Walking time regex: e.g. "2 MINS", "5 MIN", "10 MINUTES"
  const minMatch = upper.match(/\b([0-9]{1,2})\s*(?:MIN|MINS|MINUTES?)\b/);
  if (minMatch) {
    const minVal = parseInt(minMatch[1], 10);
    walkingTime = `${minVal} min${minVal > 1 ? 's' : ''}`;
  } else if (meters) {
    // Helpful walking estimate for seniors (approx 50m / min)
    const est = Math.max(1, Math.round(meters / 50));
    walkingTime = `approx. ${est} min walk`;
  }

  if (!meters && !walkingTime) return null;

  return {
    meters,
    formatted: formatted || (meters ? `${meters} metres` : null),
    walkingTime,
  };
}

/**
 * Extracts all platforms (including ranges like 1-4, lists 2,3,4, glued PF3, and noisy OCR).
 */
export function extractAllPlatformsFromText(text) {
  const platforms = new Set();
  const upper = text.toUpperCase();

  // 1. Using standard PlatformParser
  const parsed = PlatformParser.parse(upper);
  parsed.forEach((m) => m.platforms.forEach((p) => platforms.add(p)));

  // 2. Extra regex for ranges like "1-4", "1 TO 4", "PF 1-4", "PLATFORMS 1 - 4"
  const rangeMatch = upper.match(/\b(?:PF|PLATFORMS?|PLT)?\s*([0-9]{1,2})\s*(?:TO|-|–)\s*([0-9]{1,2})\b/);
  if (rangeMatch) {
    const from = parseInt(rangeMatch[1], 10);
    const to = parseInt(rangeMatch[2], 10);
    if (!isNaN(from) && !isNaN(to) && to >= from && to - from <= 12) {
      for (let n = from; n <= to; n++) {
        platforms.add(String(n));
      }
    }
  }

  // 3. Regex for glued "PF3", "PF-3", "P.F.3", "PLAT3", "PLAT-3", "PLATFORM 3A"
  const gluedMatch = upper.match(/\b(?:PF|PLATFORM|PLAT|P\.F\.)\s*[\-:#]?\s*([0-9]{1,2}[A-Z]?)\b/g);
  if (gluedMatch) {
    gluedMatch.forEach((m) => {
      const num = m.match(/([0-9]{1,2}[A-Z]?)$/);
      if (num) platforms.add(PlatformParser.normalizeId(num[1]));
    });
  }

  // 4. Standalone number next to arrows like "3 ->" or "<- 3"
  const arrowNumMatch = upper.match(/(?:←|<-|<)\s*([0-9]{1,2}[A-Z]?)\b|\b([0-9]{1,2}[A-Z]?)\s*(?:→|->|>)/);
  if (arrowNumMatch) {
    const id = arrowNumMatch[1] || arrowNumMatch[2];
    if (id) platforms.add(PlatformParser.normalizeId(id));
  }

  return Array.from(platforms);
}

/**
 * Parses a Station Route Board / Billboard.
 * Extracts:
 * - Board Title / Facility Names (e.g. Foot Over Bridge, Way to Platforms, Waiting Hall)
 * - All platforms mentioned on the board
 * - Direction arrows found
 * - Distance in metres / walking time (e.g. 50 metres, 100 metres)
 * - Target platform presence & specific path
 */
export function parseStationBoard(lines = [], targetPlatform = '') {
  const cleanLines = lines
    .map((l) => (typeof l === 'string' ? l.trim() : (l.text || '').trim()))
    .filter((l) => l.length > 0);

  const fullText = cleanLines.join('\n');
  const normalizedTarget = PlatformParser.normalizeId(targetPlatform || '');

  // 1. Identify Board Facilities / Headings
  const detectedFacilities = [];
  for (const fac of COMMON_FACILITIES) {
    if (fac.regex.test(fullText)) {
      detectedFacilities.push(fac.label);
    }
  }

  // 2. Extract Board Title / Header Line
  let boardTitle = 'Station Route Board';
  for (const line of cleanLines) {
    const upper = line.toUpperCase();
    if (
      upper.includes('WAY TO') ||
      upper.includes('FOOT OVER') ||
      upper.includes('FOB') ||
      upper.includes('SUBWAY') ||
      upper.includes('PLATFORM') ||
      upper.includes('ENTRANCE') ||
      upper.includes('EXIT')
    ) {
      boardTitle = line;
      break;
    }
  }
  if (boardTitle === 'Station Route Board' && cleanLines.length > 0) {
    boardTitle = cleanLines[0];
  }

  // 3. Extract All Platforms
  const allPlatforms = extractAllPlatformsFromText(fullText);

  // 4. Find Direction, Arrows & Distance associated with target platform
  let targetFound = false;
  let targetDirection = Direction.UNKNOWN;
  let targetArrow = null;
  let targetDistance = null;

  if (normalizedTarget && allPlatforms.includes(normalizedTarget)) {
    targetFound = true;
  }

  // Check lines specifically containing the target platform
  for (const line of cleanLines) {
    const linePlatforms = extractAllPlatformsFromText(line);
    const arrow = Arrows.detect(line);
    const dist = extractDistance(line);

    if (normalizedTarget && linePlatforms.includes(normalizedTarget)) {
      targetFound = true;
      if (dist && !targetDistance) {
        targetDistance = dist;
      }
      if (arrow && !targetArrow) {
        targetArrow = arrow;
        targetDirection =
          arrow === 'LEFT' ? Direction.LEFT : arrow === 'RIGHT' ? Direction.RIGHT : Direction.STRAIGHT;
      }
    }
  }

  // If no target-specific arrow was found, check the whole board's arrow
  if (!targetArrow) {
    for (const line of cleanLines) {
      const arrow = Arrows.detect(line);
      if (arrow) {
        targetArrow = arrow;
        targetDirection =
          arrow === 'LEFT' ? Direction.LEFT : arrow === 'RIGHT' ? Direction.RIGHT : Direction.STRAIGHT;
        break;
      }
    }
  }

  // If no target-specific distance was found, check all lines for any mentioned distance
  if (!targetDistance) {
    for (const line of cleanLines) {
      const dist = extractDistance(line);
      if (dist) {
        targetDistance = dist;
        break;
      }
    }
  }

  // Direction wording
  let pathInstruction = 'Follow the station signs';
  if (targetDirection === Direction.RIGHT) {
    pathInstruction = 'Turn to Your Right (→)';
  } else if (targetDirection === Direction.LEFT) {
    pathInstruction = 'Turn to Your Left (←)';
  } else if (targetDirection === Direction.STRAIGHT) {
    pathInstruction = 'Go Straight Ahead (↑)';
  }

  return {
    boardTitle,
    facilities: detectedFacilities,
    allPlatforms,
    targetFound,
    targetPlatform: normalizedTarget,
    targetDirection,
    targetArrow,
    pathInstruction,
    distance: targetDistance ? targetDistance.formatted : null,
    distanceMeters: targetDistance ? targetDistance.meters : null,
    walkingTime: targetDistance ? targetDistance.walkingTime : null,
    cleanLines,
    fullText,
  };
}

/**
 * Generates clear, senior-friendly speech reading the board details, route, and distance.
 */
export function buildBoardSpeech(boardAnalysis) {
  const {
    boardTitle,
    facilities,
    allPlatforms,
    targetFound,
    targetPlatform,
    targetDirection,
    distance,
  } = boardAnalysis;

  const parts = [];

  // Read board name/facilities
  if (facilities.length > 0) {
    parts.push(`This board shows ${facilities.join(', ')}.`);
  } else if (boardTitle && boardTitle.length < 50) {
    parts.push(`Board says: ${boardTitle}.`);
  }

  // Tell if target platform is on board
  if (targetPlatform) {
    if (targetFound) {
      parts.push(`Platform ${targetPlatform} is on this board.`);
      if (targetDirection === Direction.RIGHT) {
        parts.push(`Turn to your right. Follow the arrow.`);
      } else if (targetDirection === Direction.LEFT) {
        parts.push(`Turn to your left. Follow the arrow.`);
      } else if (targetDirection === Direction.STRAIGHT) {
        parts.push(`Go straight ahead.`);
      } else {
        parts.push(`Follow the signs for Platform ${targetPlatform}.`);
      }

      if (distance) {
        parts.push(`It is ${distance} away.`);
      }
    } else {
      if (allPlatforms.length > 0) {
        parts.push(
          `This board is for Platform ${allPlatforms.join(' and ')}. Your Platform ${targetPlatform} is not on this sign.`
        );
      } else {
        parts.push(`Platform ${targetPlatform} is not found on this sign. Look around for another board.`);
      }
      if (distance) {
        parts.push(`Distance on this sign is ${distance}.`);
      }
    }
  } else {
    if (allPlatforms.length > 0) {
      parts.push(`Platforms shown on this board are: ${allPlatforms.join(', ')}.`);
    }
    if (distance) {
      parts.push(`Distance is ${distance}.`);
    }
  }

  return parts.join(' ');
}
