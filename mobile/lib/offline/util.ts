// Distinguish "couldn't reach the server" from "the server rejected this".
//
// This is the crux of the offline queue: a network/transport failure means we
// should QUEUE the write and retry later; a real error (RLS denial, constraint
// violation, bad payload) means retrying will never succeed, so we surface it.
//
// supabase-js wraps fetch — transport failures usually surface as a thrown
// TypeError ("Network request failed") rather than a PostgrestError. We also
// treat AbortError/timeouts as transient.
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
