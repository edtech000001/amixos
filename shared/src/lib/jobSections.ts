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
  schedule: ['scheduled_date', 'time_start', 'time_end', 'total_hours'],
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

/** True if at least one field in the section is still shown (so we render the
 *  section heading). */
export function jobSectionHasVisibleField(hidden: Record<string, boolean>, section: JobSectionKey): boolean {
  return JOB_SECTION_FIELDS[section].some(k => !hidden[k]);
}
