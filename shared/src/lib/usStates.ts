// US state name ↔ 2-letter abbreviation lookup, used by list/map searches
// so the user can type "Nebraska" (or even "neb") and still match rows
// stored as "NE". Addresses are stored abbreviated everywhere in the app
// (USPS standard, NWS-compatible, compact in lists) — this just lets the
// search input speak both languages.
//
// Includes the 50 states + DC + the territories that show up in our SAME
// codes table (PR, VI, AS, GU, MP, FM, MH, PW, UM). Anything missing here
// just falls through to the regular substring search — no errors.

import type { Locale } from '../i18n/locales';

export const US_STATE_NAME_TO_ABBR: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'district of columbia': 'DC', 'washington dc': 'DC',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY',
  // US territories
  'puerto rico': 'PR', 'virgin islands': 'VI', 'us virgin islands': 'VI',
  'american samoa': 'AS', 'guam': 'GU',
  'northern mariana islands': 'MP', 'mariana islands': 'MP',
  'federated states of micronesia': 'FM', 'micronesia': 'FM',
  'marshall islands': 'MH', 'palau': 'PW',
  'us minor outlying islands': 'UM',
};

// Reverse: 2-letter abbr → canonical full name.
export const US_STATE_ABBR_TO_NAME: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [name, abbr] of Object.entries(US_STATE_NAME_TO_ABBR)) {
    // Skip the alias entries — keep only the canonical (first) name per abbr.
    // Title-case, but keep connector words lowercase ("District of Columbia").
    if (!out[abbr]) {
      out[abbr] = name
        .split(' ')
        .map((w) => (w === 'of' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(' ');
    }
  }
  return out;
})();

// Spanish state names that differ from the English form. Everything not
// listed here (California, Texas, Florida, …) is spelled the same in both.
const US_STATE_NAME_ES_OVERRIDES: Record<string, string> = {
  HI: 'Hawái',
  LA: 'Luisiana',
  MS: 'Misisipi',
  MO: 'Misuri',
  NH: 'Nuevo Hampshire',
  NJ: 'Nueva Jersey',
  NM: 'Nuevo México',
  NY: 'Nueva York',
  NC: 'Carolina del Norte',
  ND: 'Dakota del Norte',
  OR: 'Oregón',
  PA: 'Pensilvania',
  SC: 'Carolina del Sur',
  SD: 'Dakota del Sur',
  WV: 'Virginia Occidental',
  DC: 'Distrito de Columbia',
  VI: 'Islas Vírgenes',
  MP: 'Islas Marianas del Norte',
  MH: 'Islas Marshall',
};

/**
 * Full display name for a state value as stored on a row ("CO" → "Colorado",
 * or "Nueva York" when locale is 'es'). Values that aren't a known 2-letter
 * abbreviation (already-spelled-out names, foreign states) pass through
 * unchanged, so this is safe to call on free-text fields.
 */
export function usStateName(value: string, locale: Locale): string {
  const trimmed = value.trim();
  if (trimmed.length !== 2) return trimmed;
  const abbr = trimmed.toUpperCase();
  if (locale === 'es' && US_STATE_NAME_ES_OVERRIDES[abbr]) {
    return US_STATE_NAME_ES_OVERRIDES[abbr];
  }
  return US_STATE_ABBR_TO_NAME[abbr] ?? trimmed;
}

/**
 * Best-effort normalization of a free-text state into its 2-letter
 * abbreviation ("Nebraska" → "NE", "ne" → "NE"). Unknown values pass through
 * unchanged — used when hydrating legacy free-text rows into a state picker.
 */
export function toUsStateAbbr(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return US_STATE_NAME_TO_ABBR[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Build the list of extra search terms implied by a query. If the query
 * matches a state name as a prefix (e.g., "nebr" → Nebraska), the state's
 * abbreviation gets added ("ne"). If the query is exactly a 2-letter abbr
 * (e.g., "ne"), the full name gets added ("nebraska") — so a user who
 * already speaks abbr but the field happens to store full names still hits.
 *
 * Returns lowercase strings. Empty array when nothing matches.
 */
export function expandStateQuery(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const extra = new Set<string>();
  // Full-name prefix match → add abbreviation. Require at least 2 chars to
  // avoid "n" matching every state starting with N.
  if (q.length >= 2) {
    for (const [name, abbr] of Object.entries(US_STATE_NAME_TO_ABBR)) {
      if (name.startsWith(q)) extra.add(abbr.toLowerCase());
    }
  }
  // 2-char query that's a real abbr → add the full name.
  if (q.length === 2 && US_STATE_ABBR_TO_NAME[q.toUpperCase()]) {
    extra.add(US_STATE_ABBR_TO_NAME[q.toUpperCase()].toLowerCase());
  }
  return Array.from(extra);
}

// Cache compiled word-boundary regexes per term so we don't rebuild them
// on every keystroke / row. Keys are 2-letter abbreviations like "ne".
const STATE_TERM_REGEX_CACHE = new Map<string, RegExp>();
function stateTermRegex(term: string): RegExp {
  let re = STATE_TERM_REGEX_CACHE.get(term);
  if (!re) {
    re = new RegExp(`\\b${term}\\b`, 'i');
    STATE_TERM_REGEX_CACHE.set(term, re);
  }
  return re;
}

/**
 * Substring match that also tries state-name ↔ abbreviation expansions.
 * Use this in place of `haystack.toLowerCase().includes(query.toLowerCase())`
 * in any list search where the user might type a full state name.
 *
 * For 2-letter abbreviation expansions we require WORD-BOUNDARY matching
 * (\bne\b) so a "Nebraska" query doesn't accidentally match "Stone",
 * "Larned", "Sanderson", etc. via the bare "ne" substring.
 */
/** Lowercase + strip accents so search is accent-insensitive — typing "Jose"
 *  finds "José", "Mejia" finds "Mejía". State names/abbrevs are ASCII, so this
 *  never affects the state-expansion matching below. */
export function foldSearchText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function searchMatches(haystack: string, query: string): boolean {
  const q = foldSearchText(query.trim());
  if (!q) return true;
  const hay = foldSearchText(haystack);
  if (hay.includes(q)) return true;
  for (const term of expandStateQuery(q)) {
    if (term.length === 2) {
      if (stateTermRegex(term).test(hay)) return true;
    } else {
      if (hay.includes(term)) return true;
    }
  }
  return false;
}

/**
 * Variant that takes a pre-built array of state-expansion terms — saves
 * the per-row expansion cost in tight loops (e.g., map's pinMatchesQuery
 * which iterates many fields per pin). Caller computes once via
 * `expandStateQuery(q)`, then passes in.
 */
export function haystackMatchesWithStates(
  haystack: string,
  rawQuery: string,
  stateTerms: string[],
): boolean {
  const hay = haystack.toLowerCase();
  if (hay.includes(rawQuery)) return true;
  for (const term of stateTerms) {
    if (term.length === 2) {
      if (stateTermRegex(term).test(hay)) return true;
    } else {
      if (hay.includes(term)) return true;
    }
  }
  return false;
}
