// Autoname — normalize messy job titles ("7 tower suwanne river" →
// "7 Tower Repair - Suwanne River"). Port of the owner's old AppSheet/Sheets
// script, improved:
//   * detects the repair TYPE from the job's custom fields, description and
//     title (the sheet had a dedicated Type column; here we scan for the same
//     keywords: Desarmar → Disassembly, Reparación → Repair, Grain Bin)
//   * title-cases WITHOUT destroying existing capitals ("OH Repair", "LLC")
//   * the separator hyphen is only inserted when there's actually a field
//     name after the keyword phrase (the script left a dangling " -")
//   * idempotent — running it twice changes nothing
//
// GATED: pilot feature for specific businesses only (same pattern as other
// alpha gates). Everyone else never sees the button.

export const AUTONAME_BUSINESS_IDS = [
  'd0f73474-b503-41d5-a33f-8a95fff94c17', // The Pivot Builders & Construction LLC
  '27e313fa-fd2f-44e8-b47d-31041a16b09f', // Champion Built LLC
  'bcb5bfdc-af63-4f80-a072-7077b2adaf19', // Blessing Pivots LLC
];

export function autonameEnabled(businessId: string | null | undefined): boolean {
  return !!businessId && AUTONAME_BUSINESS_IDS.includes(businessId);
}

export type AutonameType = 'disassembly' | 'repair' | 'grainbin' | null;

/** Find the repair type in whatever the job carries: custom-field values
 *  (the imported Type column), the description, then the title itself. */
export function detectAutonameType(src: {
  title?: string | null;
  description?: string | null;
  customFields?: Record<string, unknown> | null;
}): AutonameType {
  const hay = [
    ...Object.values(src.customFields ?? {}).map((v) => String(v ?? '')),
    src.description ?? '',
    src.title ?? '',
  ]
    .join(' ')
    .toLowerCase();
  if (/grain\s*bin/.test(hay)) return 'grainbin';
  if (/desarmar|disassem/.test(hay)) return 'disassembly';
  // \brepar\b: the imports abbreviate ("Repar 1 span Zimmatic").
  if (/reparaci|repair|\brepar\b/.test(hay)) return 'repair';
  return null;
}

/** Normalize one job title. Pure — safe to preview before writing.
 *  `description` feeds the span-count fallback for titles that carry no
 *  keyword at all ("Zimmactic" + "Repar 1 span Zimmatic…" →
 *  "1 Tower Repair - Zimmactic"). */
export function autonameJobTitle(raw: string, type: AutonameType, description?: string | null): string {
  let t = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return t;

  // Title-case: uppercase each word's first letter, PRESERVE the rest (keeps
  // "OH", "LLC", "48x8R" intact — the old script lowercased them away).
  t = t.replace(/(^|[\s(-])([a-zñáéíóúü])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
  t = t.replace(/Córner/g, 'Corner');
  // Their vocabulary: a pivot "span" IS a tower; imports also abbreviate
  // Repair as "Repar". Canonicalize before the keyword logic runs.
  t = t.replace(/\bSpans\b/g, 'Towers').replace(/\bSpan\b/g, 'Tower');
  t = t.replace(/\bRepar\b/g, 'Repair').replace(/\bReparaci[oó]n\b/g, 'Repair');

  // Insert the type word after the (last) keyword, unless some type word is
  // already present anywhere ("1 Tower Disassembly & 1 Tower Assembly" must
  // not gain a second "Repair").
  const typeWord = type === 'disassembly' ? 'Disassembly' : type === 'repair' ? 'Repair' : null;
  if (typeWord && !/\b(Disassembly|Repair|Assembly)\b/.test(t)) {
    const m = t.match(/\b(Towers|Tower|Corner)\b(?![\s\S]*\b(?:Towers|Tower|Corner)\b)/);
    if (m) t = t.replace(m[0], `${m[0]} ${typeWord}`);
  }

  if (type === 'grainbin' && !/^Grain Bin\b/i.test(t)) t = `Grain Bin ${t}`;

  // Keyword-less titles (brand or client name only): pull the span/tower count
  // from the DESCRIPTION and prefix the work phrase. "Zimmactic" with
  // "Repar 1 span Zimmatic 179×9" → "1 Tower Repair - Zimmactic".
  if (type !== 'grainbin' && !/\b(Towers|Tower|Corner)\b/.test(t)) {
    const m = (description ?? '').match(/(\d+)\s*(?:spans?|towers?|torres?)\b/i);
    if (m) {
      const n = parseInt(m[1], 10);
      const tw = typeWord ? ` ${typeWord}` : '';
      t = `${n} ${n === 1 ? 'Tower' : 'Towers'}${tw} - ${t}`;
    }
  }

  // Separator: whatever follows the keyword phrase is the field/site name —
  // "7 Tower Repair Suwanne River" → "7 Tower Repair - Suwanne River". Only
  // when a remainder exists and no hyphen is present yet.
  if (!t.includes('-')) {
    const m = t.match(/^(.*\b(?:Towers|Tower|Corner)(?: (?:Disassembly|Repair|Assembly))?)\s+(.+)$/);
    // A remainder that still contains a work-type word is part of the work
    // phrase ("Tower & Corner OH Repair"), not a field name — no separator.
    if (m && !/\b(Disassembly|Repair|Assembly)\b/i.test(m[2])) t = `${m[1]} - ${m[2]}`;
  }

  return t.replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim();
}
