'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { confirm, alertMessage } from '@amixos/shared/ui/confirmBus';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Phone, Mail, MapPin, FileText, Plus, Pencil, Building2, Trash2, Star, UserPlus, Printer, Share2 } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/i18n/LangProvider';
import { formatDateLong, formatDateTimeLong, formatNumberGrouped } from '@amixos/shared/lib/format';
import { triggerGoogleSync, triggerClientContactGoogleSync } from '@amixos/shared/lib/googleSync';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { useRouter } from 'next/navigation';
import { buildClientCsv } from '@amixos/shared/lib/clientShare';
import { usStateName } from '@amixos/shared/lib/usStates';
import { CommunicationLog } from '@amixos/shared/screens/dashboard/CommunicationLog';
import { useContactOutcomePrompt } from '@/modules/communications/useContactOutcomePrompt';

interface FieldTemplate {
  id: string; field_key: string; field_label: string;
  field_type: string; field_options: string[] | null; required: boolean; sort_order: number;
}

interface Client {
  id: string;
  first_name: string; last_name: string;
  company: string | null;
  phone: string | null;
  phone_cell: string | null; phone_office: string | null;
  email: string | null;
  email_office: string | null; email_home: string | null;
  address: string | null; address_line2: string | null;
  city: string | null; state: string | null; zip_code: string | null;
  lat: number | null; lng: number | null;
  notes: string | null;
  custom_fields: Record<string, string> | null;
  created_at: string; updated_at: string;
}

interface ClientContact {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_primary: boolean;
  created_at: string;
}

interface Invoice {
  id: string; invoice_number: string; status: string; total_amount: number; due_date: string | null; created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-500',
  sent:     'bg-blue-100 text-blue-600',
  paid:     'bg-emerald-100 text-emerald-700',
  overdue:  'bg-red-100 text-red-600',
  cancelled:'bg-gray-100 text-gray-400',
};

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const EMPTY_CONTACT = { name: '', role: '', phone: '', email: '', notes: '', is_primary: false };

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return raw;
}

function fmtPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

function ContactRow({ icon, label, value, href, onActivate }: { icon: React.ReactNode; label: string; value: string; href?: string; onActivate?: () => void }) {
  const content = (
    <div className="flex items-start gap-2.5">
      <span className="text-gray-400 mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm text-gray-900 font-medium">{value}</p>
      </div>
    </div>
  );
  // onActivate wins over href: routes the contact through the confirm-
  // outcome prompt so it gets logged, instead of a bare tel:/mailto: link.
  if (onActivate) return <button type="button" onClick={onActivate} className="text-left hover:text-primary transition-colors">{content}</button>;
  if (href) {
    const external = href.startsWith('http');
    return <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="hover:text-primary transition-colors">{content}</a>;
  }
  return <div>{content}</div>;
}

export default function ClienteDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const searchParams = useSearchParams();
  const { t: full, locale } = useLang();
  const t = full.dashboard.clients;
  const td = t.detail;
  const tc = full.common;
  const router = useRouter();

  // Delete the whole client. Mirrors mobile: sync the delete to Google BEFORE
  // dropping the local row (the API needs the row's google_resource_name), then
  // navigate back to the list.
  const deleteClient = async () => {
    if (!client) return;
    if (!(await confirm({ message: t.confirmDeleteSingle, destructive: true }))) return;
    const apiBaseUrl = getApiBaseUrl();
    const jwt = await getJwt();
    if (apiBaseUrl && jwt) {
      try { await triggerGoogleSync('delete', id, { apiBaseUrl, jwt }); } catch { /* best-effort */ }
    }
    await supabase.from('clients').delete().eq('id', id);
    router.push('/dashboard/clientes');
  };
  const tStatus = full.dashboard.invoiceStatus;
  const supabase = createSupabaseClient();
  const { business, user } = useApp();
  const [client, setClient] = useState<Client | null>(null);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [loading, setLoading] = useState(true);

  // Communication log: bump to refetch the timeline after a contact is
  // logged via the confirm-outcome prompt.
  const [commReload, setCommReload] = useState(0);
  const { fireContact, prompt: contactPrompt } = useContactOutcomePrompt({
    supabase,
    businessId: business?.id,
    createdBy: user?.id ?? null,
    onLogged: () => setCommReload(n => n + 1),
  });

  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState({
    first_name: '', last_name: '', company: '',
    phone_cell: '', phone_office: '',
    email_office: '', email_home: '',
    address: '', address_line2: '', city: '', state: '', zip_code: '',
    notes: '', price_tier_id: '',
  });
  const [priceTiers, setPriceTiers] = useState<{ id: string; name: string }[]>([]);
  const [customVals, setCustomVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [contactModal, setContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState('');
  // Distinct role values across this business — fed into the role
  // field's autocomplete so previously-typed titles can be reused.
  const [roleSuggestions, setRoleSuggestions] = useState<string[]>([]);

  // Share / print dialog state. PDF rendering happens on a dedicated
  // print route (window.print fires on mount) so we don't have to lug a
  // PDF lib into the main bundle.
  const [shareDialog, setShareDialog] = useState(false);

  const buildShareLabels = () => ({
    first_name: t.fields.firstName,
    last_name: t.fields.lastName,
    company: t.fields.company,
    phone_cell: t.fields.phoneCell,
    phone_office: t.fields.phoneOffice,
    email_office: t.fields.emailOffice,
    email_home: t.fields.emailHome,
    address: t.fields.addressLine1,
    address_line2: t.fields.addressLine2,
    city: t.fields.city,
    state: t.fields.state,
    zip_code: t.fields.zipCode,
    notes: t.fields.notes,
  });

  const onShareCsv = () => {
    if (!client) return;
    const csv = buildClientCsv(
      client,
      buildShareLabels(),
      templates.map(tpl => ({ field_key: tpl.field_key, field_label: tpl.field_label })),
    );
    const safeName = [client.first_name, client.last_name]
      .filter(Boolean)
      .join('_')
      .replace(/[^a-zA-Z0-9_-]/g, '') || 'cliente';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Opens the dedicated print route in a new tab. That page reads the
  // ?fields=basic|all param, fetches the client itself, and calls
  // window.print() on mount — browsers can then "Save as PDF" via the
  // print dialog.
  const openPrintView = (includeAll: boolean) => {
    const params = new URLSearchParams({ fields: includeAll ? 'all' : 'basic' });
    // /print/... lives outside the dashboard layout so the sidebar/banner
    // don't bleed into the print output.
    window.open(`/print/clientes/${id}?${params.toString()}`, '_blank');
    setShareDialog(false);
  };

  const load = async () => {
    if (!business) return;
    const [{ data: c }, { data: inv }, { data: tpl }, { data: cts }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('invoices').select('id, invoice_number, status, total_amount, due_date, created_at')
        .eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('client_field_templates').select('*').eq('business_id', business.id).order('sort_order'),
      supabase.from('client_contacts').select('*').eq('client_id', id).order('is_primary', { ascending: false }),
    ]);
    if (c) {
      setClient(c);
      setForm({
        first_name: c.first_name, last_name: c.last_name, company: c.company ?? '',
        phone_cell: c.phone_cell ?? c.phone ?? '', phone_office: c.phone_office ?? '',
        email_office: c.email_office ?? c.email ?? '', email_home: c.email_home ?? '',
        address: c.address ?? '', address_line2: c.address_line2 ?? '',
        city: c.city ?? '', state: c.state ?? '', zip_code: c.zip_code ?? '',
        notes: c.notes ?? '', price_tier_id: (c as { price_tier_id?: string | null }).price_tier_id ?? '',
      });
      setCustomVals(c.custom_fields ?? {});
    }
    setInvoices(inv ?? []);
    setTemplates(tpl ?? []);
    setContacts(cts ?? []);
    setLoading(false);

    // Background fetch of distinct role values across the business.
    const { data: roleRows } = await supabase
      .from('client_contacts')
      .select('role')
      .eq('business_id', business.id)
      .not('role', 'is', null)
      .neq('role', '');
    const unique = Array.from(
      new Set(
        ((roleRows as { role: string }[] | null) ?? [])
          .map(r => r.role.trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, 'es'));
    setRoleSuggestions(unique);
  };

  useEffect(() => { load(); }, [id, business]);
  useEffect(() => {
    if (!business) return;
    supabase.from('price_tiers').select('id, name').eq('business_id', business.id).order('sort_order')
      .then(({ data }) => setPriceTiers((data ?? []) as { id: string; name: string }[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const saveEdit = async () => {
    setEditError('');
    for (const em of [form.email_office, form.email_home]) {
      if (em.trim() && !isValidEmail(em)) { setEditError(tc.validation.invalidEmail); return; }
    }
    setSaving(true);
    const payload = {
      first_name: form.first_name.trim(), last_name: form.last_name.trim(),
      company: form.company.trim() || null,
      phone_cell: form.phone_cell.trim() || null, phone_office: form.phone_office.trim() || null,
      email_office: form.email_office.trim() || null, email_home: form.email_home.trim() || null,
      address: form.address.trim() || null, address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null, state: form.state.trim() || null, zip_code: form.zip_code.trim() || null,
      notes: form.notes.trim() || null,
      price_tier_id: form.price_tier_id || null,
      custom_fields: Object.keys(customVals).length > 0 ? customVals : null,
    };
    await supabase.from('clients').update(payload).eq('id', id);
    setClient(prev => prev ? { ...prev, ...payload } : prev);
    // Mirror the edit to Google Contacts (fire-and-forget — sync is
    // best-effort and shouldn't slow the modal close).
    void (async () => {
      const apiBaseUrl = getApiBaseUrl();
      const jwt = await getJwt();
      if (apiBaseUrl && jwt) triggerGoogleSync('update', id, { apiBaseUrl, jwt });
    })();
    setSaving(false); setEditModal(false);
  };

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm(EMPTY_CONTACT);
    setContactError('');
    setContactModal(true);
  };

  const openEditContact = (ct: ClientContact) => {
    setEditingContact(ct);
    setContactForm({ name: ct.name, role: ct.role ?? '', phone: ct.phone ?? '', email: ct.email ?? '', notes: ct.notes ?? '', is_primary: ct.is_primary });
    setContactError('');
    setContactModal(true);
  };

  const saveContact = async () => {
    if (!contactForm.name.trim()) return;
    if (contactForm.email.trim() && !isValidEmail(contactForm.email)) {
      setContactError(tc.validation.invalidEmail);
      return;
    }
    setContactError('');
    setSavingContact(true);
    const payload = {
      name: contactForm.name.trim(),
      role: contactForm.role.trim() || null,
      phone: contactForm.phone.trim() || null,
      email: contactForm.email.trim() || null,
      notes: contactForm.notes.trim() || null,
      is_primary: contactForm.is_primary,
    };

    if (contactForm.is_primary) {
      await supabase.from('client_contacts').update({ is_primary: false }).eq('client_id', id);
    }

    let syncContactId: string | null = null;
    let syncAction: 'create' | 'update' = 'update';
    if (editingContact) {
      await supabase.from('client_contacts').update(payload).eq('id', editingContact.id);
      syncContactId = editingContact.id;
    } else {
      const { data: inserted } = await supabase
        .from('client_contacts')
        .insert({ ...payload, client_id: id, business_id: business!.id })
        .select('id')
        .single();
      syncContactId = (inserted as { id: string } | null)?.id ?? null;
      syncAction = 'create';
    }

    const { data } = await supabase.from('client_contacts').select('*').eq('client_id', id).order('is_primary', { ascending: false });
    setContacts(data ?? []);
    setSavingContact(false);
    setContactModal(false);

    if (syncContactId) {
      void (async () => {
        const apiBaseUrl = getApiBaseUrl();
        const jwt = await getJwt();
        if (apiBaseUrl && jwt) {
          triggerClientContactGoogleSync(syncAction, syncContactId!, { apiBaseUrl, jwt });
        }
      })();
    }
  };

  const removeContact = async (ctId: string) => {
    if (!(await confirm({ message: td.contactModal.confirmDelete, destructive: true }))) return;
    // Sync delete BEFORE local delete so the API can resolve the contact's
    // google_resource_name.
    const apiBaseUrl = getApiBaseUrl();
    const jwt = await getJwt();
    if (apiBaseUrl && jwt) {
      await triggerClientContactGoogleSync('delete', ctId, { apiBaseUrl, jwt });
    }
    await supabase.from('client_contacts').delete().eq('id', ctId);
    setContacts(prev => prev.filter(c => c.id !== ctId));
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}</div>
    </div>
  );
  if (!client) return <div className="p-6 text-gray-400">{t.notFound}</div>;

  const totalSpent = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total_amount, 0);
  const pendingTotal = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.total_amount, 0);

  const primaryPhone = client.phone_cell ?? client.phone;
  const officePhone = client.phone_office;
  const primaryEmail = client.email_office ?? client.email;
  const homeEmail = client.email_home;

  const fullAddress = [
    client.address,
    client.address_line2,
    [client.city, client.state].filter(Boolean).join(', '),
    client.zip_code,
  ].filter(Boolean).join('\n');

  // Maps link for the address — prefers geocoded coords, falls back to the
  // address string. Opens in a new tab.
  const clientMapsUrl = (() => {
    if (client.lat != null && client.lng != null) return `https://maps.google.com/?q=${client.lat},${client.lng}`;
    const q = [client.address, client.address_line2, client.city, client.state, client.zip_code].filter(Boolean).join(' ');
    return q ? `https://maps.google.com/?q=${encodeURIComponent(q)}` : '';
  })();

  // ?from=job&job=… / ?from=invoice&invoice=… → back arrow returns to that
  // record instead of the clients list.
  const fromJob = searchParams.get('from') === 'job' ? searchParams.get('job') : null;
  const fromInvoice = searchParams.get('from') === 'invoice' ? searchParams.get('invoice') : null;
  const backHref = fromJob
    ? `/dashboard/trabajos/${fromJob}`
    : fromInvoice
      ? `/dashboard/facturas/${fromInvoice}`
      : '/dashboard/clientes';

  const dateLoc = full.dashboard.dateLocale;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href={backHref} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} className="text-gray-500"/>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary text-lg font-bold">
                {client.first_name.charAt(0)}{client.last_name.charAt(0)}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{client.first_name} {client.last_name}</h1>
              {client.company && (
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <Building2 size={13} className="text-gray-400"/> {client.company}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={deleteClient}
            className="text-red-600 hover:bg-red-50 hover:text-red-700">
            <Trash2 size={14} className="mr-1.5"/> {tc.buttons.delete}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShareDialog(true)}>
            <Printer size={14} className="mr-1.5"/> {td.sharePdfBtn}
          </Button>
          <Button variant="secondary" size="sm" onClick={onShareCsv}>
            <Share2 size={14} className="mr-1.5"/> CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setEditError(''); setEditModal(true); }}>
            <Pencil size={14} className="mr-1.5"/> {tc.buttons.edit}
          </Button>
          <Link href={`/dashboard/trabajos/nuevo?client=${id}`}>
            <Button variant="secondary" size="sm"><Plus size={14} className="mr-1.5"/> {full.dashboard.jobs.newDropdown.jobOption}</Button>
          </Link>
          <Link href={`/dashboard/facturas/nueva?client=${id}`}>
            <Button size="sm"><Plus size={14} className="mr-1.5"/> {full.dashboard.invoices.newInvoice}</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Contact card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{td.contact}</h2>
            <div className="flex flex-col gap-3">
              {primaryPhone && <ContactRow icon={<Phone size={15}/>} label={t.fields.phoneCell} value={fmtPhone(primaryPhone)} onActivate={() => fireContact({ type: 'call', target: `tel:${primaryPhone}`, contactMethod: primaryPhone, clientId: client.id })}/>}
              {officePhone && <ContactRow icon={<Phone size={15}/>} label={t.fields.phoneOffice} value={fmtPhone(officePhone)} onActivate={() => fireContact({ type: 'call', target: `tel:${officePhone}`, contactMethod: officePhone, clientId: client.id })}/>}
              {primaryEmail && <ContactRow icon={<Mail size={15}/>} label={t.fields.emailOffice} value={primaryEmail} onActivate={() => fireContact({ type: 'email', target: `mailto:${primaryEmail}`, contactMethod: primaryEmail, clientId: client.id })}/>}
              {homeEmail && <ContactRow icon={<Mail size={15}/>} label={t.fields.emailHome} value={homeEmail} onActivate={() => fireContact({ type: 'email', target: `mailto:${homeEmail}`, contactMethod: homeEmail, clientId: client.id })}/>}
              {fullAddress && (
                <ContactRow icon={<MapPin size={15}/>} label={t.fields.addressLine1} value={fullAddress} href={clientMapsUrl || undefined}/>
              )}
              {!primaryPhone && !primaryEmail && !fullAddress && (
                <p className="text-xs text-gray-400">{td.noContactInfo}</p>
              )}
            </div>
          </div>

          {/* Contacts (people) card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{td.contactPeople}</h2>
              <button onClick={openAddContact} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <UserPlus size={14} className="text-gray-400"/>
              </button>
            </div>
            {contacts.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-xs text-gray-400">{td.noContacts}</p>
                <button onClick={openAddContact} className="text-xs text-primary font-medium hover:underline mt-1">
                  {td.addContact}
                </button>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-gray-50">
                {contacts.map(ct => (
                  <div key={ct.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-gray-900 truncate">{ct.name}</p>
                          {ct.is_primary && <Star size={11} className="text-amber-400 fill-amber-400 shrink-0"/>}
                        </div>
                        {ct.role && <p className="text-xs text-gray-400">{ct.role}</p>}
                        {ct.phone && (
                          <button type="button" onClick={() => fireContact({ type: 'call', target: `tel:${ct.phone}`, contactMethod: ct.phone ?? undefined, clientId: client.id, clientContactId: ct.id })} className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                            <Phone size={11}/> {fmtPhone(ct.phone)}
                          </button>
                        )}
                        {ct.email && (
                          <button type="button" onClick={() => fireContact({ type: 'email', target: `mailto:${ct.email}`, contactMethod: ct.email ?? undefined, clientId: client.id, clientContactId: ct.id })} className="text-xs text-primary hover:underline flex items-center gap-1">
                            <Mail size={11}/> {ct.email}
                          </button>
                        )}
                        {ct.notes && <p className="text-xs text-gray-400 mt-1 italic">{ct.notes}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEditContact(ct)} className="p-1 rounded-lg hover:bg-blue-50 transition-colors">
                          <Pencil size={12} className="text-blue-400"/>
                        </button>
                        <button onClick={() => removeContact(ct.id)} className="p-1 rounded-lg hover:bg-red-50 transition-colors">
                          <Trash2 size={12} className="text-red-400"/>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Custom fields — hidden entirely when no field would render
             (only rows with a value, or required ones, are shown). */}
          {templates.some(tpl => client.custom_fields?.[tpl.field_key] || tpl.required) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.sections.customFields}</h2>
              <div className="flex flex-col gap-2.5">
                {templates.map(tpl => {
                  const val = client.custom_fields?.[tpl.field_key];
                  if (!val && !tpl.required) return null;
                  return (
                    <div key={tpl.field_key}>
                      <p className="text-xs text-gray-400">{tpl.field_label}</p>
                      <p className="text-sm text-gray-900 font-medium">
                        {tpl.field_type === 'boolean'
                          ? (val === 'true' ? tc.states.yes : tc.states.no)
                          : tpl.field_type === 'number' && val
                            ? formatNumberGrouped(val)
                            : val ?? '—'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {client.notes && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.sections.notes}</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}

          {/* Stats */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{td.summary}</h2>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{td.totalPaid}</span>
                <span className="font-semibold text-emerald-600">{fmt(totalSpent)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{td.pending}</span>
                <span className="font-semibold text-blue-600">{fmt(pendingTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{td.invoicesCount}</span>
                <span className="font-semibold text-gray-900">{invoices.length}</span>
              </div>
              <div className="flex justify-between text-sm pt-1 border-t border-gray-50">
                <span className="text-gray-400 text-xs">{td.addedAt}</span>
                <span className="text-xs text-gray-500">{formatDateTimeLong(client.created_at, dateLoc)}</span>
              </div>
              {client.updated_at && client.updated_at !== client.created_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400 text-xs">{td.modifiedAt}</span>
                  <span className="text-xs text-gray-500">{formatDateTimeLong(client.updated_at, dateLoc)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right — Invoices */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{td.invoicesTitle}</h2>
              <Link href={`/dashboard/facturas/nueva?client=${id}`} className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                <Plus size={13}/> {td.newInvoiceShort}
              </Link>
            </div>
            {invoices.length === 0 ? (
              <div className="px-5 py-12 text-center text-gray-400">
                <FileText size={32} className="mx-auto mb-3 opacity-30"/>
                <p className="text-sm">{td.noInvoices}</p>
                <Link href={`/dashboard/facturas/nueva?client=${id}`} className="text-primary text-xs font-medium hover:underline mt-1 inline-block">{td.createFirstInvoice}</Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {invoices.map(inv => {
                  const statusKey = inv.status as keyof typeof tStatus;
                  const statusLabel = tStatus[statusKey] ?? inv.status;
                  const statusColor = STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-500';
                  return (
                    <Link key={inv.id} href={`/dashboard/facturas/${inv.id}?from=client&client=${id}`}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{inv.invoice_number}</p>
                        <p className="text-xs text-gray-400">
                          {formatDateTimeLong(inv.created_at, dateLoc)}
                          {inv.due_date && ` · ${td.dueShort.replace('{{date}}', formatDateLong(inv.due_date, dateLoc))}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
                        <span className="text-sm font-bold text-gray-900">{fmt(inv.total_amount)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Communication log — below the invoices list. */}
          <div className="mt-5">
            <CommunicationLog
              supabase={supabase}
              businessId={business?.id ?? ''}
              clientId={client.id}
              createdBy={user?.id ?? null}
              contacts={contacts.map(c => ({ id: c.id, name: c.name }))}
              reloadToken={commReload}
            />
          </div>
        </div>
      </div>

      {/* ── Share/print dialog ────────────────────────────────────────────── */}
      <Modal open={shareDialog} onClose={() => setShareDialog(false)} title={td.shareDialogTitle} size="sm">
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={() => openPrintView(false)} fullWidth>
            {td.shareDialogBasic}
          </Button>
          <Button onClick={() => openPrintView(true)} fullWidth>
            {td.shareDialogAll}
          </Button>
        </div>
      </Modal>

      {/* ── Edit client modal ─────────────────────────────────────────────── */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title={t.modal.editTitle} size="lg">
        <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.sections.basicInfo}</p>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label={`${t.fields.firstName} *`} value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}/>
                <Input label={t.fields.lastName} value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}/>
              </div>
              <Input label={t.fields.company} value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} leftIcon={<Building2 size={15}/>}/>
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.sections.phones}</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label={t.fields.phoneCell} value={fmtPhoneInput(form.phone_cell)} onChange={e => setForm(f => ({ ...f, phone_cell: fmtPhoneInput(e.target.value) }))} leftIcon={<Phone size={15}/>} placeholder={t.fields.placeholders.phone}/>
              <Input label={t.fields.phoneOffice} value={fmtPhoneInput(form.phone_office)} onChange={e => setForm(f => ({ ...f, phone_office: fmtPhoneInput(e.target.value) }))} leftIcon={<Phone size={15}/>} placeholder={t.fields.placeholders.phone}/>
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.sections.emails}</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label={t.fields.emailOffice} type="email" value={form.email_office} onChange={e => setForm(f => ({ ...f, email_office: e.target.value }))} leftIcon={<Mail size={15}/>}/>
              <Input label={t.fields.emailHome} type="email" value={form.email_home} onChange={e => setForm(f => ({ ...f, email_home: e.target.value }))} leftIcon={<Mail size={15}/>}/>
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.sections.address}</p>
            <div className="flex flex-col gap-3">
              <Input label={t.fields.addressLine1} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} leftIcon={<MapPin size={15}/>}/>
              <Input label={t.fields.addressLine2} value={form.address_line2} onChange={e => setForm(f => ({ ...f, address_line2: e.target.value }))}/>
              <div className="grid grid-cols-[1fr_1fr_110px] gap-3">
                <Input label={t.fields.city} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}/>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">{t.fields.state}</label>
                  <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                    <option value="">—</option>
                    {US_STATES.map(s => <option key={s} value={s}>{usStateName(s, locale)}</option>)}
                  </select>
                </div>
                <Input label={t.fields.zipCode} value={form.zip_code} onChange={e => setForm(f => ({ ...f, zip_code: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))} inputMode="numeric"/>
              </div>
            </div>
          </section>

          {templates.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.sections.customFields}</p>
              <div className="grid grid-cols-2 gap-3">
                {templates.map(tpl => (
                  <div key={tpl.field_key} className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-gray-700">{tpl.field_label}</label>
                    {tpl.field_type === 'select' && tpl.field_options ? (
                      <select value={customVals[tpl.field_key] ?? ''}
                        onChange={e => setCustomVals(v => ({ ...v, [tpl.field_key]: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                        <option value="">—</option>
                        {tpl.field_options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : tpl.field_type === 'boolean' ? (
                      (() => {
                        // Three states — '', 'true', 'false'. Clicking the
                        // active button clears so user can return to "unanswered".
                        const cur = customVals[tpl.field_key] ?? '';
                        const yesActive = cur === 'true';
                        const noActive = cur === 'false';
                        return (
                          <div className="flex gap-2">
                            <button type="button"
                              onClick={() => setCustomVals(v => ({ ...v, [tpl.field_key]: yesActive ? '' : 'true' }))}
                              className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${yesActive ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                              {tc.states.yes}
                            </button>
                            <button type="button"
                              onClick={() => setCustomVals(v => ({ ...v, [tpl.field_key]: noActive ? '' : 'false' }))}
                              className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${noActive ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                              {tc.states.no}
                            </button>
                          </div>
                        );
                      })()
                    ) : (
                      <input type={tpl.field_type === 'number' ? 'number' : tpl.field_type === 'date' ? 'date' : 'text'}
                        value={customVals[tpl.field_key] ?? ''}
                        onChange={e => setCustomVals(v => ({ ...v, [tpl.field_key]: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary focus:border-transparent"/>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {priceTiers.length > 0 ? (
            <section>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{full.dashboard.settings.priceSheet.clientTierLabel}</p>
              <select value={form.price_tier_id} onChange={e => setForm(f => ({ ...f, price_tier_id: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary">
                <option value="">{full.dashboard.settings.priceSheet.clientTierNone}</option>
                {priceTiers.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
              </select>
            </section>
          ) : null}

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.sections.notes}</p>
            <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary focus:border-transparent resize-none"/>
          </section>

          {editError && <p className="text-xs text-red-500">{editError}</p>}
          <div className="flex gap-3 pt-1 pb-2">
            <Button variant="secondary" onClick={() => setEditModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={saveEdit} loading={saving} fullWidth>{tc.buttons.saveChanges}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Add / Edit contact modal ──────────────────────────────────────── */}
      <Modal open={contactModal} onClose={() => setContactModal(false)}
        title={editingContact ? td.contactModal.editTitle : td.contactModal.addTitle} size="md">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <Input label={td.contactModal.nameLabel} placeholder={td.contactModal.namePlaceholder}
              value={contactForm.name}
              onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}/>
            <Input label={td.contactModal.roleLabel} placeholder={td.contactModal.rolePlaceholder}
              value={contactForm.role}
              onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}
              list="contact-role-suggestions"/>
            <datalist id="contact-role-suggestions">
              {roleSuggestions.map(r => <option key={r} value={r} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={td.contactModal.phoneLabel} type="tel" placeholder={t.fields.placeholders.phone}
              value={fmtPhoneInput(contactForm.phone)}
              onChange={e => setContactForm(f => ({ ...f, phone: fmtPhoneInput(e.target.value) }))}
              leftIcon={<Phone size={15}/>}/>
            <Input label={td.contactModal.emailLabel} type="email" placeholder={td.contactModal.emailPlaceholder}
              value={contactForm.email}
              onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
              leftIcon={<Mail size={15}/>}/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{td.contactModal.notesLabel}</label>
            <textarea rows={3} placeholder={td.contactModal.notesPlaceholder}
              value={contactForm.notes}
              onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
          </div>
          <div className="flex items-center gap-3">
            <Toggle checked={contactForm.is_primary} onChange={(v) => setContactForm(f => ({ ...f, is_primary: v }))} />
            <span className="text-sm text-gray-700 select-none">{td.contactModal.primaryLabel} <Star size={12} className="inline text-primary fill-primary mb-0.5"/></span>
          </div>
          {contactError && <p className="text-xs text-red-500">{contactError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setContactModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={saveContact} loading={savingContact} disabled={!contactForm.name.trim()} fullWidth>
              {editingContact ? tc.buttons.saveChanges : td.contactModal.addBtn}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm-outcome prompt for the contact-card / contact-people actions. */}
      {contactPrompt}
    </div>
  );
}
