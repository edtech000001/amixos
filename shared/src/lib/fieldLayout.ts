// Generic per-field layout (section + within-section order) + show/hide,
// shared by the client, employee and invoice field config. Mirrors the jobs
// model in jobSections.ts but parameterised over an entity's own sections.
//
// Stored shape (businesses.<entity>_field_layout): a JSONB array of
// { key, section } in display order (array order = within-section order).
// null = the built-in default layout. Custom fields use a `custom:<id>` key
// and default into the entity's `customSection`.

export interface FieldEntry<S extends string = string> { key: string; section: S; }

/** Normalise a stored hide map → { key: true } (hidden only). Tolerates junk. */
export function parseHiddenFields(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (v) out[k] = true;
  return out;
}

export function isFieldHidden(hidden: Record<string, boolean>, key: string): boolean {
  return !!hidden[key];
}

export interface FieldLayoutConfig<S extends string> {
  /** All sections, in display order (custom-home section should be last). */
  sections: readonly S[];
  /** Built-in field key → its default home section. */
  defaultSection: Record<string, S>;
  /** Section that custom fields default into. */
  customSection: S;
  /** Built-in field keys grouped by section — drives the section-visible check. */
  sectionFields: Record<S, string[]>;
}

export function makeFieldLayout<S extends string>(cfg: FieldLayoutConfig<S>) {
  const sectionFor = (key: string): S =>
    key.startsWith('custom:') ? cfg.customSection : (cfg.defaultSection[key] ?? cfg.sections[0]);

  /** Merge stored layout with the full key set (standard + custom): keep stored
   *  order/section for known keys, drop stale ones, append missing keys in their
   *  default section. Tolerates null/garbage. */
  function parseLayout(raw: unknown, allKeys: string[]): FieldEntry<S>[] {
    const valid = new Set(allKeys);
    const stored = Array.isArray(raw) ? raw : [];
    const seen = new Set<string>();
    const out: FieldEntry<S>[] = [];
    for (const item of stored) {
      const key = item && typeof item === 'object' ? (item as { key?: unknown }).key : null;
      const section = item && typeof item === 'object' ? (item as { section?: unknown }).section : null;
      if (typeof key === 'string' && valid.has(key) && !seen.has(key)) {
        const sec = (typeof section === 'string' && (cfg.sections as readonly string[]).includes(section))
          ? (section as S)
          : sectionFor(key);
        seen.add(key);
        out.push({ key, section: sec });
      }
    }
    for (const key of allKeys) if (!seen.has(key)) out.push({ key, section: sectionFor(key) });
    return out;
  }

  /** Field keys assigned to a section, in their layout order. */
  const fieldsInSection = (layout: FieldEntry<S>[], section: S): string[] =>
    layout.filter(e => e.section === section).map(e => e.key);

  /** True if at least one built-in field in the section is still shown. */
  const sectionHasVisibleField = (hidden: Record<string, boolean>, section: S): boolean =>
    (cfg.sectionFields[section] ?? []).some(k => !hidden[k]);

  return { parseLayout, fieldsInSection, sectionHasVisibleField, sectionFor };
}
