'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { can } from '@amixos/shared/lib/permissions';
import { PriceSheetScreen } from '@amixos/shared/screens/dashboard/PriceSheetScreen';

export default function PreciosPage() {
  const supabase = createSupabaseClient();
  const router = useRouter();
  const { business, currentRole, refetchBusiness } = useApp();

  if (!business) return null;

  return (
    <PriceSheetScreen
      supabase={supabase}
      businessId={business.id}
      canManage={can.manageBusinessSettings(currentRole)}
      onGenerate={() => router.push('/dashboard/precios/generar')}
          sectionOrder={(business as { price_section_order?: string[] | null }).price_section_order ?? null}
          onSectionOrderChange={async (next) => {
            // Written straight to the business row, then refetched so the
            // invoice "view prices" sheet — which reads the same column via
            // AppContext — picks the new order up without a reload.
            await supabase.from('businesses').update({ price_section_order: next }).eq('id', business.id);
            await refetchBusiness();
          }}
    />
  );
}
