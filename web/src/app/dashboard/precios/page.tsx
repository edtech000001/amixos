'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { can } from '@amixos/shared/lib/permissions';
import { useCallback, useEffect, useState } from 'react';
import { PriceSheetScreen } from '@amixos/shared/screens/dashboard/PriceSheetScreen';
import { priceSyncTargets, fetchAutosyncLinks, setPriceAutosync, type PriceAutosyncLink } from '@amixos/shared/lib/priceSheetSync';
import { useLang } from '@/i18n/LangProvider';
import { confirm, alertMessage } from '@amixos/shared/ui/confirmBus';
import { PriceSyncModal } from '@/components/prices/PriceSyncModal';

export default function PreciosPage() {
  const supabase = createSupabaseClient();
  const router = useRouter();
  const { business, currentRole, refetchBusiness, businesses, roles } = useApp();
  const [syncOpen, setSyncOpen] = useState(false);
  const { t } = useLang();
  const tSync = t.dashboard.settings.priceSheet.sync;
  // Auto-sync links (migration 259) — which company this one mirrors, and
  // which mirror it.
  const [links, setLinks] = useState<PriceAutosyncLink[]>([]);
  const loadLinks = useCallback(() => { void fetchAutosyncLinks(supabase).then(setLinks); }, [supabase]);
  useEffect(() => { loadLinks(); }, [loadLinks, business?.id]);

  if (!business) return null;
  const nameOf = (id: string) => businesses.find(b => b.id === id)?.name ?? tSync.syncedBannerUnknown;
  const follows = links.find(l => l.targetId === business.id) ?? null;
  const isAdminHere = currentRole === 'owner' || currentRole === 'admin';
  // A mirror can't share its own prices onward (no chains).
  const syncTargets = follows ? [] : priceSyncTargets(businesses, roles, business.id);

  return (
    <>
    <PriceSheetScreen
      supabase={supabase}
      businessId={business.id}
      canManage={can.manageBusinessSettings(currentRole)}
      syncedFrom={follows ? {
        name: nameOf(follows.sourceId),
        // Either side's owner/admin may disconnect (the database checks).
        onStop: isAdminHere ? async () => {
          if (!(await confirm({ message: tSync.stopConfirm }))) return;
          const res = await setPriceAutosync(supabase, follows.sourceId, business.id, false);
          if (res.ok === false) await alertMessage({ message: tSync.autoOffFailed.replace('{{error}}', res.error) });
          loadLinks();
        } : undefined,
      } : null}
      onGenerate={() => router.push('/dashboard/precios/generar')}
      onCopyToOthers={syncTargets.length ? () => setSyncOpen(true) : undefined}
          sectionOrder={(business as { price_section_order?: string[] | null }).price_section_order ?? null}
          onSectionOrderChange={async (next) => {
            // Written straight to the business row, then refetched so the
            // invoice "view prices" sheet — which reads the same column via
            // AppContext — picks the new order up without a reload.
            await supabase.from('businesses').update({ price_section_order: next }).eq('id', business.id);
            await refetchBusiness();
          }}
    />
    <PriceSyncModal
      open={syncOpen}
      onClose={() => setSyncOpen(false)}
      supabase={supabase}
      sourceBusinessId={business.id}
      targets={syncTargets}
      links={links}
      onLinksChanged={loadLinks}
      businessName={nameOf}
    />
    </>
  );
}
