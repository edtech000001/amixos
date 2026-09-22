'use client';

// Account + business deletion, web (App Store guideline 5.1.1(v) — an app that
// offers account creation must let the user delete it from inside the app;
// this is the web half of the same feature).
//
// Two separate actions, because they destroy different things:
//   • Delete my account — refused by the API while the caller still owns a
//     business with other people in it, since businesses.owner_id cascades and
//     would take the team's data with it. The blockers come back named.
//   • Delete this business — the owner's own call, allowed even with members.
//     It is also the way OUT of the block above.
//
// Both schedule a 30-day window rather than destroying anything now; the gate
// (AccountDeletionGate) offers the restore until it closes.

import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { createSupabaseClient } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatDateLong } from '@amixos/shared/lib/format';
import {
  fetchAccountStatus,
  requestAccountDeletion,
  requestBusinessDeletion,
  type AccountStatus,
  type DeletionBlocker,
} from '@amixos/shared/lib/accountDeletion';

type Target = { kind: 'account' } | { kind: 'business'; businessId: string; name: string | null };

export function AccountDangerZone() {
  const { business } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.account.danger;
  const dateLoc = locale === 'en' ? 'en-US' : 'es-MX';

  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<DeletionBlocker[] | null>(null);

  const ctx = async () => ({ apiBaseUrl: getApiBaseUrl(), jwt: await getJwt() });

  const load = async () => {
    try {
      setStatus(await fetchAccountStatus(await ctx()));
    } catch {
      setStatus(null); // endpoint unreachable (API not deployed yet) — stay quiet
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [business?.id]);

  const ownsActive = status?.ownedBusinesses.some(b => b.businessId === business?.id) ?? false;
  const activePending = status?.pendingBusinessDeletions.find(p => p.businessId === business?.id);

  const open = (next: Target) => {
    setTarget(next);
    setTyped('');
    setError(null);
    setBlockers(null);
  };

  const confirm = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      const c = await ctx();
      if (target.kind === 'account') {
        await requestAccountDeletion(c);
        // Signed out immediately: the account is gone as far as the user is
        // concerned, and signing back in is what offers the restore.
        await createSupabaseClient().auth.signOut();
        window.location.href = '/auth/login';
        return;
      }
      await requestBusinessDeletion(c, target.businessId);
      setTarget(null);
      await load();
    } catch (e) {
      const err = e as Error & { code?: string; blockers?: DeletionBlocker[] };
      if (err.code === 'owns_business_with_members' && err.blockers?.length) {
        setBlockers(err.blockers);
      } else {
        setError(t.failed);
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmWord = t.confirmWord;
  const canConfirm = typed.trim().toUpperCase() === confirmWord;

  return (
    <div className="bg-card rounded-2xl border border-red-500/30 shadow-sm p-6">
      <h2 className="text-base font-semibold text-red-600 mb-1">{t.heading}</h2>

      {/* Business deletion — only for the owner of the ACTIVE business. */}
      {ownsActive ? (
        <div className="mt-4 pt-4 border-t border-border-soft first:mt-0 first:pt-0 first:border-0">
          <p className="text-sm font-semibold text-ink">{t.deleteBusiness}</p>
          <p className="text-xs text-muted mt-1 max-w-xl">{t.deleteBusinessBody}</p>
          {activePending ? (
            <p className="text-xs font-semibold text-amber-600 mt-2">
              {t.scheduledBusiness.replace('{{date}}', formatDateLong(activePending.purgeAfter, dateLoc))}
            </p>
          ) : (
            <Button
              variant="secondary"
              className="mt-3 text-red-600 border-red-500/30 hover:bg-red-500/10"
              onClick={() => open({ kind: 'business', businessId: business!.id, name: business!.name })}
            >
              <Trash2 size={14} className="mr-1.5" /> {t.deleteBusiness}
            </Button>
          )}
        </div>
      ) : null}

      {/* Account deletion — always available (Apple requires it). */}
      <div className={`mt-4 pt-4 ${ownsActive ? 'border-t border-border-soft' : ''}`}>
        <p className="text-sm font-semibold text-ink">{t.deleteAccount}</p>
        <p className="text-xs text-muted mt-1 max-w-xl">{t.deleteAccountBody}</p>
        <Button
          variant="secondary"
          className="mt-3 text-red-600 border-red-500/30 hover:bg-red-500/10"
          onClick={() => open({ kind: 'account' })}
        >
          <Trash2 size={14} className="mr-1.5" /> {t.deleteAccount}
        </Button>
      </div>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={blockers ? t.blockedTitle : t.confirmTitle}
        size="md"
      >
        {blockers ? (
          <div>
            <p className="text-sm text-muted">{t.blockedBody}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {blockers.map(b => (
                <li key={b.businessId} className="rounded-xl border border-border px-3 py-2 text-sm text-ink">
                  {t.blockedMember
                    .replace('{{name}}', b.name ?? '—')
                    .replace('{{count}}', String(b.otherMembers))}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={() => setTarget(null)}>{t.cancelBtn}</Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
              <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-ink">
                {target?.kind === 'business'
                  ? t.confirmBusinessBody
                      .replace('{{name}}', target.name ?? '—')
                      .replace('{{date}}', purgeDatePreview(dateLoc))
                  : t.confirmBody.replace('{{date}}', purgeDatePreview(dateLoc))}
              </p>
            </div>
            <div className="mt-4">
              <Input
                label={t.typeToConfirm.replace('{{word}}', confirmWord)}
                value={typed}
                onChange={e => setTyped(e.target.value)}
                autoFocus
              />
            </div>
            {error ? <p className="mt-3 text-xs text-red-500">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setTarget(null)}>{t.cancelBtn}</Button>
              <Button
                variant="primary"
                className="bg-red-600 hover:bg-red-700"
                disabled={!canConfirm || busy}
                loading={busy}
                onClick={confirm}
              >
                {t.confirmBtn}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** The date the window closes, shown BEFORE the request exists. The server owns
 *  the real value (returned on success) — this is the same 30 days, for copy. */
function purgeDatePreview(locale: string): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return formatDateLong(d, locale);
}
