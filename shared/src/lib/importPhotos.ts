// Bulk photo matching for the import hub's "Subir fotos" step.
//
// The jobs CSV's "Fotos (nombres de archivo)" column stores expected file
// names per job (jobs.import_photo_names, migration 115). This module matches
// a bulk file selection against those pending names ENTIRELY client-side —
// only matched files are ever uploaded, unmatched ones never leave the device.
//
// Match order per file (case-insensitive, path-stripped):
//   1. exact pending name
//   2. name without extension (CSV said "Foto 1", file is "Foto 1.jpg")
//   3. fallback: file name contains the job's Project ID (external_ref),
//      for CSVs without a photos column but ref-bearing names like
//      "Proyecto-0a1a93a3.Foto 1.022914.jpg".
//
// Each pending name is consumed once, so duplicate files can't double-attach.

export interface PendingPhotoJob {
  id: string;
  title: string;
  externalRef: string | null;
  /** jobs.import_photo_names — pending file names, verbatim from the CSV. */
  names: string[];
}

export interface PhotoMatch {
  jobId: string;
  jobTitle: string;
  /** The pending name to clear from the job once this file uploads. */
  pendingName: string;
}

/** Lowercase, trim, drop any folder path — we compare bare file names. */
function normName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  return base.trim().toLowerCase();
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export interface PhotoMatcher {
  match: (fileName: string) => PhotoMatch | null;
  /** Total pending names across all jobs (for the empty/summary states). */
  pendingCount: number;
}

export function buildPhotoMatcher(jobs: PendingPhotoJob[]): PhotoMatcher {
  interface Slot { jobId: string; jobTitle: string; pendingName: string; used: boolean }
  const byExact = new Map<string, Slot[]>();
  const byStem = new Map<string, Slot[]>();
  let pendingCount = 0;

  for (const job of jobs) {
    for (const raw of job.names) {
      const slot: Slot = { jobId: job.id, jobTitle: job.title, pendingName: raw, used: false };
      pendingCount++;
      const n = normName(raw);
      (byExact.get(n) ?? byExact.set(n, []).get(n)!).push(slot);
      const stem = stripExt(n);
      (byStem.get(stem) ?? byStem.set(stem, []).get(stem)!).push(slot);
    }
  }

  // Refs need a minimum length — a 2-char ref would match half the files.
  const refJobs = jobs
    .filter(j => (j.externalRef ?? '').trim().length >= 4)
    .map(j => ({ id: j.id, title: j.title, ref: j.externalRef!.trim().toLowerCase() }));

  const take = (slots: Slot[] | undefined): PhotoMatch | null => {
    const free = slots?.find(s => !s.used);
    if (!free) return null;
    free.used = true;
    return { jobId: free.jobId, jobTitle: free.jobTitle, pendingName: free.pendingName };
  };

  return {
    pendingCount,
    match(fileName: string): PhotoMatch | null {
      const n = normName(fileName);
      const hit = take(byExact.get(n)) ?? take(byStem.get(stripExt(n))) ?? take(byExact.get(stripExt(n)));
      if (hit) return hit;
      const refJob = refJobs.find(j => n.includes(j.ref));
      // Ref fallback doesn't consume a pending name (there is none) — it
      // attaches the file to the job directly.
      return refJob ? { jobId: refJob.id, jobTitle: refJob.title, pendingName: '' } : null;
    },
  };
}

/** Remove one matched name from a job's pending list → new list or null. */
export function removePendingName(names: string[], pendingName: string): string[] | null {
  if (!pendingName) return names.length ? names : null;
  const i = names.indexOf(pendingName);
  const next = i >= 0 ? [...names.slice(0, i), ...names.slice(i + 1)] : names;
  return next.length ? next : null;
}
