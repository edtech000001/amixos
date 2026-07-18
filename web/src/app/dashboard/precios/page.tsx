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
  const { business, currentRole } = useApp();

  if (!business) return null;

  return (
    <PriceSheetScreen
      supabase={supabase}
      businessId={business.id}
      canManage={can.manageBusinessSettings(currentRole)}
      onGenerate={() => router.push('/dashboard/precios/generar')}
    />
  );
}
