// Documents attached to jobs (migration 148) — contracts, permits, signed
// paperwork. Objects live in the PRIVATE business-private bucket under
// jobdocs/<business_id>/<job_id>/<uid>/<filename>; open via signedUrl()
// from ./storageUrls. Mirrors the job-photos/files patterns.

export interface JobDocument {
  id: string;
  business_id: string;
  job_id: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_by: string | null;
  created_at: string;
}

export const JOB_DOCS_BUCKET = 'business-private';

/** Per-file cap — same as the Files module. */
export const JOB_DOC_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

/** Count cap per job, so one job can't balloon a business's storage. */
export const MAX_DOCS_PER_JOB = 20;

export function jobDocPath(businessId: string, jobId: string, uid: string, filename: string): string {
  // businessId must be foldername[2] — the storage policies and the
  // business_storage_bytes usage RPC both key on that segment.
  return `jobdocs/${businessId}/${jobId}/${uid}/${filename}`;
}

export function jobDocUid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
