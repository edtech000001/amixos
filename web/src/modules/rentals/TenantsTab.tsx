'use client';

// Module-owned tenants (rental_tenants) — list + CRUD. Deliberately separate
// from Clientes (see shared/lib/rentals.ts header): the rentals permission
// alone gates this PII.

import { useEffect, useMemo, useState } from 'react';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { ArrowLeft, FileText, Mail, Pencil, Phone, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { logAudit } from '@amixos/shared/lib/audit';
import { formatDateLong, formatPhoneInput } from '@amixos/shared/lib/format';
import { fetchChargesForLeases, fetchPaymentsForLeases } from '@amixos/shared/lib/rentalsQuery';
import { tenantName, type RentalCharge, type RentalLease, type RentalPayment, type RentalTenant } from '@amixos/shared/lib/rentals';
import { useLang } from '@/i18n/LangProvider';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  supabase: any;
  businessId: string | null;
  userId: string | null;
  tenants: RentalTenant[];
  leases: RentalLease[];
  loading: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onChanged: () => void;
}

const EMPTY = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relation: '',
  notes: '',
};

export function TenantsTab({
  supabase, businessId, userId, tenants, leases, loading, canCreate, canEdit, canDelete, onChanged,
}: Props) {
  const { t: full } = useLang();
  const t = full.dashboard.modules.rentals.tenants;
  const tc = full.common;

  const tRent = full.dashboard.modules.rentals;
  const dateLoc = full.dashboard.dateLocale;
  const fmtMoney = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RentalTenant | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // ── Tenant detail (contact + lease history + quick totals) ────────────────
  const [detail, setDetail] = useState<RentalTenant | null>(null);
  const [detailPropNames, setDetailPropNames] = useState<Record<string, string>>({});
  const [detailCharges, setDetailCharges] = useState<RentalCharge[]>([]);
  const [detailPayments, setDetailPayments] = useState<RentalPayment[]>([]);
  const detailLeases = useMemo(
    () => (detail ? leases.filter(l => l.tenant_id === detail.id)
      .sort((a, b) => (a.status === b.status ? b.start_date.localeCompare(a.start_date) : a.status === 'active' ? -1 : 1)) : []),
    [detail, leases],
  );
  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    const leaseIds = leases.filter(l => l.tenant_id === detail.id).map(l => l.id);
    const propIds = Array.from(new Set(leases.filter(l => l.tenant_id === detail.id).map(l => l.property_id)));
    void (async () => {
      const [{ data: props }, charges, payments] = await Promise.all([
        propIds.length
          ? supabase.from('rental_properties').select('id, name').in('id', propIds)
          : Promise.resolve({ data: [] }),
        fetchChargesForLeases(supabase, leaseIds),
        fetchPaymentsForLeases(supabase, leaseIds),
      ]);
      if (cancelled) return;
      const names: Record<string, string> = {};
      for (const pr of (props as { id: string; name: string }[] | null) ?? []) names[pr.id] = pr.name;
      setDetailPropNames(names);
      setDetailCharges(charges);
      setDetailPayments(payments);
    })();
    return () => { cancelled = true; };
  }, [detail, leases, supabase]);
  const detailTotalPaid = useMemo(() => detailPayments.reduce((s2, p) => s2 + p.amount, 0), [detailPayments]);
  const detailBalance = useMemo(
    () => Math.max(0, detailCharges.reduce((s2, ch) => s2 + ch.amount, 0) - detailTotalPaid),
    [detailCharges, detailTotalPaid],
  );

  const activeTenantIds = useMemo(
    () => new Set(leases.filter(l => l.status === 'active').map(l => l.tenant_id)),
    [leases],
  );

  const sorted = useMemo(
    () => [...tenants].sort((a, b) => tenantName(a).localeCompare(tenantName(b), 'es', { sensitivity: 'base' })),
    [tenants],
  );

  const openAdd = () => { setEditing(null); setForm(EMPTY); setFormOpen(true); };
  const openEdit = (tn: RentalTenant) => {
    setEditing(tn);
    setForm({
      first_name: tn.first_name,
      last_name: tn.last_name ?? '',
      phone: tn.phone ?? '',
      email: tn.email ?? '',
      emergency_contact_name: tn.emergency_contact_name ?? '',
      emergency_contact_phone: tn.emergency_contact_phone ?? '',
      emergency_contact_relation: tn.emergency_contact_relation ?? '',
      notes: tn.notes ?? '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!businessId || !form.first_name.trim()) return;
    setSaving(true);
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      emergency_contact_relation: form.emergency_contact_relation.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      await supabase.from('rental_tenants').update(payload).eq('id', editing.id);
      if (detail?.id === editing.id) setDetail({ ...detail, ...payload, updated_at: new Date().toISOString() });
      void logAudit(supabase, businessId, 'rental_tenant.updated', 'rental_tenant', editing.id, { name: payload.first_name });
    } else {
      const { data } = await supabase.from('rental_tenants')
        .insert({ business_id: businessId, ...payload, created_by: userId }).select().single();
      if (data) void logAudit(supabase, businessId, 'rental_tenant.created', 'rental_tenant', (data as RentalTenant).id, { name: payload.first_name });
    }
    setSaving(false);
    setFormOpen(false);
    onChanged();
  };

  const remove = async (tn: RentalTenant) => {
    if (!businessId) return;
    if (!(await confirm({ title: t.deleteConfirmTitle, message: t.deleteConfirmBody, destructive: true }))) return;
    await supabase.from('rental_tenants').delete().eq('id', tn.id);
    if (detail?.id === tn.id) setDetail(null);
    void logAudit(supabase, businessId, 'rental_tenant.deleted', 'rental_tenant', tn.id, { name: tn.first_name });
    onChanged();
  };

  // Shared form body — rendered inside a Modal from BOTH the list and the
  // detail branch (edit works without leaving the tenant page).
  const tenantFormBody = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label={t.form.firstNameLabel} value={form.first_name}
          onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
        <Input label={t.form.lastNameLabel} value={form.last_name}
          onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label={t.form.phoneLabel} type="tel" value={formatPhoneInput(form.phone)}
          onChange={e => setForm(f => ({ ...f, phone: formatPhoneInput(e.target.value) }))} />
        <Input label={t.form.emailLabel} type="email" value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label={t.form.emergencyNameLabel} value={form.emergency_contact_name}
          onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} />
        <Input label={t.form.emergencyPhoneLabel} type="tel" value={formatPhoneInput(form.emergency_contact_phone)}
          onChange={e => setForm(f => ({ ...f, emergency_contact_phone: formatPhoneInput(e.target.value) }))} />
      </div>
      <Input label={t.form.emergencyRelationLabel} placeholder={t.form.emergencyRelationPlaceholder}
        value={form.emergency_contact_relation}
        onChange={e => setForm(f => ({ ...f, emergency_contact_relation: e.target.value }))} />
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">{t.form.notesLabel}</label>
        <textarea rows={2} value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setFormOpen(false)}>{tc.buttons.cancel}</Button>
        <Button onClick={save} loading={saving} disabled={!form.first_name.trim()}>{tc.buttons.save}</Button>
      </div>
    </div>
  );

  if (detail) {
    const td = t.detail;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setDetail(null)} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
            <ArrowLeft size={15} /> {tc.buttons.back}
          </button>
          <div className="flex gap-2">
            {canEdit ? (
              <Button variant="secondary" size="sm" onClick={() => openEdit(detail)}>
                <Pencil size={13} className="mr-1.5" />{tc.buttons.edit}
              </Button>
            ) : null}
            {canDelete ? (
              <Button variant="secondary" size="sm" onClick={() => remove(detail)}
                className="text-red-600 hover:bg-red-500/10">
                <Trash2 size={13} className="mr-1.5" />{tc.buttons.delete}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-teal-500/10 text-teal-600 flex items-center justify-center text-lg font-bold">
            {detail.first_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-xl font-bold text-ink">{tenantName(detail)}</p>
            {activeTenantIds.has(detail.id) ? (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">{t.activeLease}</span>
            ) : null}
          </div>
        </div>

        {/* Quick totals */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: td.statLeases, value: String(detailLeases.length) },
            { label: td.statTotalPaid, value: fmtMoney(detailTotalPaid) },
            { label: td.statBalance, value: fmtMoney(detailBalance) },
          ].map(sd => (
            <div key={sd.label} className="bg-card rounded-2xl border border-border-soft p-4">
              <p className="text-lg font-bold text-ink">{sd.value}</p>
              <p className="text-xs text-faint">{sd.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Contact */}
          <div className="bg-card rounded-2xl border border-border-soft p-5">
            <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-3">{td.contactHeading}</p>
            <div className="flex flex-col gap-2.5">
              {detail.phone ? (
                <a href={`tel:${detail.phone}`} className="flex items-center gap-2.5 text-sm text-ink hover:text-primary">
                  <Phone size={14} className="text-faint" /> {formatPhoneInput(detail.phone)}
                </a>
              ) : null}
              {detail.email ? (
                <a href={`mailto:${detail.email}`} className="flex items-center gap-2.5 text-sm text-ink hover:text-primary">
                  <Mail size={14} className="text-faint" /> {detail.email}
                </a>
              ) : null}
              {!detail.phone && !detail.email ? <p className="text-sm text-faint">—</p> : null}
            </div>
            {detail.emergency_contact_name || detail.emergency_contact_phone ? (
              <>
                <p className="text-xs font-semibold text-faint uppercase tracking-wide mt-4 mb-2">{td.emergencyHeading}</p>
                <p className="text-sm text-ink">
                  {[detail.emergency_contact_name, detail.emergency_contact_relation ? `(${detail.emergency_contact_relation})` : null]
                    .filter(Boolean).join(' ')}
                </p>
                {detail.emergency_contact_phone ? (
                  <a href={`tel:${detail.emergency_contact_phone}`} className="text-sm text-muted hover:text-primary">
                    {formatPhoneInput(detail.emergency_contact_phone)}
                  </a>
                ) : null}
              </>
            ) : null}
            {detail.notes ? (
              <>
                <p className="text-xs font-semibold text-faint uppercase tracking-wide mt-4 mb-2">{td.notesHeading}</p>
                <p className="text-sm text-muted whitespace-pre-wrap">{detail.notes}</p>
              </>
            ) : null}
          </div>

          {/* Leases (active first, then history) */}
          <div className="bg-card rounded-2xl border border-border-soft p-5">
            <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-3">{td.leasesHeading}</p>
            {detailLeases.length === 0 ? (
              <p className="text-sm text-faint">{td.noLeases}</p>
            ) : (
              <div className="flex flex-col divide-y divide-border-soft">
                {detailLeases.map(l => (
                  <div key={l.id} className="py-2.5 flex items-center gap-3">
                    <FileText size={15} className="text-faint shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {detailPropNames[l.property_id] ?? '—'}{l.unit_label ? ` · ${l.unit_label}` : ''}
                      </p>
                      <p className="text-[11px] text-muted">
                        {formatDateLong(`${l.start_date}T00:00:00`, dateLoc)}
                        {l.end_date ? ` – ${formatDateLong(`${l.end_date}T00:00:00`, dateLoc)}` : ` · ${tRent.leases.monthToMonth}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-ink">{fmtMoney(l.monthly_rent)}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${l.status === 'active' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-border-soft text-muted'}`}>
                        {l.status === 'active' ? t.activeLease : tRent.leases.endedBadge}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="text-xs text-faint">
          <p>{td.addedOn.replace('{{date}}', formatDateLong(detail.created_at, dateLoc))}</p>
          {detail.updated_at && detail.updated_at !== detail.created_at ? (
            <p>{td.editedOn.replace('{{date}}', formatDateLong(detail.updated_at, dateLoc))}</p>
          ) : null}
        </div>

        <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? t.editTitle : t.addBtn}>
          {tenantFormBody}
        </Modal>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canCreate ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={openAdd}><Plus size={13} className="mr-1.5" />{t.addBtn}</Button>
        </div>
      ) : null}

      {loading && tenants.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border-soft p-10 text-center">
          <Users size={32} className="text-faint mx-auto mb-3" />
          <p className="text-sm text-muted">{t.empty}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border-soft bg-card divide-y divide-border-soft">
          {sorted.map(tn => (
            <div key={tn.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-teal-500/10 text-teal-600 flex items-center justify-center text-sm font-bold shrink-0">
                {tn.first_name.charAt(0).toUpperCase()}
              </div>
              <button type="button" onClick={() => setDetail(tn)} className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-ink truncate">
                  {tenantName(tn)}
                  {activeTenantIds.has(tn.id) ? (
                    <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">
                      {t.activeLease}
                    </span>
                  ) : null}
                </p>
                <p className="text-[11px] text-muted truncate">
                  {[tn.phone ? formatPhoneInput(tn.phone) : null, tn.email].filter(Boolean).join(' · ') || '—'}
                </p>
              </button>
              {tn.phone ? (
                <a href={`tel:${tn.phone}`} className="p-1.5 rounded-lg hover:bg-border-soft">
                  <Phone size={13} className="text-muted" />
                </a>
              ) : null}
              {canEdit ? (
                <button onClick={() => openEdit(tn)} className="p-1.5 rounded-lg hover:bg-border-soft">
                  <Pencil size={13} className="text-muted" />
                </button>
              ) : null}
              {canDelete ? (
                <button onClick={() => remove(tn)} className="p-1.5 rounded-lg hover:bg-border-soft">
                  <Trash2 size={13} className="text-red-500" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? t.editTitle : t.addBtn}>
        {tenantFormBody}
      </Modal>
    </div>
  );
}
