'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { AddonStoreScreen } from '@amixos/shared/screens/dashboard/AddonStoreScreen';
import { logAudit } from '@amixos/shared/lib/audit';

export default function TiendaPage() {
  const supabase = createSupabaseClient();
  const router = useRouter();
  const { business, currentRole } = useApp();

  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    const { data } = await supabase
      .from('business_modules')
      .select('module_key, is_active')
      .eq('business_id', business.id)
      .eq('is_active', true);
    const ids = new Set(((data ?? []) as Array<{ module_key: string }>).map(r => r.module_key));
    setEnabledIds(ids);
    setLoading(false);
  }, [business, supabase]);

  useEffect(() => { void load(); }, [load]);

  const onToggle = async (moduleId: string, enable: boolean) => {
    if (!business) return;
    // Upsert: business_modules has a unique (business_id, module_key) index,
    // so upsert with onConflict on that pair flips is_active without losing
    // any module-specific settings stored in the JSONB column.
    await supabase
      .from('business_modules')
      .upsert(
        {
          business_id: business.id,
          module_key: moduleId,
          is_active: enable,
        },
        { onConflict: 'business_id,module_key' },
      );
    await logAudit(
      supabase,
      business.id,
      enable ? 'module.enabled' : 'module.disabled',
      'module',
      null,
      { module_key: moduleId },
    );
    await load();
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Link href="/dashboard/ajustes" className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={18} className="text-gray-600" />
        </Link>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100">
        <AddonStoreScreen
          enabledIds={enabledIds}
          currentRole={currentRole}
          loading={loading}
          onToggle={onToggle}
          onOpen={(id) => router.push(`/dashboard/modulos/${id}`)}
        />
      </div>
    </div>
  );
}
