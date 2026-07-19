'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { AddonStoreScreen } from '@amixos/shared/screens/dashboard/AddonStoreScreen';
import { getModuleById } from '@amixos/shared/modules/registry';
import { notifyModulesChanged } from '@amixos/shared/modules/useEnabledModules';
import { logAudit } from '@amixos/shared/lib/audit';

export default function TiendaPage() {
  const supabase = createSupabaseClient();
  const router = useRouter();
  const { business, currentRole } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings.store;
  const modulesDict = full.dashboard.modules.list;

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

  // Persist the toggle + audit log. Called only AFTER the user confirms.
  const persistToggle = async (moduleId: string, enable: boolean) => {
    if (!business) return;
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
    // Tell any mounted useEnabledModules() consumers (Sidebar, etc.) to
    // refetch so the new icon appears without a full reload.
    notifyModulesChanged();
  };

  // Wrap the toggle action with a confirmation dialog. Modules are optional
  // features and the action is reversible — but a tap may have been
  // accidental, so the confirm step prevents data confusion when modules
  // are first built out.
  const onToggle = async (moduleId: string, enable: boolean) => {
    const def = getModuleById(moduleId);
    const entry = def
      ? (modulesDict as unknown as Record<string, { name: string } | undefined>)[def.i18nKey]
      : undefined;
    const name = entry?.name ?? moduleId;

    const title = (enable ? t.enableConfirmTitle : t.disableConfirmTitle).replace('{{name}}', name);
    const body = enable ? t.enableConfirmBody : t.disableConfirmBody;

    const ok = await confirm({ title, message: body, destructive: !enable });
    if (!ok) return;
    void persistToggle(moduleId, enable);
  };

  return (
    <div className="p-6">
      <div className="bg-card rounded-2xl border border-border-soft">
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
