import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { ImportClientsModal } from '@/components/ImportClientsModal';
import { ImportDataModal } from '@/components/ImportDataModal';
import { ImportPhotosModal } from '@/components/ImportPhotosModal';

// Ajustes → Importar datos: guided migration hub. The four importers as
// ORDERED steps, because the order matters — jobs match clients + team by
// name, and invoices link to jobs by Project ID. Mirrors the web Ajustes
// "Importar datos" tab.

type StepKey = 'clients' | 'employees' | 'jobs' | 'photos' | 'invoices';

export default function ImportarDatosPage() {
  const { t: full } = useLang();
  const t = full.dashboard.settings;
  const { business } = useApp();
  const supabase = createSupabaseClient();

  const [openStep, setOpenStep] = useState<StepKey | null>(null);
  // Client custom-field templates — the clients import modal needs them.
  const [clientTemplates, setClientTemplates] = useState<{ field_key: string; field_label: string }[]>([]);
  useEffect(() => {
    if (!business) return;
    supabase
      .from('client_field_templates')
      .select('field_key, field_label')
      .eq('business_id', business.id)
      .order('sort_order')
      .then(({ data }: { data: { field_key: string; field_label: string }[] | null }) =>
        setClientTemplates(data ?? []),
      );
  }, [business?.id]);

  const steps: { key: StepKey; title: string; desc: string }[] = [
    { key: 'clients', title: t.importHub.step1Title, desc: t.importHub.step1Desc },
    { key: 'employees', title: t.importHub.step2Title, desc: t.importHub.step2Desc },
    { key: 'jobs', title: t.importHub.step3Title, desc: t.importHub.step3Desc },
    { key: 'photos', title: t.importHub.step4Title, desc: t.importHub.step4Desc },
    { key: 'invoices', title: t.importHub.step5Title, desc: t.importHub.step5Desc },
  ];

  if (!business) return null;

  return (
    <SettingsPageWrapper title={t.tabs.importar}>
      <Text className="text-xs text-gray-500 mb-3">{t.importHub.subtitle}</Text>
      <View className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
        <Text className="text-xs text-blue-800 leading-5">{t.importHub.orderHint}</Text>
      </View>

      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {steps.map((step, i) => (
          <Pressable
            key={step.key}
            onPress={() => setOpenStep(step.key)}
            className={`flex-row items-center gap-3 px-4 py-4 active:bg-gray-50 ${
              i < steps.length - 1 ? 'border-b border-gray-50' : ''
            }`}
          >
            <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center">
              <Text className="text-sm font-bold text-primary">{i + 1}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900">{step.title}</Text>
              <Text className="text-xs text-gray-500 mt-0.5">{step.desc}</Text>
            </View>
            <Text className="text-xl text-gray-400">›</Text>
          </Pressable>
        ))}
      </View>

      <ImportClientsModal
        open={openStep === 'clients'}
        onClose={() => setOpenStep(null)}
        businessId={business.id}
        templates={clientTemplates}
        onImportComplete={() => {}}
      />
      <ImportPhotosModal
        open={openStep === 'photos'}
        businessId={business.id}
        onClose={() => setOpenStep(null)}
      />
      {(['employees', 'jobs', 'invoices'] as const).map(mode => (
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
