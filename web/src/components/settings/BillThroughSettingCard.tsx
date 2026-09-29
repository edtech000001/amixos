'use client';

import { useEffect, useState } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Toggle } from '@/components/ui/Toggle';

/**
 * Ajustes → Facturas: "Bill through another company"
 * (businesses.allow_bill_through, migration 240). Lets this business's
 * invoice lines be copied onto an invoice from the owner's other businesses.
 * Only shown to people in 2+ businesses. Saves on flip. The flag is read here
 * rather than from the app-wide business query, so an un-migrated column
 * can't break loading. Mirrors mobile InvoiceBillThroughSection.
 */
export function BillThroughSettingCard() {
  const supabase = createSupabaseClient();
  const { business, businesses } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.invoices.billThrough;
  const [on, setOn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!business) return;
    void supabase.from('businesses').select('allow_bill_through').eq('id', business.id).single()
      .then(({ data }) => setOn(!!(data as { allow_bill_through?: boolean } | null)?.allow_bill_through));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const save = async (value: boolean) => {
    if (!business) return;
    setOn(value); setSaving(true);
    const { error } = await supabase.from('businesses').update({ allow_bill_through: value }).eq('id', business.id);
    if (error) setOn(!value);
    setSaving(false);
  };

  if (businesses.length < 2) return null;
  return (
    <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{t.settingTitle}</h2>
          <p className="text-xs text-faint mt-1">{t.settingHint}</p>
        </div>
        <Toggle checked={on} onChange={() => void save(!on)} disabled={saving} aria-label={t.settingTitle} />
      </div>
    </div>
  );
}
