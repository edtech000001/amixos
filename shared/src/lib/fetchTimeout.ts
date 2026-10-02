// Request timeout for every Supabase call, on both platforms.
//
// WHY THIS EXISTS: supabase-js sets no timeout, and neither did we. A request
// that HANGS (rather than fails) never settles, so an `await` never returns —
// which means a screen's `finally { setLoading(false) }` never runs and its
// `catch { setLoadError(true) }` never fires. The result is a spinner or
// skeleton that stays forever, with no error and no retry affordance, until the
// user force-quits the app. That has bitten this codebase before: see the
// AppState note in mobile/lib/supabase.ts about the auth client stuck holding
// its internal lock, "after which EVERY Supabase call hangs forever".
//
// Hangs come from more than the auth lock: a wifi→cellular handoff mid-request,
// a socket that survived a long suspend, or a proxy that accepts and never
// replies. A timeout converts all of them into an ordinary rejection, which the
// existing error paths already know how to show and retry.
//
// Applied once where the client is built, so it covers every query in the app.
// Realtime is unaffected — websockets don't go through fetch.

/** Data + auth requests. Generous enough for a slow connection on a big page,
 *  short enough that a wedged request doesn't read as "frozen". */
const DEFAULT_TIMEOUT_MS = 20_000;

/** Storage transfers move real bytes over bad jobsite connections — a photo
 *  upload is legitimately slow and must not be cut off at the data timeout. */
const STORAGE_TIMEOUT_MS = 120_000;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url ?? '';
}

/** Path only — never log or throw with the full URL, which can carry tokens. */
function pathOf(url: string): string {
  const q = url.indexOf('?');
  const bare = q === -1 ? url : url.slice(0, q);
  const i = bare.indexOf('/', bare.indexOf('//') + 2);
  return i === -1 ? bare : bare.slice(i);
}

/**
 * Wrap a fetch so every request aborts if the server never answers. A caller's
 * own `init.signal` still works — both can abort the request, whichever fires
 * first.
 */
export function withRequestTimeout(inner: FetchLike): FetchLike {
  return (input, init) => {
    const ms = urlOf(input).includes('/storage/v1/') ? STORAGE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

    const ctrl = new AbortController();
    // Chain the caller's signal rather than replacing it — AbortSignal.any()
    // isn't reliably present on Hermes, so forward the abort by hand.
    const caller = init?.signal;
    if (caller) {
      if (caller.aborted) ctrl.abort();
      else caller.addEventListener('abort', () => ctrl.abort(), { once: true });
    }

    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, ms);

    return inner(input, { ...init, signal: ctrl.signal })
      .catch((err) => {
        // Re-label our own abort so the UI shows "timed out" rather than the
        // generic "Aborted", and so it's distinguishable from a real cancel.
        if (timedOut) {
          throw new Error(
            `Request timed out after ${Math.round(ms / 1000)}s (${pathOf(urlOf(input))})`,
          );
        }
        throw err;
      })
      .finally(() => clearTimeout(timer));
  };
}
