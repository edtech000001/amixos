// Recovery from a wedged Supabase auth state.
//
// @supabase/ssr keeps the session in CHUNKED cookies (sb-<ref>-auth-token.0,
// .1, …). Those chunks can end up inconsistent — an old session needed two and
// the new one needs one, leaving an orphan; or the apex/www split writes a
// cookie the other host cannot read. When that happens the auth client can
// hang or throw while initializing, and because everything downstream awaits
// it, the app renders skeletons forever.
//
// It is unrecoverable from inside the app: the fix is clearing site data,
// which no small-business owner is going to discover. So we detect the wedge
// and clear the auth cookies ourselves.

/** Deletes every Supabase auth cookie, on both the exact host and the
 *  registrable domain — a cookie set on ".amixos.com" is not removed by
 *  expiring one scoped to "amixos.com", and either can be the bad one. */
export function clearSupabaseAuthCookies(): void {
  if (typeof document === 'undefined') return;

  const names = document.cookie
    .split(';')
    .map((c) => c.split('=')[0]?.trim())
    .filter((n): n is string => !!n && n.startsWith('sb-'));

  const host = window.location.hostname;
  // "app.amixos.com" → ["app.amixos.com", ".amixos.com"]; a bare host or an IP
  // yields just itself.
  const parts = host.split('.');
  const domains = [host, undefined as string | undefined];
  if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));

  for (const name of names) {
    for (const domain of domains) {
      document.cookie =
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/` +
        (domain ? `; domain=${domain}` : '');
    }
  }

  // The client can also mirror the session into storage depending on version.
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('sb-')) localStorage.removeItem(k);
    }
  } catch { /* private mode / blocked storage — cookies were the point */ }
}

/** Rejects if `promise` has not settled within `ms`. Used to put a ceiling on
 *  auth calls that would otherwise hang indefinitely. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// One attempt per tab. Without this, a login page that also fails to resolve
// would bounce the user between /auth/login and itself forever.
const RECOVERY_FLAG = 'amixos_auth_recovered';

export function hasAttemptedRecovery(): boolean {
  try { return sessionStorage.getItem(RECOVERY_FLAG) === '1'; } catch { return false; }
}

/** Clears the wedged cookies and reloads into the login screen. Returns false
 *  if recovery was already tried in this tab, so the caller can surface a real
 *  error instead of looping. */
export function recoverFromWedgedAuth(): boolean {
  if (hasAttemptedRecovery()) return false;
  try { sessionStorage.setItem(RECOVERY_FLAG, '1'); } catch { /* best effort */ }
  clearSupabaseAuthCookies();
  window.location.href = '/auth/login';
  return true;
}
