'use client';

// Warns every member of a business that it is scheduled for deletion
// (migrations 230/232).
//
// Without this, only the owner — who sees the scheduled line in their own
// Danger zone — knows. Everyone else keeps working normally right up to the
// day the business and all its data disappear, which is not a surprise anyone
// should get.
//
// Reads business_deletions directly: 232 makes the row readable by any member
// of that business, and it carries nothing sensitive (a date and who asked).

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { formatDateLong } from '@amixos/shared/lib/format';

export function BusinessDeletionBanner() {
  const { business } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.account.danger;
  const dateLoc = locale === 'en' ? 'en-US' : 'es-MX';
  const [purgeAfter, setPurgeAfter] = useState<string | null>(null);

  useEffect(() => {
    if (!business?.id) { setPurgeAfter(null); return; }
    let cancelled = false;
    void (async () => {
      const { data } = await createSupabaseClient()
        .from('business_deletions')
        .select('purge_after')
        .eq('business_id', business.id)
        .maybeSingle();
      // Table missing (migration 230 not run) → null → no banner. Never invent
      // a deletion warning out of an error.
      if (!cancelled) setPurgeAfter((data as { purge_after?: string } | null)?.purge_after ?? null);
    })();
    return () => { cancelled = true; };
  }, [business?.id]);

  if (!purgeAfter) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-red-500/30 bg-red-500/10">
      <AlertTriangle size={16} className="text-red-500 shrink-0" />
      <p className="text-xs font-medium text-ink">
        {t.pendingBusinessBanner.replace('{{date}}', formatDateLong(purgeAfter, dateLoc))}
      </p>
    </div>
  );
}
