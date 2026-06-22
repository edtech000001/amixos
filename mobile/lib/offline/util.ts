// Distinguish "couldn't reach the server" from "the server rejected this".
//
// This is the crux of the offline queue: a network/transport failure means we
// should QUEUE the write and retry later; a real error (RLS denial, constraint
// violation, bad payload) means retrying will never succeed, so we surface it.
//
// supabase-js wraps fetch — transport failures usually surface as a thrown
// TypeError ("Network request failed") rather than a PostgrestError. We also
// treat AbortError/timeouts as transient.
// A unique/primary-key violation means the row is ALREADY there — i.e. a
// previously-queued insert actually landed (its ack was just lost), so a retry
// should be treated as success, not a failure. Relies on client-generated ids
// (so a duplicate insert collides instead of creating a second row).
export function isDuplicateError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string; message?: string };
  const msg = (e.message ?? '').toLowerCase();
  return e.code === '23505' || msg.includes('duplicate key') || msg.includes('already exists');
}

// An expired/invalid JWT (e.g. the access token lapsed while the app sat
// offline for an hour). This is TRANSIENT — a session refresh fixes it — so we
// treat it like a network error (re-queue + refresh) instead of a permanent
// failure. PostgREST reports JWT expiry as code 'PGRST301' / HTTP 401.
export function isAuthError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string; message?: string; status?: number };
  const msg = (e.message ?? '').toLowerCase();
  return (
    e.code === 'PGRST301' ||
    e.status === 401 ||
    msg.includes('jwt expired') ||
    msg.includes('jwt') ||
    msg.includes('token has expired') ||
    msg.includes('token expired') ||
    msg.includes('not authenticated') ||
    msg.includes('unauthorized')
  );
}

export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { message?: string; name?: string; code?: string };
  const msg = (e.message ?? '').toLowerCase();
  const name = (e.name ?? '').toLowerCase();
  return (
    name === 'aborterror' ||
    name === 'typeerror' || // RN throws TypeError("Network request failed")
    msg.includes('network request failed') ||
    msg.includes('network error') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('connection') ||
    e.code === 'ETIMEDOUT' ||
    e.code === 'ECONNABORTED'
  );
}
