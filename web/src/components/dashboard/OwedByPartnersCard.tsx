'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, ChevronRight } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { formatDateLong } from '@amixos/shared/lib/format';

interface OwedRow {
  id: string;
  invoice_number: string;
  total_amount: number;
  partner_business_name: string;
  partner_invoice_number: string;
  client_paid_at: string;
}

const money = (n: number) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Dashboard card: this business's unpaid invoices whose CLIENT already paid
 * the other company they were billed through (migration 250). Renders
 * nothing when empty, or on a database without migration 250. Mobile twin:
 * mobile/components/OwedByPartnersCard.tsx.
 */
export function OwedByPartnersCard() {
  const { business } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.invoices.billThrough;
  const [rows, setRows] = useState<OwedRow[]>([]);

  useEffect(() => {
    setRows([]);
    if (!business?.id) return;
    let active = true;
    void createSupabaseClient()
      .rpc('invoices_collect_from_partners', { p_business_id: business.id })
      .then(({ data, error }) => { if (active) setRows(error ? [] : ((data as OwedRow[] | null) ?? [])); });
    return () => { active = false; };
  }, [business?.id]);

  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  return (
    <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-center gap-2">
        <Building2 size={16} className="text-amber-700" />
        <p className="flex-1 text-sm font-bold text-amber-800">{t.owedTitle}</p>
        <p className="text-sm font-bold text-amber-800">{money(total)}</p>
      </div>
      <p className="text-xs text-amber-700 mt-1">{t.owedHint}</p>
      <div className="mt-2">
        {rows.map(r => (
          <Link
            key={`${r.id}-${r.partner_invoice_number}`}
            href={`/dashboard/facturas/${r.id}`}
            className="flex items-center gap-2 py-2 border-t border-amber-500/20 hover:opacity-70"
          >
            <span className="flex-1 text-xs text-amber-900">
              {t.owedLine
                .replace('{{invoice}}', r.invoice_number)
                .replace('{{company}}', r.partner_business_name)
                .replace('{{date}}', formatDateLong(r.client_paid_at, locale === 'es' ? 'es-MX' : 'en-US'))}
            </span>
            <span className="text-xs font-semibold text-amber-900">{money(r.total_amount)}</span>
            <ChevronRight size={14} className="text-amber-700" />
          </Link>
        ))}
      </div>
    </div>
  );
}
