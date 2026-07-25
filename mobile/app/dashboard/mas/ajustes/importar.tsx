import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { ImportClientsModal } from '@/components/ImportClientsModal';
import { ImportDataModal } from '@/components/ImportDataModal';
import { ImportPhotosModal } from '@/components/ImportPhotosModal';

// Ajustes → Importar datos: guided migration hub. The four importers as
// ORDERED steps, because the order matters — jobs match clients + team by
// name, and invoices link to jobs by Project ID. Mirrors the web Ajustes
// "Importar datos" tab.

type StepKey = 'clients' | 'employees' | 'jobs' | 'photos' | 'invoices' | 'payroll' | 'equipment' | 'inventory';

export default function ImportarDatosPage() {
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings;
  const { business, locations } = useApp();
  const supabase = createSupabaseClient();

  const [openStep, setOpenStep] = useState<StepKey | null>(null);
  // Client custom-field templates — the clients import modal needs them.
  const [clientTemplates, setClientTemplates] = useState<{ field_key: string; field_label: string }[]>([]);
  useEffect(() => {
    if (!business) return;
    supabase
      .from('client_field_templates')
      .select('field_key, field_label, field_label_es, field_label_en')
      .eq('business_id', business.id)
      .order('sort_order')
      .then(({ data }: { data: { field_key: string; field_label: string }[] | null }) =>
        setClientTemplates(localizeTemplates(data ?? [], locale)),
      );
  }, [business?.id, locale]);

  const steps: { key: StepKey; title: string; desc: string }[] = [
    { key: 'clients', title: t.importHub.step1Title, desc: t.importHub.step1Desc },
    { key: 'employees', title: t.importHub.step2Title, desc: t.importHub.step2Desc },
    { key: 'jobs', title: t.importHub.step3Title, desc: t.importHub.step3Desc },
    { key: 'photos', title: t.importHub.step4Title, desc: t.importHub.step4Desc },
    { key: 'invoices', title: t.importHub.step5Title, desc: t.importHub.step5Desc },
    { key: 'payroll', title: t.importHub.step6Title, desc: t.importHub.step6Desc },
    { key: 'equipment', title: t.importHub.step7Title, desc: t.importHub.step7Desc },
    { key: 'inventory', title: t.importHub.step8Title, desc: t.importHub.step8Desc },
  ];

  if (!business) return null;

  return (
    <SettingsPageWrapper title={t.tabs.importar}>
      <Text className="text-xs text-muted mb-3">{t.importHub.subtitle}</Text>
      <View className="bg-blue-500/10 border border-blue-100 rounded-xl px-4 py-3 mb-4">
        <Text className="text-xs text-blue-800 leading-5">{t.importHub.orderHint}</Text>
      </View>

      <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
        {steps.map((step, i) => (
          <Pressable
            key={step.key}
            onPress={() => setOpenStep(step.key)}
            className={`flex-row items-center gap-3 px-4 py-4 active:bg-surface ${
              i < steps.length - 1 ? 'border-b border-border-soft' : ''
            }`}
          >
            <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center">
              <Text className="text-sm font-bold text-primary">{i + 1}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-ink">{step.title}</Text>
              <Text className="text-xs text-muted mt-0.5">{step.desc}</Text>
            </View>
            <Text className="text-xl text-faint">›</Text>
          </Pressable>
        ))}
      </View>

      <ImportClientsModal
        open={openStep === 'clients'}
        onClose={() => setOpenStep(null)}
        businessId={business.id}
        templates={clientTemplates}
        locations={locations.map(l => ({ id: l.id, name: l.name }))}
        onImportComplete={() => {}}
      />
      <ImportPhotosModal
        open={openStep === 'photos'}
        businessId={business.id}
        onClose={() => setOpenStep(null)}
      />
      {(['employees', 'jobs', 'invoices', 'payroll', 'equipment', 'inventory'] as const).map(mode => (
        <ImportDataModal
          key={mode}
          open={openStep === mode}
          mode={mode}
          businessId={business.id}
          onClose={() => setOpenStep(null)}
        />
      ))}
    </SettingsPageWrapper>
  );
}
