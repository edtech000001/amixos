'use client';

// Public lease-signing page. The token in the URL is the ONLY thing gating
// access, so everything here goes through two SECURITY DEFINER RPCs
// (get_shared_lease / sign_shared_lease, migration 206) rather than table
// reads — anon never touches rental_leases directly. Mirrors the estimate
// flow at /propuesta/[token].

import { useEffect, useState } from 'react';
import { SignaturePad } from '@/components/SignaturePad';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/i18n/LangProvider';
import { formatDateLong, formatDateTimeLong } from '@amixos/shared/lib/format';

interface LeaseData {
  lease: {
    id: string;
    unit_label: string | null;
    start_date: string;
    end_date: string | null;
    monthly_rent: number;
    due_day: number;
    deposit_amount: number | null;
    late_fee_amount: number | null;
    late_fee_grace_days: number | null;
    prorate_partial: boolean;
    notes: string | null;
    status: string;
    tenant_signature: string | null;
    tenant_signed_at: string | null;
    tenant_signer_name: string | null;
  };
  property: { name: string; address: string | null; city: string | null; state: string | null; zip: string | null } | null;
  tenant: { first_name: string; last_name: string | null } | null;
  business: {
    name: string; logo_url: string | null; address: string | null; city: string | null;
    state: string | null; postal_code: string | null; phone: string | null; email: string | null;
  } | null;
}

export default function LeaseSignPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const supabase = createSupabaseClient();
  const { t: full, locale } = useLang();
  const t = full.dashboard.modules.rentals;
  const tc = full.common;
  const dateLoc = full.dashboard.dateLocale;

  const [data, setData] = useState<LeaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signature, setSignature] = useState<string | null>(null);
  const [signerName, setSignerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const { data: res } = await supabase.rpc('get_shared_lease', { p_token: token });
    setData((res as LeaseData | null) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const money = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

  const submit = async () => {
    if (!signature || !signerName.trim()) return;
    setSubmitting(true);
    setError('');
    const { data: res } = await supabase.rpc('sign_shared_lease', {
      p_token: token,
      p_name: signerName.trim(),
      p_signature: signature,
    });
    setSubmitting(false);
    const ok = (res as { ok?: boolean } | null)?.ok;
    if (!ok) {
      setError(t.saveError);
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!data?.lease) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-6">
        <div className="text-center">
          <p className="text-lg font-semibold text-ink mb-1">{full.proposal.notFound}</p>
          <p className="text-sm text-faint">{full.proposal.notFoundSub}</p>
        </div>
      </div>
    );
  }

  const { lease, property, tenant, business } = data;
  const signed = !!lease.tenant_signed_at;
  const addr = [property?.address, [property?.city, property?.state, property?.zip].filter(Boolean).join(', ')]
    .filter(Boolean).join(' · ');

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4 py-2 border-b border-border-soft last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium text-ink text-right">{value}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface py-8 px-4">
      <div className="max-w-xl mx-auto flex flex-col gap-5">
        {/* Landlord header */}
        <div className="text-center">
          {business?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt="" className="w-16 h-16 object-contain rounded-xl mx-auto mb-2" />
          ) : null}
          <h1 className="text-xl font-bold text-ink">{business?.name ?? ''}</h1>
          <p className="text-xs text-muted">
            {[business?.address, business?.city, business?.state, business?.postal_code].filter(Boolean).join(', ')}
          </p>
          <p className="text-xs text-muted">{[business?.phone, business?.email].filter(Boolean).join(' · ')}</p>
        </div>

        {/* Terms */}
        <div className="bg-card rounded-2xl border border-border-soft p-5">
          <h2 className="text-base font-bold text-ink mb-1">
            {property?.name ?? ''}{lease.unit_label ? ` · ${lease.unit_label}` : ''}
          </h2>
          {addr ? <p className="text-xs text-muted mb-3">{addr}</p> : null}
          <div className="flex flex-col">
            {tenant ? row(t.tenants.title, `${tenant.first_name} ${tenant.last_name ?? ''}`.trim()) : null}
            {row(t.leases.form.startLabel, formatDateLong(`${lease.start_date}T00:00:00`, dateLoc))}
            {row(t.leases.form.endLabel, lease.end_date
              ? formatDateLong(`${lease.end_date}T00:00:00`, dateLoc)
              : t.leases.monthToMonth)}
            {row(t.leases.form.rentLabel, money(lease.monthly_rent))}
            {row(t.leases.form.dueDayLabel, String(lease.due_day))}
            {lease.deposit_amount != null ? row(t.leases.form.depositLabel, money(lease.deposit_amount)) : null}
            {lease.late_fee_amount ? row(
              t.leases.form.lateFeeHeading,
              `${money(lease.late_fee_amount)} · ${t.leases.form.lateFeeGraceLabel}: ${lease.late_fee_grace_days ?? 0}`,
            ) : null}
          </div>
          {lease.notes ? (
            <p className="text-sm text-muted whitespace-pre-wrap mt-3 pt-3 border-t border-border-soft">{lease.notes}</p>
          ) : null}
        </div>

        {/* Signature */}
        <div className="bg-card rounded-2xl border border-border-soft p-5">
          <h2 className="text-sm font-bold text-ink mb-3">{t.leases.signHeading}</h2>
          {signed ? (
            <div className="flex flex-col items-center gap-2">
              {lease.tenant_signature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lease.tenant_signature} alt="" className="max-h-28 object-contain" />
              ) : null}
              <p className="text-xs text-muted text-center">
                {t.leases.signedBy
                  .replace('{{name}}', lease.tenant_signer_name ?? '')
                  .replace('{{date}}', formatDateTimeLong(lease.tenant_signed_at!, dateLoc))}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <SignaturePad
                hint={t.leases.signPadHint}
                clearLabel={tc.buttons.clear}
                onChange={setSignature}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-ink">{t.leases.signerNameLabel}</label>
                <input
                  value={signerName}
                  onChange={e => setSignerName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <button
                onClick={submit}
                disabled={submitting || !signature || !signerName.trim()}
                className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
              >
                {t.leases.signSubmitBtn}
              </button>
            </div>
          )}
        </div>

        <p className="text-[11px] text-faint text-center">Powered by Amixos</p>
      </div>
    </div>
  );
}
