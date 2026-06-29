// Per-field show/hide for the job form (businesses.job_field_hidden). Lets a
// business drop the individual fields an industry doesn't use; default shown.
// Each form section auto-hides when ALL its fields are hidden.

export type JobSectionKey = 'location' | 'schedule' | 'workers' | 'notes';

export const JOB_SECTION_KEYS: readonly JobSectionKey[] = ['location', 'schedule', 'workers', 'notes'] as const;

// Fields that can never be hidden (no eye toggle, always on the form) — a job
// fundamentally needs a client and a priority.
export const JOB_FIELDS_ALWAYS_SHOWN: readonly string[] = ['client_id', 'priority'];

// Which standard job fields live in each section — drives the "is the whole
// section hidden?" check and the per-field gating on the form.
export const JOB_SECTION_FIELDS: Record<JobSectionKey, string[]> = {
  location: ['coordinates', 'job_address', 'job_city', 'job_state'],
  // 'scheduled_date' represents Date (start + end); 'time_start' represents
  // Time (start + end + the all-day switch). 'time_end' is no longer a
  // separately toggleable field — it follows 'time_start' on the form.
  schedule: ['scheduled_date', 'time_start', 'total_hours'],
  workers: ['assigned_workers'],
  notes: ['internal_notes', 'worker_notes'],
};

/** Normalise the stored hide map → a plain { key: true } object (hidden only). */
export function parseHiddenFields(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v) out[k] = true;
  }
  return out;
}

export function isJobFieldHidden(hidden: Record<string, boolean>, key: string): boolean {
  return !!hidden[key];
}

// ── Field layout (section + order) ──────────────────────────────────────────
// Sections a field can belong to, in display order. 'general' holds the top
// fields (client/priority/description) and has no heading on the form.
// 'additional' is the home for custom fields — it only ever holds custom
// fields and disappears from the form/settings when it has none.
export type JobLayoutSection = 'general' | 'location' | 'schedule' | 'workers' | 'notes' | 'additional';
export const JOB_LAYOUT_SECTIONS: readonly JobLayoutSection[] = ['general', 'location', 'schedule', 'workers', 'notes', 'additional'] as const;

export interface JobFieldEntry { key: string; section: JobLayoutSection; }

// Default home section + order for every standard field.
export const DEFAULT_JOB_LAYOUT: JobFieldEntry[] = [
  { key: 'client_id', section: 'general' },
  { key: 'priority', section: 'general' },
  { key: 'description', section: 'general' },
  { key: 'coordinates', section: 'location' },
  { key: 'job_address', section: 'location' },
  { key: 'job_city', section: 'location' },
  { key: 'job_state', section: 'location' },
  { key: 'scheduled_date', section: 'schedule' },
  { key: 'time_start', section: 'schedule' },
  { key: 'total_hours', section: 'schedule' },
  { key: 'assigned_workers', section: 'workers' },
  { key: 'worker_notes', section: 'notes' },
  { key: 'internal_notes', section: 'notes' },
];

const DEFAULT_SECTION_FOR = (key: string): JobLayoutSection =>
  DEFAULT_JOB_LAYOUT.find(e => e.key === key)?.section ?? 'general';

/** Merge the stored layout with the full set of valid field keys (standard +
 *  custom). Keeps stored order/section for known keys, drops stale ones, and
 *  appends any missing keys in their default section (custom fields default to
 *  'additional'). Tolerates null/garbage. */
export function parseJobLayout(raw: unknown, allKeys: string[]): JobFieldEntry[] {
  const valid = new Set(allKeys);
  const stored = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: JobFieldEntry[] = [];
  for (const item of stored) {
    const key = (item && typeof item === 'object' ? (item as { key?: unknown }).key : null);
    const section = (item && typeof item === 'object' ? (item as { section?: unknown }).section : null);
    if (typeof key === 'string' && valid.has(key) && !seen.has(key)) {
      const sec = (typeof section === 'string' && (JOB_LAYOUT_SECTIONS as readonly string[]).includes(section))
        ? (section as JobLayoutSection)
        : (key.startsWith('custom:') ? 'additional' : DEFAULT_SECTION_FOR(key));
      seen.add(key);
      out.push({ key, section: sec });
    }
  }
  for (const key of allKeys) {
    if (!seen.has(key)) out.push({ key, section: key.startsWith('custom:') ? 'additional' : DEFAULT_SECTION_FOR(key) });
  }
  return out;
}

/** Field keys assigned to a section, in their layout order. */
export function fieldsInSection(layout: JobFieldEntry[], section: JobLayoutSection): string[] {
  return layout.filter(e => e.section === section).map(e => e.key);
}

/** True if at least one field in the section is still shown (so we render the
 *  section heading). */
export function jobSectionHasVisibleField(hidden: Record<string, boolean>, section: JobSectionKey): boolean {
  return JOB_SECTION_FIELDS[section].some(k => !hidden[k]);
}
