'use client';

// Full-page property detail: section tabs for leases, the rent ledger,
// expenses, maintenance, and photos. All I/O for one property lives here;
// ledger math comes from shared/lib/rentals.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirm } from '@amixos/shared/ui/confirmBus';
import {
  ArrowLeft, Camera, ChevronDown, ChevronRight, FileText, Home, Pencil,
  Plus, Trash2, Upload, Wrench, X,
} from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { useSignedUrls, signedUrl } from '@amixos/shared/lib/storageUrls';
import { logAudit } from '@amixos/shared/lib/audit';
import { formatDateLong } from '@amixos/shared/lib/format';
import { fetchAllById } from '@amixos/shared/lib/supabaseFetch';
import { normalizeImageFiles } from '@/lib/imageFile';
import {
  EXPENSE_CATEGORIES,
  LEASE_DOC_MAX_BYTES,
  MAX_DOCS_PER_LEASE,
  MAX_PHOTOS_PER_PROPERTY,
  PAY_TOLERANCE,
  RENTALS_BUCKET,
  chargeDaysLate,
  chargeStatus,
  leaseBalance,
  leaseExpirationDays,
  rentalLeaseDocPath,
  rentalPaymentPhotoPath,
  rentalPropertyPhotoPath,
  rentalReceiptPath,
  rentalUid,
  tenantName,
  type ChargeStatus,
  type ExpenseCategory,
  type MaintenanceStatus,
  type RentalCharge,
  type RentalExpense,
  type RentalLease,
  type RentalLeaseDocument,
  type RentalMaintenance,
  type RentalPayment,
  type RentalProperty,
  type RentalPropertyPhoto,
  type RentalTenant,
} from '@amixos/shared/lib/rentals';
import {
  fetchAllLeases,
  fetchChargesForProperty,
  fetchExpensesForProperty,
  fetchMaintenanceForProperty,
  fetchPaymentsForLeases,
  generateChargesForLeases,
} from '@amixos/shared/lib/rentalsQuery';
import { fmtMoney, sanitizeMoney, withCommas } from './util';

type DetailTab = 'overview' | 'leases' | 'ledger' | 'expenses' | 'maintenance' | 'photos';

interface EmployeeOption { id: string; first_name: string; last_name: string; active: boolean }

interface Props {
  property: RentalProperty;
  tenants: RentalTenant[];
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Notify the module root that leases/tenants changed (rent roll refresh). */
  onDataChanged: () => void;
}

const EMPTY_LEASE_FORM = {
  tenant_id: '',
  unit_label: '',
  start_date: '',
  end_date: '',
  monthly_rent: '',
  due_day: '1',
  deposit_amount: '',
  notes: '',
};

const EMPTY_EXPENSE_FORM = {
  expense_date: '',
  amount: '',
  category: 'repairs' as ExpenseCategory,
  vendor: '',
  note: '',
};

const EMPTY_MAINT_FORM = {
  title: '',
  description: '',
  status: 'open' as MaintenanceStatus,
  reported_on: '',
  completed_on: '',
  cost: '',
  fixed_by: '',
  employee_id: '',
  createExpense: true,
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function PropertyDetail({
  property, tenants, canEdit, canCreate, canDelete, onBack, onEdit, onDelete, onDataChanged,
}: Props) {
  const supabase = createSupabaseClient();
  const { business, user } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.modules.rentals;
  const tc = full.common;

  const [tab, setTab] = useState<DetailTab>('overview');
  const [loading, setLoading] = useState(true);
  const [leases, setLeases] = useState<RentalLease[]>([]);
  const [charges, setCharges] = useState<RentalCharge[]>([]);
  const [payments, setPayments] = useState<RentalPayment[]>([]);
  const [expenses, setExpenses] = useState<RentalExpense[]>([]);
  const [maintenance, setMaintenance] = useState<RentalMaintenance[]>([]);
  const [photos, setPhotos] = useState<RentalPropertyPhoto[]>([]);
  const [docsByLease, setDocsByLease] = useState<Record<string, RentalLeaseDocument[]>>({});
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const monthLabel = useCallback((periodStart: string) => {
    const [y, m] = periodStart.split('-').map(Number);
    const s = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-MX', { month: 'long', year: 'numeric' })
      .format(new Date(y, (m ?? 1) - 1, 1));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [locale]);

  const reload = useCallback(async () => {
    if (!business) return;
    const [ls, ch, ex, mt, phRes] = await Promise.all([
      fetchAllLeases(supabase, business.id, { propertyId: property.id }),
      fetchChargesForProperty(supabase, property.id),
      fetchExpensesForProperty(supabase, property.id),
      fetchMaintenanceForProperty(supabase, property.id),
      supabase.from('rental_property_photos').select('*').eq('property_id', property.id).order('created_at'),
    ]);
    const pays = await fetchPaymentsForLeases(supabase, ls.map(l => l.id));
    const { data: docRows } = ls.length
      ? await supabase.from('rental_lease_documents').select('*').in('lease_id', ls.map(l => l.id)).order('created_at')
      : { data: [] };
    setLeases(ls);
    setCharges(ch);
    setPayments(pays);
    setExpenses(ex.sort((a, b) => b.expense_date.localeCompare(a.expense_date)));
    setMaintenance(mt.sort((a, b) => b.reported_on.localeCompare(a.reported_on)));
    setPhotos((phRes.data as RentalPropertyPhoto[] | null) ?? []);
    const byLease: Record<string, RentalLeaseDocument[]> = {};
    for (const d of (docRows as RentalLeaseDocument[] | null) ?? []) {
      (byLease[d.lease_id] ??= []).push(d);
    }
    setDocsByLease(byLease);
    setLoading(false);
  }, [business, property.id, supabase]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!business) return;
    void fetchAllById<EmployeeOption>((afterId, pageSize) => {
      let q = supabase.from('employees_roster').select('id, first_name, last_name, active')
        .eq('business_id', business.id).order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    }).then(setEmployees).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const tenantOf = useCallback(
    (id: string) => tenants.find(x => x.id === id) ?? null,
    [tenants],
  );

  const paymentsByCharge = useMemo(() => {
    const m = new Map<string, RentalPayment[]>();
    for (const p of payments) (m.get(p.charge_id) ?? m.set(p.charge_id, []).get(p.charge_id)!).push(p);
    return m;
  }, [payments]);

  const paidOn = useCallback(
    (chargeId: string) => (paymentsByCharge.get(chargeId) ?? []).reduce((s, p) => s + p.amount, 0),
    [paymentsByCharge],
  );

  const chargesByLease = useMemo(() => {
    const m = new Map<string, RentalCharge[]>();
    for (const c of charges) (m.get(c.lease_id) ?? m.set(c.lease_id, []).get(c.lease_id)!).push(c);
    m.forEach(arr => arr.sort((a, b) => b.period_start.localeCompare(a.period_start)));
    return m;
  }, [charges]);

  const statusChip = (status: ChargeStatus, daysLate: number) => {
    const cls =
      status === 'paid' ? 'bg-emerald-500/10 text-emerald-700'
      : status === 'partial' ? 'bg-amber-500/10 text-amber-700'
      : status === 'late' ? 'bg-red-500/10 text-red-700'
      : 'bg-border-soft text-muted';
    const label =
      status === 'paid' ? t.ledger.statusPaid
      : status === 'partial' ? t.ledger.statusPartial
      : status === 'late' ? t.ledger.statusLate
      : t.ledger.statusUnpaid;
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
        {label}{status === 'late' && daysLate > 0 ? ` · ${t.ledger.daysLate.replace('{{days}}', String(daysLate))}` : ''}
      </span>
    );
  };

  // ── Lease form ──────────────────────────────────────────────────────────────
  const [leaseFormOpen, setLeaseFormOpen] = useState(false);
  const [editingLease, setEditingLease] = useState<RentalLease | null>(null);
  // Set → the form creates a NEW lease pre-filled from this one, and (if the
  // source is still active) ends it when the renewal saves.
  const [renewSource, setRenewSource] = useState<RentalLease | null>(null);
  const [leaseForm, setLeaseForm] = useState(EMPTY_LEASE_FORM);
  const [savingLease, setSavingLease] = useState(false);
  const [leaseError, setLeaseError] = useState('');

  const openAddLease = () => {
    setEditingLease(null);
    setRenewSource(null);
    setLeaseForm({ ...EMPTY_LEASE_FORM, start_date: todayISO() });
    setLeaseError('');
    setLeaseFormOpen(true);
  };
  const openRenewLease = (l: RentalLease) => {
    setEditingLease(null);
    setRenewSource(l);
    // New term starts the day after the old one ends (or today for
    // month-to-month); end date left open for the new agreement.
    let start = todayISO();
    if (l.end_date) {
      const [y, m, d] = l.end_date.split('-').map(Number);
      const next = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1);
      start = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    }
    setLeaseForm({
      tenant_id: l.tenant_id,
      unit_label: l.unit_label ?? '',
      start_date: start,
      end_date: '',
      monthly_rent: String(l.monthly_rent),
      due_day: String(l.due_day),
      deposit_amount: l.deposit_amount != null ? String(l.deposit_amount) : '',
      notes: '',
    });
    setLeaseError('');
    setLeaseFormOpen(true);
  };
  const openEditLease = (l: RentalLease) => {
    setRenewSource(null);
    setEditingLease(l);
    setLeaseForm({
      tenant_id: l.tenant_id,
      unit_label: l.unit_label ?? '',
      start_date: l.start_date,
      end_date: l.end_date ?? '',
      monthly_rent: String(l.monthly_rent),
      due_day: String(l.due_day),
      deposit_amount: l.deposit_amount != null ? String(l.deposit_amount) : '',
      notes: l.notes ?? '',
    });
    setLeaseError('');
    setLeaseFormOpen(true);
  };

  const saveLease = async () => {
    if (!business) return;
    if (!leaseForm.tenant_id || !leaseForm.start_date || !Number(leaseForm.monthly_rent)) return;
    setSavingLease(true);
    setLeaseError('');
    const payload = {
      business_id: business.id,
      property_id: property.id,
      tenant_id: leaseForm.tenant_id,
      unit_label: leaseForm.unit_label.trim() || null,
      start_date: leaseForm.start_date,
      end_date: leaseForm.end_date || null,
      monthly_rent: Number(leaseForm.monthly_rent),
      due_day: Math.min(31, Math.max(1, parseInt(leaseForm.due_day, 10) || 1)),
      deposit_amount: leaseForm.deposit_amount ? Number(leaseForm.deposit_amount) : null,
      notes: leaseForm.notes.trim() || null,
    };
    let leaseRow: RentalLease | null = null;
    if (!editingLease) {
      const { data, error } = await supabase.from('rental_leases')
        .insert({ ...payload, created_by: user?.id ?? null }).select().single();
      if (error) { setLeaseError(t.saveError); setSavingLease(false); return; }
      leaseRow = data as RentalLease;
      void logAudit(supabase, business.id, 'rental_lease.created', 'rental_lease', leaseRow.id, { property: property.name });
      // Renewal: retire the old term. If it was month-to-month, close it the
      // day before the new term starts; a dated term keeps its own end date.
      if (renewSource && renewSource.status === 'active') {
        let endDate = renewSource.end_date;
        if (!endDate) {
          const [y, m, d] = payload.start_date.split('-').map(Number);
          const prev = new Date(y, (m ?? 1) - 1, (d ?? 1) - 1);
          endDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
        }
        await supabase.from('rental_leases')
          .update({ status: 'ended', end_date: endDate }).eq('id', renewSource.id);
      }
    } else {
      const { data, error } = await supabase.from('rental_leases')
        .update(payload).eq('id', editingLease.id).select().single();
      if (error) { setLeaseError(t.saveError); setSavingLease(false); return; }
      leaseRow = data as RentalLease;
      void logAudit(supabase, business.id, 'rental_lease.updated', 'rental_lease', leaseRow.id, { property: property.name });
    }
    // Materialize charges immediately (snapshot semantics: existing months keep
    // their amount; only unmaterialized months pick up a rent change).
    if (leaseRow) await generateChargesForLeases(supabase, [leaseRow]).catch(() => false);
    setSavingLease(false);
    setLeaseFormOpen(false);
    setEditingLease(null);
    setRenewSource(null);
    await reload();
    onDataChanged();
  };

  const endLease = async (l: RentalLease) => {
    if (!(await confirm({ title: t.leases.endConfirmTitle, message: t.leases.endConfirmBody, destructive: true }))) return;
    await supabase.from('rental_leases').update({ status: 'ended', end_date: l.end_date ?? todayISO() }).eq('id', l.id);
    await reload();
    onDataChanged();
  };

  const deleteLease = async (l: RentalLease) => {
    if (!business) return;
    if (!(await confirm({ title: t.leases.deleteConfirmTitle, message: t.leases.deleteConfirmBody, destructive: true }))) return;
    const docPaths = (docsByLease[l.id] ?? []).map(d => d.storage_path);
    const payPaths = payments.filter(p => p.lease_id === l.id && p.photo_path).map(p => p.photo_path as string);
    await supabase.from('rental_leases').delete().eq('id', l.id);
    const paths = [...docPaths, ...payPaths];
    if (paths.length) void supabase.storage.from(RENTALS_BUCKET).remove(paths).then(() => {}, () => {});
    void logAudit(supabase, business.id, 'rental_lease.deleted', 'rental_lease', l.id, { property: property.name });
    await reload();
    onDataChanged();
  };

  // ── Lease documents ─────────────────────────────────────────────────────────
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const [docLeaseId, setDocLeaseId] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const onDocChosen = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file || !business || !docLeaseId) return;
    if (file.size > LEASE_DOC_MAX_BYTES) { window.alert(t.leases.docs.tooLarge); return; }
    if ((docsByLease[docLeaseId] ?? []).length >= MAX_DOCS_PER_LEASE) {
      window.alert(t.leases.docs.limitHit.replace('{{max}}', String(MAX_DOCS_PER_LEASE)));
      return;
    }
    setUploadingDoc(true);
    try {
      const path = rentalLeaseDocPath(business.id, docLeaseId, rentalUid(), file.name);
      const { error: upErr } = await supabase.storage.from(RENTALS_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('rental_lease_documents').insert({
        business_id: business.id,
        lease_id: docLeaseId,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        created_by: user?.id ?? null,
      });
      if (insErr) throw insErr;
      await reload();
    } catch { /* surfaced by missing row */ }
    setUploadingDoc(false);
  };

  const openDoc = async (d: RentalLeaseDocument) => {
    try {
      const url = await signedUrl(supabase, d.storage_path);
      window.open(url, '_blank', 'noopener');
    } catch { /* ignore */ }
  };

  const deleteDoc = async (d: RentalLeaseDocument) => {
    if (!(await confirm({ message: t.leases.docs.deleteConfirm, destructive: true }))) return;
    await supabase.from('rental_lease_documents').delete().eq('id', d.id);
    void supabase.storage.from(RENTALS_BUCKET).remove([d.storage_path]).then(() => {}, () => {});
    await reload();
  };

  // ── Payments ────────────────────────────────────────────────────────────────
  const [payOpen, setPayOpen] = useState(false);
  const [payCharge, setPayCharge] = useState<RentalCharge | null>(null);
  const [payEditId, setPayEditId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payPhotoFile, setPayPhotoFile] = useState<File | null>(null);
  const [payPhotoPath, setPayPhotoPath] = useState<string | null>(null);
  const [payPhotoRemoved, setPayPhotoRemoved] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const payPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const openRecordPayment = (charge: RentalCharge) => {
    const remaining = Math.max(0, charge.amount - paidOn(charge.id));
    setPayCharge(charge);
    setPayEditId(null);
    setPayAmount(remaining > 0 ? String(Math.round(remaining * 100) / 100) : '');
    setPayMethod('');
    setPayDate(todayISO());
    setPayNote('');
    setPayPhotoFile(null);
    setPayPhotoPath(null);
    setPayPhotoRemoved(false);
    setPayOpen(true);
  };

  const openEditPayment = (charge: RentalCharge, p: RentalPayment) => {
    setPayCharge(charge);
    setPayEditId(p.id);
    setPayAmount(String(p.amount));
    setPayMethod(p.method ?? '');
    setPayDate(p.paid_on);
    setPayNote(p.note ?? '');
    setPayPhotoFile(null);
    setPayPhotoPath(p.photo_path);
    setPayPhotoRemoved(false);
    setPayOpen(true);
  };

  const submitPayment = async () => {
    if (!business || !payCharge) return;
    const amount = Number(payAmount);
    if (!(amount >= 0)) return;
    setPayBusy(true);
    let photoPath: string | null = payPhotoPath;
    if (payPhotoFile) {
      try {
        const path = rentalPaymentPhotoPath(business.id, rentalUid());
        const { error: upErr } = await supabase.storage.from(RENTALS_BUCKET)
          .upload(path, payPhotoFile, { upsert: false, contentType: payPhotoFile.type || 'image/jpeg' });
        if (!upErr) photoPath = path;
      } catch { /* keep going without photo */ }
    }
    const prevPath = payEditId ? (payments.find(p => p.id === payEditId)?.photo_path ?? null) : null;
    const row = {
      amount,
      method: payMethod.trim() || null,
      paid_on: payDate || todayISO(),
      note: payNote.trim() || null,
      photo_path: payPhotoRemoved && !payPhotoFile ? null : photoPath,
    };
    if (payEditId) {
      const { error } = await supabase.from('rental_payments').update(row).eq('id', payEditId);
      if (!error && prevPath && prevPath !== row.photo_path) {
        void supabase.storage.from(RENTALS_BUCKET).remove([prevPath]).then(() => {}, () => {});
      }
    } else {
      await supabase.from('rental_payments').insert({
        business_id: business.id,
        charge_id: payCharge.id,
        lease_id: payCharge.lease_id,
        ...row,
        created_by: user?.id ?? null,
      });
      void logAudit(supabase, business.id, 'rental_payment.recorded', 'rental_payment', payCharge.id, { amount });
    }
    setPayBusy(false);
    setPayOpen(false);
    await reload();
  };

  const deletePayment = async (p: RentalPayment) => {
    if (!(await confirm({ title: t.payments.deleteConfirmTitle, message: t.payments.deleteConfirmBody, destructive: true }))) return;
    await supabase.from('rental_payments').delete().eq('id', p.id);
    if (p.photo_path) void supabase.storage.from(RENTALS_BUCKET).remove([p.photo_path]).then(() => {}, () => {});
    await reload();
  };

  const viewPaymentPhoto = async (p: RentalPayment) => {
    if (!p.photo_path) return;
    try {
      const url = await signedUrl(supabase, p.photo_path);
      window.open(url, '_blank', 'noopener');
    } catch { /* ignore */ }
  };

  // ── Charge edit ─────────────────────────────────────────────────────────────
  const [chargeEditId, setChargeEditId] = useState<string | null>(null);
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeBusy, setChargeBusy] = useState(false);

  const saveCharge = async () => {
    if (!chargeEditId || !Number(chargeAmount)) return;
    setChargeBusy(true);
    await supabase.from('rental_charges').update({ amount: Number(chargeAmount) }).eq('id', chargeEditId);
    setChargeBusy(false);
    setChargeEditId(null);
    await reload();
  };

  // ── Expenses ────────────────────────────────────────────────────────────────
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<RentalExpense | null>(null);
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE_FORM);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptRemoved, setReceiptRemoved] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  const openAddExpense = () => {
    setEditingExpense(null);
    setExpenseForm({ ...EMPTY_EXPENSE_FORM, expense_date: todayISO() });
    setReceiptFile(null);
    setReceiptRemoved(false);
    setExpenseFormOpen(true);
  };
  const openEditExpense = (e: RentalExpense) => {
    setEditingExpense(e);
    setExpenseForm({
      expense_date: e.expense_date,
      amount: String(e.amount),
      category: e.category,
      vendor: e.vendor ?? '',
      note: e.note ?? '',
    });
    setReceiptFile(null);
    setReceiptRemoved(false);
    setExpenseFormOpen(true);
  };

  const saveExpense = async () => {
    if (!business || !Number(expenseForm.amount)) return;
    setSavingExpense(true);
    let receiptPath: string | null = editingExpense?.receipt_path ?? null;
    if (receiptFile) {
      try {
        const [file] = await normalizeImageFiles([receiptFile]);
        const path = rentalReceiptPath(business.id, rentalUid());
        const { error: upErr } = await supabase.storage.from(RENTALS_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
        if (!upErr) receiptPath = path;
      } catch { /* keep going */ }
    }
    const row = {
      expense_date: expenseForm.expense_date || todayISO(),
      amount: Number(expenseForm.amount),
      category: expenseForm.category,
      vendor: expenseForm.vendor.trim() || null,
      note: expenseForm.note.trim() || null,
      receipt_path: receiptRemoved && !receiptFile ? null : receiptPath,
    };
    if (editingExpense) {
      const prev = editingExpense.receipt_path;
      const { error } = await supabase.from('rental_expenses').update(row).eq('id', editingExpense.id);
      if (!error && prev && prev !== row.receipt_path) {
        void supabase.storage.from(RENTALS_BUCKET).remove([prev]).then(() => {}, () => {});
      }
    } else {
      await supabase.from('rental_expenses').insert({
        business_id: business.id,
        property_id: property.id,
        ...row,
        created_by: user?.id ?? null,
      });
    }
    setSavingExpense(false);
    setExpenseFormOpen(false);
    await reload();
  };

  const deleteExpense = async (e: RentalExpense) => {
    if (!(await confirm({ title: t.expenses.deleteConfirmTitle, message: t.expenses.deleteConfirmBody, destructive: true }))) return;
    await supabase.from('rental_expenses').delete().eq('id', e.id);
    if (e.receipt_path) void supabase.storage.from(RENTALS_BUCKET).remove([e.receipt_path]).then(() => {}, () => {});
    await reload();
  };

  const viewReceipt = async (e: RentalExpense) => {
    if (!e.receipt_path) return;
    try {
      const url = await signedUrl(supabase, e.receipt_path);
      window.open(url, '_blank', 'noopener');
    } catch { /* ignore */ }
  };

  // ── Maintenance ─────────────────────────────────────────────────────────────
  const [maintFormOpen, setMaintFormOpen] = useState(false);
  const [editingMaint, setEditingMaint] = useState<RentalMaintenance | null>(null);
  const [maintForm, setMaintForm] = useState(EMPTY_MAINT_FORM);
  const [savingMaint, setSavingMaint] = useState(false);

  const openAddMaint = () => {
    setEditingMaint(null);
    setMaintForm({ ...EMPTY_MAINT_FORM, reported_on: todayISO() });
    setMaintFormOpen(true);
  };
  const openEditMaint = (m: RentalMaintenance) => {
    setEditingMaint(m);
    setMaintForm({
      title: m.title,
      description: m.description ?? '',
      status: m.status,
      reported_on: m.reported_on,
      completed_on: m.completed_on ?? '',
      cost: m.cost != null ? String(m.cost) : '',
      fixed_by: m.fixed_by ?? '',
      employee_id: m.employee_id ?? '',
      createExpense: true,
    });
    setMaintFormOpen(true);
  };

  const saveMaint = async () => {
    if (!business || !maintForm.title.trim()) return;
    setSavingMaint(true);
    const done = maintForm.status === 'done';
    const row = {
      title: maintForm.title.trim(),
      description: maintForm.description.trim() || null,
      status: maintForm.status,
      reported_on: maintForm.reported_on || todayISO(),
      completed_on: done ? (maintForm.completed_on || todayISO()) : (maintForm.completed_on || null),
      cost: maintForm.cost ? Number(maintForm.cost) : null,
      fixed_by: maintForm.fixed_by.trim() || null,
      employee_id: maintForm.employee_id || null,
    };
    let maintId = editingMaint?.id ?? null;
    if (editingMaint) {
      await supabase.from('rental_maintenance').update(row).eq('id', editingMaint.id);
    } else {
      const { data } = await supabase.from('rental_maintenance').insert({
        business_id: business.id,
        property_id: property.id,
        ...row,
        created_by: user?.id ?? null,
      }).select().single();
      maintId = (data as RentalMaintenance | null)?.id ?? null;
    }
    // Done + cost + toggle → materialize a linked expense exactly once.
    if (maintId && done && row.cost != null && maintForm.createExpense) {
      const already = expenses.some(e => e.maintenance_id === maintId);
      if (!already) {
        await supabase.from('rental_expenses').insert({
          business_id: business.id,
          property_id: property.id,
          expense_date: row.completed_on ?? todayISO(),
          amount: row.cost,
          category: 'repairs',
          vendor: row.fixed_by,
          note: row.title,
          maintenance_id: maintId,
          created_by: user?.id ?? null,
        });
      }
    }
    setSavingMaint(false);
    setMaintFormOpen(false);
    await reload();
  };

  const deleteMaint = async (m: RentalMaintenance) => {
    if (!(await confirm({ title: t.maintenance.deleteConfirmTitle, message: t.maintenance.deleteConfirmBody, destructive: true }))) return;
    const { data: mp } = await supabase.from('rental_maintenance_photos').select('storage_path').eq('maintenance_id', m.id);
    await supabase.from('rental_maintenance').delete().eq('id', m.id);
    const paths = ((mp as { storage_path: string }[] | null) ?? []).map(r => r.storage_path);
    if (paths.length) void supabase.storage.from(RENTALS_BUCKET).remove(paths).then(() => {}, () => {});
    await reload();
  };

  // ── Property photos ─────────────────────────────────────────────────────────
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const onPhotosChosen = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = ev.target.files;
    ev.target.value = '';
    if (!files || files.length === 0 || !business) return;
    const picked = await normalizeImageFiles(Array.from(files));
    if (photos.length + picked.length > MAX_PHOTOS_PER_PROPERTY) {
      window.alert(t.photos.limitHit.replace('{{max}}', String(MAX_PHOTOS_PER_PROPERTY)));
      return;
    }
    setUploadingPhoto(true);
    try {
      for (const file of picked) {
        const path = rentalPropertyPhotoPath(business.id, property.id, rentalUid());
        const { error: upErr } = await supabase.storage.from(RENTALS_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from('rental_property_photos').insert({
          business_id: business.id,
          property_id: property.id,
          storage_path: path,
          created_by: user?.id ?? null,
        });
        if (insErr) throw insErr;
      }
      await reload();
    } catch (e) {
      // Surface it WITH the underlying message — a silent skip here reads as
      // "the photo just vanished" and hides the real cause.
      window.alert(`${t.photos.uploadError}\n\n${(e as { message?: string })?.message ?? ''}`);
      await reload();
    }
    setUploadingPhoto(false);
  };

  const deletePhoto = async (p: RentalPropertyPhoto) => {
    if (!(await confirm({ message: t.photos.deleteConfirm, destructive: true }))) return;
    await supabase.from('rental_property_photos').delete().eq('id', p.id);
    void supabase.storage.from(RENTALS_BUCKET).remove([p.storage_path]).then(() => {}, () => {});
    await reload();
  };

  const photoUrls = useSignedUrls(supabase, photos.map(p => p.storage_path));

  // ── Derived overview ────────────────────────────────────────────────────────
  const activeLeases = leases.filter(l => l.status === 'active');
  const totalBalance = leaseBalance(charges, payments);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const openMaint = maintenance.filter(m => m.status !== 'done').length;

  const detailTabs: { key: DetailTab; label: string }[] = [
    { key: 'overview', label: t.detailTabs.overview },
    { key: 'leases', label: t.detailTabs.leases },
    { key: 'ledger', label: t.detailTabs.ledger },
    { key: 'expenses', label: t.detailTabs.expenses },
    { key: 'maintenance', label: t.detailTabs.maintenance },
    { key: 'photos', label: t.detailTabs.photos },
  ];

  const [expandedCharge, setExpandedCharge] = useState<string | null>(null);

  const leaseCard = (l: RentalLease) => {
    const tn = tenantOf(l.tenant_id);
    const expDays = l.status === 'active' ? leaseExpirationDays(l.end_date) : null;
    const docs = docsByLease[l.id] ?? [];
    return (
      <div key={l.id} className="rounded-2xl border border-border-soft bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink truncate">
              {tn ? tenantName(tn) : '—'}{l.unit_label ? ` · ${l.unit_label}` : ''}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {formatDateLong(`${l.start_date}T00:00:00`, locale)}
              {' → '}
              {l.end_date ? formatDateLong(`${l.end_date}T00:00:00`, locale) : t.leases.monthToMonth}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {fmtMoney(l.monthly_rent)}/mes · {t.leases.form.dueDayLabel}: {l.due_day}
              {l.deposit_amount != null ? ` · ${t.ledger.depositLabel}: ${fmtMoney(l.deposit_amount)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {l.status === 'ended' ? (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-border-soft text-muted">{t.leases.endedBadge}</span>
            ) : expDays !== null && expDays < 0 ? (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-700">{t.leases.expiredBadge}</span>
            ) : expDays !== null && expDays <= 60 ? (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${expDays <= 30 ? 'bg-red-500/10 text-red-700' : 'bg-amber-500/10 text-amber-700'}`}>
                {t.leases.endsInDays.replace('{{days}}', String(expDays))}
              </span>
            ) : null}
            {canEdit ? (
              <button onClick={() => openEditLease(l)} className="p-1.5 rounded-lg hover:bg-border-soft"><Pencil size={14} className="text-muted" /></button>
            ) : null}
            {canDelete ? (
              <button onClick={() => deleteLease(l)} className="p-1.5 rounded-lg hover:bg-border-soft"><Trash2 size={14} className="text-red-500" /></button>
            ) : null}
          </div>
        </div>

        {/* Documents */}
        <div className="mt-3 border-t border-border-soft pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">{t.leases.docs.heading}</p>
            {canEdit ? (
              <button
                onClick={() => { setDocLeaseId(l.id); docInputRef.current?.click(); }}
                disabled={uploadingDoc}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              >
                <Upload size={12} />
                {uploadingDoc && docLeaseId === l.id ? t.leases.docs.uploading : t.leases.docs.addBtn}
              </button>
            ) : null}
          </div>
          {docs.length === 0 ? (
            <p className="text-xs text-faint">{t.leases.docs.empty}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {docs.map(d => (
                <div key={d.id} className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5">
                  <FileText size={14} className="text-muted shrink-0" />
                  <button onClick={() => openDoc(d)} className="text-xs text-ink truncate flex-1 text-left hover:underline">
                    {d.file_name}
                  </button>
                  {canEdit ? (
                    <button onClick={() => deleteDoc(d)} className="p-1 rounded hover:bg-border-soft">
                      <Trash2 size={12} className="text-red-500" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {canEdit ? (
          <div className="mt-3 flex justify-end gap-4">
            {canCreate ? (
              <button onClick={() => openRenewLease(l)} className="text-xs font-semibold text-emerald-600 hover:underline">
                {t.leases.renewBtn}
              </button>
            ) : null}
            {l.status === 'active' ? (
              <button onClick={() => endLease(l)} className="text-xs font-semibold text-red-600 hover:underline">
                {t.leases.endBtn}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const ledgerForLease = (l: RentalLease) => {
    const tn = tenantOf(l.tenant_id);
    const lCharges = chargesByLease.get(l.id) ?? [];
    const lPayments = payments.filter(p => p.lease_id === l.id);
    const balance = leaseBalance(lCharges, lPayments);
    return (
      <div key={l.id} className="rounded-2xl border border-border-soft bg-card p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink truncate">
              {tn ? tenantName(tn) : '—'}{l.unit_label ? ` · ${l.unit_label}` : ''}
              {l.status === 'ended' ? (
                <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-border-soft text-muted">{t.leases.endedBadge}</span>
              ) : null}
            </p>
          </div>
          <p className={`text-sm font-bold shrink-0 ${balance > PAY_TOLERANCE ? 'text-red-600' : 'text-emerald-600'}`}>
            {t.ledger.balanceLabel}: {fmtMoney(Math.max(0, balance))}
          </p>
        </div>
        {lCharges.length === 0 ? (
          <p className="text-xs text-faint">{t.ledger.noCharges}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border-soft">
            {lCharges.map(c => {
              const paid = paidOn(c.id);
              const st = chargeStatus(c, paid);
              const cPays = paymentsByCharge.get(c.id) ?? [];
              const expanded = expandedCharge === c.id;
              return (
                <div key={c.id} className="py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedCharge(expanded ? null : c.id)}
                      className="p-0.5 rounded hover:bg-border-soft"
                      disabled={cPays.length === 0}
                    >
                      {cPays.length > 0
                        ? (expanded ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />)
                        : <span className="inline-block w-3.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink">{monthLabel(c.period_start)}</p>
                      <p className="text-[11px] text-faint">
                        {st === 'paid' || paid <= PAY_TOLERANCE
                          ? fmtMoney(c.amount)
                          : t.ledger.paidOfAmount.replace('{{paid}}', fmtMoney(paid)).replace('{{total}}', fmtMoney(c.amount))}
                      </p>
                    </div>
                    {statusChip(st, chargeDaysLate(c))}
                    {canEdit ? (
                      <>
                        {st !== 'paid' ? (
                          <Button size="sm" variant="secondary" onClick={() => openRecordPayment(c)}>
                            {t.ledger.recordPaymentBtn}
                          </Button>
                        ) : null}
                        <button onClick={() => { setChargeEditId(c.id); setChargeAmount(String(c.amount)); }}
                          className="p-1.5 rounded-lg hover:bg-border-soft">
                          <Pencil size={13} className="text-muted" />
                        </button>
                      </>
                    ) : null}
                  </div>
                  {expanded && cPays.length > 0 ? (
                    <div className="ml-7 mt-1.5 flex flex-col gap-1">
                      {cPays.map(p => (
                        <div key={p.id} className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5">
                          <p className="text-xs text-ink">{fmtMoney(p.amount)}</p>
                          <p className="text-[11px] text-muted flex-1 truncate">
                            {[p.method, formatDateLong(`${p.paid_on}T00:00:00`, locale), p.note].filter(Boolean).join(' · ')}
                          </p>
                          {p.photo_path ? (
                            <button onClick={() => viewPaymentPhoto(p)} className="p-1 rounded hover:bg-border-soft">
                              <Camera size={12} className="text-muted" />
                            </button>
                          ) : null}
                          {canEdit ? (
                            <>
                              <button onClick={() => openEditPayment(c, p)} className="p-1 rounded hover:bg-border-soft">
                                <Pencil size={12} className="text-muted" />
                              </button>
                              <button onClick={() => deletePayment(p)} className="p-1 rounded hover:bg-border-soft">
                                <Trash2 size={12} className="text-red-500" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink mb-4">
        <ArrowLeft size={16} />
        {tc.buttons.back}
      </button>

      <div className="flex items-start justify-between mb-5 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0">
            <Home size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink truncate">{property.name}</h1>
            <p className="text-xs text-muted truncate">
              {[property.address, property.city, property.state].filter(Boolean).join(', ') || '—'}
              {property.status === 'inactive' ? ` · ${t.propertyStatus.inactive}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit ? <Button variant="secondary" size="sm" onClick={onEdit}><Pencil size={13} className="mr-1.5" />{tc.buttons.edit}</Button> : null}
          {canDelete ? <Button variant="danger" size="sm" onClick={onDelete}><Trash2 size={13} className="mr-1.5" />{tc.buttons.delete}</Button> : null}
        </div>
      </div>

      <div className="flex items-center gap-1 mb-5 border-b border-border-soft overflow-x-auto">
        {detailTabs.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
        </div>
      ) : null}

      {!loading && tab === 'overview' ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-border-soft bg-card p-4">
              <p className="text-xs text-muted">{t.detailTabs.leases}</p>
              <p className="text-xl font-bold text-ink mt-1">{activeLeases.length}</p>
            </div>
            <div className="rounded-2xl border border-border-soft bg-card p-4">
              <p className="text-xs text-muted">{t.ledger.balanceLabel}</p>
              <p className={`text-xl font-bold mt-1 ${totalBalance > PAY_TOLERANCE ? 'text-red-600' : 'text-emerald-600'}`}>
                {fmtMoney(Math.max(0, totalBalance))}
              </p>
            </div>
            <div className="rounded-2xl border border-border-soft bg-card p-4">
              <p className="text-xs text-muted">{t.overview.expensesLabel}</p>
              <p className="text-xl font-bold text-ink mt-1">{fmtMoney(totalExpenses)}</p>
            </div>
            <div className="rounded-2xl border border-border-soft bg-card p-4">
              <p className="text-xs text-muted">{t.detailTabs.maintenance}</p>
              <p className="text-xl font-bold text-ink mt-1">{openMaint}</p>
            </div>
          </div>
          {property.notes ? (
            <div className="rounded-2xl border border-border-soft bg-card p-4">
              <p className="text-xs font-medium text-muted mb-1">{t.propertyForm.notesLabel}</p>
              <p className="text-sm text-ink whitespace-pre-wrap">{property.notes}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && tab === 'leases' ? (
        <div className="flex flex-col gap-3">
          {canCreate ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={openAddLease} disabled={tenants.length === 0}>
                <Plus size={13} className="mr-1.5" />{t.leases.addBtn}
              </Button>
            </div>
          ) : null}
          {leases.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border-soft p-8 text-center">
              <p className="text-sm text-muted">{t.leases.empty}</p>
            </div>
          ) : (
            [...leases].sort((a, b) => (a.status === b.status ? b.start_date.localeCompare(a.start_date) : a.status === 'active' ? -1 : 1)).map(leaseCard)
          )}
        </div>
      ) : null}

      {!loading && tab === 'ledger' ? (
        <div className="flex flex-col gap-3">
          {leases.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border-soft p-8 text-center">
              <p className="text-sm text-muted">{t.leases.empty}</p>
            </div>
          ) : (
            [...leases].sort((a, b) => (a.status === b.status ? b.start_date.localeCompare(a.start_date) : a.status === 'active' ? -1 : 1)).map(ledgerForLease)
          )}
        </div>
      ) : null}

      {!loading && tab === 'expenses' ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">
              {t.expenses.totalLabel}: {fmtMoney(totalExpenses)}
            </p>
            {canCreate ? (
              <Button size="sm" onClick={openAddExpense}><Plus size={13} className="mr-1.5" />{t.expenses.addBtn}</Button>
            ) : null}
          </div>
          {expenses.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border-soft p-8 text-center">
              <p className="text-sm text-muted">{t.expenses.empty}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border-soft bg-card divide-y divide-border-soft">
              {expenses.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink truncate">
                      {t.expenses.categories[e.category]}
                      {e.vendor ? ` · ${e.vendor}` : ''}
                      {e.maintenance_id ? (
                        <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600">
                          {t.expenses.fromMaintenance}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-muted truncate">
                      {formatDateLong(`${e.expense_date}T00:00:00`, locale)}{e.note ? ` · ${e.note}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-ink shrink-0">{fmtMoney(e.amount)}</p>
                  {e.receipt_path ? (
                    <button onClick={() => viewReceipt(e)} className="p-1.5 rounded-lg hover:bg-border-soft">
                      <Camera size={13} className="text-muted" />
                    </button>
                  ) : null}
                  {canEdit ? (
                    <button onClick={() => openEditExpense(e)} className="p-1.5 rounded-lg hover:bg-border-soft">
                      <Pencil size={13} className="text-muted" />
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button onClick={() => deleteExpense(e)} className="p-1.5 rounded-lg hover:bg-border-soft">
                      <Trash2 size={13} className="text-red-500" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!loading && tab === 'maintenance' ? (
        <div className="flex flex-col gap-3">
          {canCreate ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={openAddMaint}><Plus size={13} className="mr-1.5" />{t.maintenance.addBtn}</Button>
            </div>
          ) : null}
          {maintenance.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border-soft p-8 text-center">
              <Wrench size={28} className="text-faint mx-auto mb-2" />
              <p className="text-sm text-muted">{t.maintenance.empty}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border-soft bg-card divide-y divide-border-soft">
              {maintenance.map(m => {
                const stCls = m.status === 'done' ? 'bg-emerald-500/10 text-emerald-700'
                  : m.status === 'in_progress' ? 'bg-amber-500/10 text-amber-700'
                  : 'bg-red-500/10 text-red-700';
                const stLabel = m.status === 'done' ? t.maintenance.statusDone
                  : m.status === 'in_progress' ? t.maintenance.statusInProgress
                  : t.maintenance.statusOpen;
                const emp = m.employee_id ? employees.find(e => e.id === m.employee_id) : null;
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink truncate">{m.title}</p>
                      <p className="text-[11px] text-muted truncate">
                        {formatDateLong(`${m.reported_on}T00:00:00`, locale)}
                        {m.cost != null ? ` · ${fmtMoney(m.cost)}` : ''}
                        {emp ? ` · ${emp.first_name} ${emp.last_name}` : m.fixed_by ? ` · ${m.fixed_by}` : ''}
                      </p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${stCls}`}>{stLabel}</span>
                    {canEdit ? (
                      <button onClick={() => openEditMaint(m)} className="p-1.5 rounded-lg hover:bg-border-soft">
                        <Pencil size={13} className="text-muted" />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button onClick={() => deleteMaint(m)} className="p-1.5 rounded-lg hover:bg-border-soft">
                        <Trash2 size={13} className="text-red-500" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {!loading && tab === 'photos' ? (
        <div className="flex flex-col gap-3">
          {canEdit ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => photoInputRef.current?.click()} loading={uploadingPhoto}>
                <Plus size={13} className="mr-1.5" />{t.photos.addBtn}
              </Button>
            </div>
          ) : null}
          {photos.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border-soft p-8 text-center">
              <Camera size={28} className="text-faint mx-auto mb-2" />
              <p className="text-sm text-muted">{t.photos.heading}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {photos.map(p => (
                <div key={p.id} className="relative group rounded-xl overflow-hidden border border-border-soft aspect-video bg-surface">
                  {photoUrls[p.storage_path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrls[p.storage_path]} alt="" className="w-full h-full object-cover"
                      style={{ transform: `rotate(${p.rotation}deg)` }} />
                  ) : null}
                  {canEdit ? (
                    <button onClick={() => deletePhoto(p)}
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={13} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Hidden file inputs */}
      <input ref={docInputRef} type="file" className="hidden" onChange={onDocChosen} />
      <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPhotosChosen} />
      <input ref={payPhotoInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setPayPhotoFile(f); setPayPhotoRemoved(false); } }} />
      <input ref={receiptInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setReceiptFile(f); setReceiptRemoved(false); } }} />

      {/* Lease form */}
      <Modal open={leaseFormOpen} onClose={() => setLeaseFormOpen(false)}
        title={editingLease ? t.leases.editTitle : renewSource ? t.leases.renewTitle : t.leases.addBtn} size="lg">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t.leases.form.tenantLabel}</label>
            <select value={leaseForm.tenant_id} onChange={e => setLeaseForm(f => ({ ...f, tenant_id: e.target.value }))}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink">
              <option value="">{t.leases.form.tenantPlaceholder}</option>
              {tenants.map(tn => <option key={tn.id} value={tn.id}>{tenantName(tn)}</option>)}
            </select>
          </div>
          <Input label={t.leases.form.unitLabel} placeholder={t.leases.form.unitPlaceholder} value={leaseForm.unit_label}
            onChange={e => setLeaseForm(f => ({ ...f, unit_label: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.leases.form.startLabel} type="date" value={leaseForm.start_date}
              onChange={e => setLeaseForm(f => ({ ...f, start_date: e.target.value }))} />
            <Input label={t.leases.form.endLabel} type="date" hint={t.leases.form.endHint} value={leaseForm.end_date}
              onChange={e => setLeaseForm(f => ({ ...f, end_date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label={t.leases.form.rentLabel} leftIcon={<span className="text-sm">$</span>}
              value={withCommas(leaseForm.monthly_rent)}
              onChange={e => setLeaseForm(f => ({ ...f, monthly_rent: sanitizeMoney(e.target.value) }))} />
            <Input label={t.leases.form.dueDayLabel} hint={t.leases.form.dueDayHint} inputMode="numeric" value={leaseForm.due_day}
              onChange={e => setLeaseForm(f => ({ ...f, due_day: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) }))} />
            <Input label={t.leases.form.depositLabel} leftIcon={<span className="text-sm">$</span>}
              value={withCommas(leaseForm.deposit_amount)}
              onChange={e => setLeaseForm(f => ({ ...f, deposit_amount: sanitizeMoney(e.target.value) }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">{t.leases.form.notesLabel}</label>
            <textarea rows={2} value={leaseForm.notes}
              onChange={e => setLeaseForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          {leaseError ? <p className="text-sm text-red-600">{leaseError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLeaseFormOpen(false)}>{tc.buttons.cancel}</Button>
            <Button onClick={saveLease} loading={savingLease}
              disabled={!leaseForm.tenant_id || !leaseForm.start_date || !Number(leaseForm.monthly_rent)}>
              {tc.buttons.save}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Record / edit payment */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={payEditId ? t.payments.editTitle : t.payments.recordTitle}>
        <div className="flex flex-col gap-4">
          <Input label={t.payments.amountLabel} leftIcon={<span className="text-sm">$</span>}
            value={withCommas(payAmount)}
            onChange={e => setPayAmount(sanitizeMoney(e.target.value))}
            rightIcon={payCharge ? (
              <button
                onClick={() => {
                  const others = (paymentsByCharge.get(payCharge.id) ?? []).filter(p => p.id !== payEditId);
                  const remaining = Math.max(0, payCharge.amount - others.reduce((s, p) => s + p.amount, 0));
                  setPayAmount(String(Math.round(remaining * 100) / 100));
                }}
                className="text-xs font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5"
              >
                {t.payments.fullAmountBtn}
              </button>
            ) : undefined} />
          <Input label={t.payments.methodLabel} placeholder={t.payments.methodPlaceholder} value={payMethod}
            onChange={e => setPayMethod(e.target.value)} />
          <Input label={t.payments.dateLabel} type="date" value={payDate}
            onChange={e => setPayDate(e.target.value)} />
          <Input label={t.payments.noteLabel} value={payNote} onChange={e => setPayNote(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t.payments.photoLabel}</label>
            {payPhotoFile || (payPhotoPath && !payPhotoRemoved) ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted truncate">{payPhotoFile?.name ?? payPhotoPath?.split('/').pop()}</span>
                <button onClick={() => payPhotoInputRef.current?.click()} className="text-xs font-semibold text-primary hover:underline">{t.payments.changePhoto}</button>
                <button onClick={() => { setPayPhotoFile(null); setPayPhotoRemoved(true); }} className="text-xs font-semibold text-red-600 hover:underline">{t.payments.removePhoto}</button>
              </div>
            ) : (
              <button onClick={() => payPhotoInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-border-soft px-3 py-2 text-sm text-muted hover:bg-border">
                <Camera size={15} />
                {t.payments.addPhoto}
              </button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayOpen(false)}>{tc.buttons.cancel}</Button>
            <Button onClick={submitPayment} loading={payBusy} disabled={!(Number(payAmount) >= 0) || payAmount === ''}>
              {payEditId ? tc.buttons.save : t.payments.recordBtn}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Charge amount edit */}
      <Modal open={!!chargeEditId} onClose={() => setChargeEditId(null)} title={t.ledger.editChargeTitle} size="sm">
        <div className="flex flex-col gap-4">
          <Input label={t.ledger.chargeAmountLabel} leftIcon={<span className="text-sm">$</span>}
            value={withCommas(chargeAmount)}
            onChange={e => setChargeAmount(sanitizeMoney(e.target.value))} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setChargeEditId(null)}>{tc.buttons.cancel}</Button>
            <Button onClick={saveCharge} loading={chargeBusy} disabled={!Number(chargeAmount)}>{tc.buttons.save}</Button>
          </div>
        </div>
      </Modal>

      {/* Expense form */}
      <Modal open={expenseFormOpen} onClose={() => setExpenseFormOpen(false)} title={editingExpense ? t.expenses.editTitle : t.expenses.addBtn}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.expenses.form.dateLabel} type="date" value={expenseForm.expense_date}
              onChange={e => setExpenseForm(f => ({ ...f, expense_date: e.target.value }))} />
            <Input label={t.expenses.form.amountLabel} leftIcon={<span className="text-sm">$</span>}
              value={withCommas(expenseForm.amount)}
              onChange={e => setExpenseForm(f => ({ ...f, amount: sanitizeMoney(e.target.value) }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t.expenses.form.categoryLabel}</label>
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_CATEGORIES.map(k => (
                <button key={k} onClick={() => setExpenseForm(f => ({ ...f, category: k }))}
                  className={`px-2.5 py-1.5 rounded-full border text-xs font-medium ${
                    expenseForm.category === k ? 'bg-primary border-primary text-white' : 'bg-card border-border text-ink hover:bg-surface'
                  }`}>
                  {t.expenses.categories[k]}
                </button>
              ))}
            </div>
          </div>
          <Input label={t.expenses.form.vendorLabel} placeholder={t.expenses.form.vendorPlaceholder} value={expenseForm.vendor}
            onChange={e => setExpenseForm(f => ({ ...f, vendor: e.target.value }))} />
          <Input label={t.expenses.form.noteLabel} value={expenseForm.note}
            onChange={e => setExpenseForm(f => ({ ...f, note: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t.expenses.form.receiptLabel}</label>
            {receiptFile || (editingExpense?.receipt_path && !receiptRemoved) ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted truncate">{receiptFile?.name ?? editingExpense?.receipt_path?.split('/').pop()}</span>
                <button onClick={() => receiptInputRef.current?.click()} className="text-xs font-semibold text-primary hover:underline">{t.expenses.form.changeReceipt}</button>
                <button onClick={() => { setReceiptFile(null); setReceiptRemoved(true); }} className="text-xs font-semibold text-red-600 hover:underline">{t.expenses.form.removeReceipt}</button>
              </div>
            ) : (
              <button onClick={() => receiptInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-border-soft px-3 py-2 text-sm text-muted hover:bg-border">
                <Camera size={15} />
                {t.expenses.form.addReceipt}
              </button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setExpenseFormOpen(false)}>{tc.buttons.cancel}</Button>
            <Button onClick={saveExpense} loading={savingExpense} disabled={!Number(expenseForm.amount)}>{tc.buttons.save}</Button>
          </div>
        </div>
      </Modal>

      {/* Maintenance form */}
      <Modal open={maintFormOpen} onClose={() => setMaintFormOpen(false)} title={editingMaint ? t.maintenance.editTitle : t.maintenance.addBtn} size="lg">
        <div className="flex flex-col gap-4">
          <Input label={t.maintenance.form.titleLabel} placeholder={t.maintenance.form.titlePlaceholder} value={maintForm.title}
            onChange={e => setMaintForm(f => ({ ...f, title: e.target.value }))} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">{t.maintenance.form.descriptionLabel}</label>
            <textarea rows={2} value={maintForm.description}
              onChange={e => setMaintForm(f => ({ ...f, description: e.target.value }))}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">{t.maintenance.form.statusLabel}</label>
              <select value={maintForm.status} onChange={e => setMaintForm(f => ({ ...f, status: e.target.value as MaintenanceStatus }))}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink">
                <option value="open">{t.maintenance.statusOpen}</option>
                <option value="in_progress">{t.maintenance.statusInProgress}</option>
                <option value="done">{t.maintenance.statusDone}</option>
              </select>
            </div>
            <Input label={t.maintenance.form.reportedLabel} type="date" value={maintForm.reported_on}
              onChange={e => setMaintForm(f => ({ ...f, reported_on: e.target.value }))} />
            <Input label={t.maintenance.form.completedLabel} type="date" value={maintForm.completed_on}
              onChange={e => setMaintForm(f => ({ ...f, completed_on: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label={t.maintenance.form.costLabel} leftIcon={<span className="text-sm">$</span>}
              value={withCommas(maintForm.cost)}
              onChange={e => setMaintForm(f => ({ ...f, cost: sanitizeMoney(e.target.value) }))} />
            <Input label={t.maintenance.form.fixedByLabel} placeholder={t.maintenance.form.fixedByPlaceholder} value={maintForm.fixed_by}
              onChange={e => setMaintForm(f => ({ ...f, fixed_by: e.target.value }))} />
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">{t.maintenance.form.employeeLabel}</label>
              <select value={maintForm.employee_id} onChange={e => setMaintForm(f => ({ ...f, employee_id: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink">
                <option value="">—</option>
                {employees.filter(e => e.active || e.id === maintForm.employee_id).map(e => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-3">
            <div>
              <p className="text-sm font-medium text-ink">{t.maintenance.createExpenseToggle}</p>
              <p className="text-xs text-muted">{t.maintenance.createExpenseHint}</p>
            </div>
            <Toggle checked={maintForm.createExpense} onChange={v => setMaintForm(f => ({ ...f, createExpense: v }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMaintFormOpen(false)}>{tc.buttons.cancel}</Button>
            <Button onClick={saveMaint} loading={savingMaint} disabled={!maintForm.title.trim()}>{tc.buttons.save}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
