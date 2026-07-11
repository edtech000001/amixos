// Ajustes → Precios (price sheet). Thin wrapper mounting the shared screen.

import { useMemo } from 'react';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { can } from '@amixos/shared/lib/permissions';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { PriceSheetScreen } from '@amixos/shared/screens/dashboard/PriceSheetScreen';

export default function PreciosSettings() {
  const { t: full } = useLang();
  const t = full.dashboard.settings;
  const { business, currentRole } = useApp();
  const supabase = useMemo(() => createSupabaseClient(), []);

  if (!business) return null;

  return (
    <SettingsPageWrapper title={t.tabs.precios}>
      <PriceSheetScreen
        supabase={supabase}
        businessId={business.id}
        canManage={can.manageBusinessSettings(currentRole)}
      />
    </SettingsPageWrapper>
  );
}
