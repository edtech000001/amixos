'use client';

// Module-owned tenants (rental_tenants) — list + CRUD. Deliberately separate
// from Clientes (see shared/lib/rentals.ts header): the rentals permission
// alone gates this PII.

import { useMemo, useState } from 'react';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { Pencil, Phone, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { logAudit } from '@amixos/shared/lib/audit';
import { formatPhoneInput } from '@amixos/shared/lib/format';
import { tenantName, type RentalLease, type RentalTenant } from '@amixos/shared/lib/rentals';
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

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RentalTenant | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

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
    void logAudit(supabase, businessId, 'rental_tenant.deleted', 'rental_tenant', tn.id, { name: tn.first_name });
    onChanged();
  };

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
              <div className="flex-1 min-w-0">
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
              </div>
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
      </Modal>
    </div>
  );
}
