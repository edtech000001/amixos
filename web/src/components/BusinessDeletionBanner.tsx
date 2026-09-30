'use client';

// Warns every member of a business that it is scheduled for deletion
// (migrations 230/232).
//
// Without this, only the owner — who sees the scheduled line in their own
// Danger zone — knows. Everyone else keeps working normally right up to the
// day the business and all its data disappear, which is not a surprise anyone
// should get.
//
// Sits in the sticky banner stack at the TOP of the shell, next to the
// impersonation and Google-sync banners. It used to render after {children},
// which put a "this business will be deleted" warning below the fold on every
// page — the one banner nobody should have to scroll to find.
//
// Owners also get "Cancel deletion" here. That is not a shortcut: it is the
// ONLY caller of restoreBusiness in either app. Before this, a scheduled
// business deletion could be seen (a static amber line in the Danger zone) but
// never undone from inside the product.
//
// The purge date comes from the layout (useBusinessDeletionDate) so the shell
// knows a banner is coming before it lays anything out.

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { formatDateLong } from '@amixos/shared/lib/format';
import { restoreBusiness } from '@amixos/shared/lib/accountDeletion';

export function BusinessDeletionBanner({
  purgeAfter,
  onRestored,
}: {
  purgeAfter: string | null;
  onRestored?: () => void;
}) {
  const { business, currentRole } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.account.danger;
  const dateLoc = locale === 'en' ? 'en-US' : 'es-MX';
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!purgeAfter) return null;

  // Impersonation deliberately narrows this: an owner viewing as a member sees
  // what that member sees, with no owner-only action.
  const canRestore = currentRole === 'owner' && !!business?.id;

  const restore = async () => {
    if (!business?.id || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await restoreBusiness({ apiBaseUrl: getApiBaseUrl(), jwt: await getJwt() }, business.id);
      onRestored?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-red-500/30 bg-red-500/10">
      <AlertTriangle size={16} className="text-red-500 shrink-0" />
      <p className="text-xs font-medium text-ink">
        {failed
          ? t.restoreBusinessFailed
          : t.pendingBusinessBanner.replace('{{date}}', formatDateLong(purgeAfter, dateLoc))}
      </p>
      {canRestore ? (
        <button
          type="button"
          onClick={restore}
          disabled={busy}
          className="ml-auto shrink-0 text-xs font-semibold text-red-600 underline underline-offset-2 hover:text-red-500 disabled:opacity-50"
        >
          {t.restoreBusinessBtn}
        </button>
      ) : null}
    </div>
  );
}
