// A short, LOCALE-NEUTRAL display code for a job, so EVERY job has a visible ID
// — including ones created before reference numbers existed and ones with no
// imported project id. Derived deterministically from the job UUID, so it's
// stable and needs no migration/backfill. Format: "AX-3F9C2A".
//
// Proposals keep their estimate number and imported jobs keep their external
// reference; this is the universal fallback that guarantees a code either way.

export function jobShortCode(id: string | null | undefined): string {
  if (!id) return '';
  // UUIDs are hex — take the first 6 hex chars, uppercased. No language in it,
  // so it reads the same for a Spanish or English user.
  const hex = id.replace(/[^a-f0-9]/gi, '').toUpperCase();
  return hex ? `AX-${hex.slice(0, 6)}` : '';
}

/**
 * The reference label to show for a job: its estimate/proposal number if it is
 * a proposal, else an imported project id, else the derived short code. Never
 * empty for a real job.
 */
export function jobRefLabel(job: {
  estimateNumber?: string | null;
  externalRef?: string | null;
  id?: string | null;
}): string {
  return job.estimateNumber?.trim() || job.externalRef?.trim() || jobShortCode(job.id);
}
