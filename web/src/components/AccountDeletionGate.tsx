'use client';

// Shown INSTEAD of the dashboard while the signed-in account has a deletion
// scheduled (migration 230). Signing in during the 30-day window is how the
// user gets the offer to restore — Apple allows a grace period as long as it
// is disclosed, and this is where it is disclosed.
//
// Reads the pending row straight from PostgREST: account_deletions has a
// select-own policy, so no API round trip is needed just to know. The restore
// itself goes through the API (service role), because the table deliberately
// has no client-writable policy.

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';
import { formatDateLong } from '@amixos/shared/lib/format';
import { restoreAccount, daysUntilPurge } from '@amixos/shared/lib/accountDeletion';

export function AccountDeletionGate() {
  const { user } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.account.danger;
  const dateLoc = locale === 'en' ? 'en-US' : 'es-MX';

  const [purgeAfter, setPurgeAfter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) { setPurgeAfter(null); return; }
    const supabase = createSupabaseClient();
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('account_deletions')
        .select('purge_after')
        .eq('user_id', user.id)
        .maybeSingle();
      // Table missing (migration 230 not run) → data is null and the gate stays
      // hidden, which is the right failure direction: never lock anyone out.
      if (!cancelled) setPurgeAfter((data as { purge_after?: string } | null)?.purge_after ?? null);
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!purgeAfter) return null;

  const restore = async () => {
    setBusy(true);
    try {
      await restoreAccount({ apiBaseUrl: getApiBaseUrl(), jwt: await getJwt() });
      window.location.reload();
    } catch {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await createSupabaseClient().auth.signOut();
    window.location.href = '/auth/login';
  };

  return (
    <div className="fixed inset-0 z-[110] bg-surface flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card rounded-2xl border border-border-soft shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={26} className="text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-ink">{t.pendingTitle}</h1>
        <p className="mt-2 text-sm text-muted">
          {t.pendingBody
            .replace('{{date}}', formatDateLong(purgeAfter, dateLoc))
            .replace('{{days}}', String(daysUntilPurge(purgeAfter)))}
        </p>

        <Button variant="primary" fullWidth className="mt-6" loading={busy} onClick={restore}>
          {t.restoreBtn}
        </Button>
        <p className="mt-2 text-xs text-faint">{t.restoreNote}</p>

        <button
          type="button"
          onClick={signOut}
          className="mt-6 text-sm font-medium text-faint hover:text-muted"
        >
          {t.signOutBtn}
        </button>
      </div>
    </div>
  );
}
