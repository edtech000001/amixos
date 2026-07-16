'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { confirm, alertMessage } from '@amixos/shared/ui/confirmBus';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { triggerGoogleSyncOrThrow, googleSyncErrorMessage } from '@amixos/shared/lib/googleSync';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import { parseHiddenFields, isFieldHidden } from '@amixos/shared/lib/fieldLayout';
import { CLIENT_FIELDS_ALWAYS_SHOWN } from '@amixos/shared/lib/clientFieldSections';
import { logAudit } from '@amixos/shared/lib/audit';
import { clientMatchesSearch } from '@amixos/shared/lib/clientSearch';
import { usePersistedSearch } from '@amixos/shared/lib/usePersistedSearch';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import ImportClientsModal from '@/components/dashboard/ImportClientsModal';
import { useLang } from '@/i18n/LangProvider';
import {
  ClientsListScreen,
  type ClientListItem,
} from '@amixos/shared/screens/dashboard/ClientsListScreen';
import {
  ClientFormModal,
  type ClientFormValues,
  type ClientFieldTemplate,
} from '@amixos/shared/screens/dashboard/ClientFormModal';

interface FieldTemplate extends ClientFieldTemplate {
  id: string;
  sort_order: number;
}

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  phone: string | null;
  phone_cell: string | null;
  phone_office: string | null;
  email: string | null;
  email_office: string | null;
  email_home: string | null;
  address: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  custom_fields: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return raw;
}

const FIELD_LABEL_KEYS: (keyof ClientFormValues)[] = [
  'first_name', 'last_name', 'company', 'phone_cell', 'phone_office',
  'email_office', 'email_home', 'address', 'city', 'state', 'zip_code',
];

export default function ClientesPage() {
  const { t: full, locale } = useLang();
  const t = full.dashboard.clients;
  const tc = full.common;
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const syncBanner = useGoogleSyncBanner();
  const [clients, setClients] = useState<Client[]>([]);
  const [contactsByClient, setContactsByClient] = useState<
    Map<string, { name: string; role: string | null }[]>
  >(new Map());
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [search, setSearch] = usePersistedSearch(business ? `search.clients.${business.id}` : null);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!business) return;
    const businessId = business.id;
    const [cl, contactRows, { data: tpl }] = await Promise.all([
      fetchAll<Client>((from, to) =>
        supabase.from('clients').select('*').eq('business_id', businessId)
          .order('created_at', { ascending: false }).range(from, to)),
      // Contact people across the whole business — searched + shown under the
      // matched client. Paginated: a busy business can have >1000 contacts.
      fetchAll<{ client_id: string; name: string; role: string | null }>((from, to) =>
        supabase.from('client_contacts').select('client_id, name, role')
          .eq('business_id', businessId)
          .order('is_primary', { ascending: false }).range(from, to)),
      // Field templates are bounded config (one row per custom field); a
      // single page is always enough.
      supabase.from('client_field_templates').select('*').eq('business_id', businessId).order('sort_order'),
    ]);
    const byClient = new Map<string, { name: string; role: string | null }[]>();
    for (const ct of contactRows) {
      const arr = byClient.get(ct.client_id);
      if (arr) arr.push({ name: ct.name, role: ct.role });
      else byClient.set(ct.client_id, [{ name: ct.name, role: ct.role }]);
    }
    setClients(cl);
    setContactsByClient(byClient);
    setTemplates(localizeTemplates(tpl ?? [], locale));
    setLoading(false);
  };

  useEffect(() => { load(); }, [business, locale]);

  const openAdd = () => { setSelected(null); setError(''); setFormMode('add'); };
  const openEdit = (c: Client) => { setSelected(c); setError(''); setFormMode('edit'); };

  const FIELD_LABELS: Record<string, string> = {
    first_name: t.fields.firstName,
    last_name: t.fields.lastName,
    company: t.fields.company,
    phone_cell: t.fields.phoneCell,
    phone_office: t.fields.phoneOffice,
    email_office: t.fields.emailOffice,
    email_home: t.fields.emailHome,
    address: t.fields.addressLine1,
    city: t.fields.city,
    state: t.fields.state,
    zip_code: t.fields.zipCode,
  };

  const save = async (form: ClientFormValues) => {
    setSaving(true); setError('');

    const req = business?.client_field_required ?? {};
    const hidden = parseHiddenFields(business?.client_field_hidden);
    const fHidden = (key: string) =>
      !CLIENT_FIELDS_ALWAYS_SHOWN.includes(key) && isFieldHidden(hidden, key);
    const missing: string[] = [];
    for (const key of FIELD_LABEL_KEYS) {
      if (!req[key] || fHidden(key)) continue;
      const val = form[key] as string;
      if (!val || !val.trim()) missing.push(FIELD_LABELS[key] ?? key);
    }
    for (const tpl of templates) {
      if (tpl.required && !form.custom_fields[tpl.field_key]?.trim()) {
        missing.push(tpl.field_label);
      }
    }
    if (missing.length > 0) {
      setError(t.modal.requiredError.replace('{{fields}}', missing.join(', ')));
      setSaving(false);
      return;
    }

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      company: form.company.trim() || null,
      phone_cell: form.phone_cell.trim() || null,
      phone_office: form.phone_office.trim() || null,
      email_office: form.email_office.trim() || null,
      email_home: form.email_home.trim() || null,
      address: form.address.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      zip_code: form.zip_code.trim() || null,
      notes: form.notes.trim() || null,
      custom_fields: Object.keys(form.custom_fields).length > 0 ? form.custom_fields : null,
    };

    if (formMode === 'add') {
      const { data: created, error: e } = await supabase
        .from('clients')
        .insert({ ...payload, business_id: business!.id })
        .select('id')
        .single();
      if (e) { setError(t.modal.saveError); setSaving(false); return; }
      // Fire-and-forget Google sync. Silent on success; surfaces the
      // failure via the banner if Google rejects the create.
      if (created?.id) {
        void (async () => {
          const apiBaseUrl = getApiBaseUrl();
          const jwt = await getJwt();
          if (!apiBaseUrl || !jwt) return;
          triggerGoogleSyncOrThrow('create', created.id, { apiBaseUrl, jwt })
            .catch((e) => syncBanner.reportError(googleSyncErrorMessage(e, 'No se pudo agregar el contacto a Google Contacts.')));
        })();
      }
    } else if (formMode === 'edit' && selected) {
      const { error: e } = await supabase.from('clients').update(payload).eq('id', selected.id);
      if (e) { setError(t.modal.saveError); setSaving(false); return; }
    }
    await load(); setSaving(false); setFormMode(null);
  };

  const remove = async (id: string) => {
    if (!(await confirm({ message: t.confirmDeleteSingle, destructive: true }))) return;
    // Sync to Google BEFORE local delete so the API can read the
    // client's google_resource_name. If Google rejects the delete we
    // still proceed with the local delete — the banner notifies the user
    // so they can clean up the orphan in Google manually.
    const apiBaseUrl = getApiBaseUrl();
    const jwt = await getJwt();
    if (apiBaseUrl && jwt) {
      try {
        await triggerGoogleSyncOrThrow('delete', id, { apiBaseUrl, jwt });
      } catch (e) {
        syncBanner.reportError(googleSyncErrorMessage(e, 'No se pudo eliminar el contacto de Google Contacts.'));
      }
    }
    const deleted = clients.find(c => c.id === id);
    await supabase.from('clients').delete().eq('id', id);
    if (business) {
      void logAudit(supabase, business.id, 'client.deleted', 'client', id, {
        name: deleted ? `${deleted.first_name} ${deleted.last_name}`.trim() : undefined,
      });
    }
    setClients(prev => prev.filter(c => c.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const listItems: ClientListItem[] = useMemo(() => clients.map(c => ({
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    company: c.company,
    phoneDisplay: (c.phone_cell ?? c.phone) ? fmtPhone(c.phone_cell ?? c.phone ?? '') : null,
    emailDisplay: c.email_office ?? c.email,
    city: c.city,
    state: c.state,
    contacts: contactsByClient.get(c.id),
    customFields: c.custom_fields,
  })), [clients, contactsByClient]);

  // Keep this in lockstep with the list screen's own filter so select-all /
  // bulk-delete operate on exactly the rows the user sees.
  const filteredIds = useMemo(
    () => new Set(listItems.filter(c => clientMatchesSearch(c, search)).map(c => c.id)),
    [listItems, search],
  );

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredIds.size) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredIds));
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!(await confirm({ message: t.confirmDeleteBulk.replace('{{count}}', String(selectedIds.size)), destructive: true }))) return;
    setDeleting(true);
    const ids = Array.from(selectedIds);
    // Pre-fetch resource_names ONLY for clients that were actually synced
    // to Google. Unsynced clients (google_resource_name IS NULL) skip the
    // Google round-trip entirely. Local delete happens immediately for
    // every selected row; orphan cleanup runs in the background queue.
    let orphans: { businessId: string; resourceName: string }[] = [];
    if (business?.id) {
      const { data: syncedRows } = await supabase
        .from('clients')
        .select('google_resource_name')
        .in('id', ids)
        .not('google_resource_name', 'is', null);
      orphans = (syncedRows ?? [])
        .map((r: { google_resource_name: string | null }) => r.google_resource_name)
        .filter((rn): rn is string => !!rn)
        .map(rn => ({ businessId: business.id, resourceName: rn }));
    }
    let hasError = false;
    for (let i = 0; i < ids.length; i += 50) {
      const { error: e } = await supabase.from('clients').delete().in('id', ids.slice(i, i + 50));
      if (e) hasError = true;
    }
    if (!hasError) {
      // One summary entry for the batch rather than N rows flooding the log.
      if (business) {
        void logAudit(supabase, business.id, 'client.deleted', 'client', null, { count: ids.length });
      }
      setClients(prev => prev.filter(c => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
    }
    setDeleting(false);
    // Hand orphans to the banner queue — throttled, persisted, resumable.
    if (orphans.length > 0) {
      syncBanner.runDeleteBatch(orphans);
    }
  };

  // ── Import (wizard lives in components/dashboard/ImportClientsModal) ──────
  const [importModal, setImportModal] = useState(false);

  // Deep link: ?import=1 auto-opens the wizard (the Ajustes hub mounts its
  // own instance directly, so this is only for external links/bookmarks).
  useEffect(() => {
    if (searchParams.get('import') === '1') {
      setImportModal(true);
      // Strip the param so reloads / back-nav don't re-open the modal.
      const params = new URLSearchParams(searchParams.toString());
      params.delete('import');
      params.delete('back');
      const qs = params.toString();
      router.replace(`/dashboard/clientes${qs ? `?${qs}` : ''}`);
    }
  }, [searchParams, router]);

  // Dashboard "Nuevo cliente" quick action navigates here with ?new=1 to
  // auto-open the add-client form (the add flow lives in this modal).
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openAdd();
      const params = new URLSearchParams(searchParams.toString());
      params.delete('new');
      const qs = params.toString();
      router.replace(`/dashboard/clientes${qs ? `?${qs}` : ''}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  const editById = (id: string) => {
    const c = clients.find(cl => cl.id === id);
    if (c) openEdit(c);
  };

  const initialForEdit: Partial<ClientFormValues> | undefined =
    formMode === 'edit' && selected
      ? {
          first_name: selected.first_name,
          last_name: selected.last_name,
          company: selected.company ?? '',
          phone_cell: selected.phone_cell ?? selected.phone ?? '',
          phone_office: selected.phone_office ?? '',
          email_office: selected.email_office ?? selected.email ?? '',
          email_home: selected.email_home ?? '',
          address: selected.address ?? '',
          address_line2: selected.address_line2 ?? '',
          city: selected.city ?? '',
          state: selected.state ?? '',
          zip_code: selected.zip_code ?? '',
          notes: selected.notes ?? '',
          custom_fields: selected.custom_fields ?? {},
        }
      : undefined;

  const modals = (
    <>
      <ClientFormModal
        open={formMode !== null}
        mode={formMode ?? 'add'}
        initial={initialForEdit}
        templates={templates}
        requiredFlags={business?.client_field_required ?? {}}
        hiddenFlags={business?.client_field_hidden ?? null}
        fieldLayout={business?.client_field_layout ?? null}
        saving={saving}
        error={error}
        onClose={() => setFormMode(null)}
        onSubmit={save}
      />

      {/* CSV import wizard — extracted component (also mounted by the
         Ajustes → Importar datos hub). */}
      {business && (
        <ImportClientsModal
          open={importModal}
          businessId={business.id}
          templates={templates.map(tpl => ({ field_key: tpl.field_key, field_label: tpl.field_label }))}
          onClose={() => setImportModal(false)}
          onDone={load}
        />
      )}
    </>
  );

  return (
    <ClientsListScreen
      loading={loading}
      clients={listItems}
      customFieldTemplates={templates}
      search={search}
      onSearchChange={(text) => { setSearch(text); setSelectedIds(new Set()); }}
      selectedIds={selectedIds}
      onToggleSelect={toggleSelect}
      onSelectMany={(ids) => setSelectedIds(prev => { const next = new Set(prev); ids.forEach(i => next.add(i)); return next; })}
      onToggleSelectAll={toggleSelectAll}
      onClientPress={(id) => router.push(`/dashboard/clientes/${id}`)}
      onEditPress={editById}
      onDeletePress={remove}
      onNewClientPress={openAdd}
      onBulkDeletePress={bulkDelete}
      onClearSelection={() => setSelectedIds(new Set())}
      bulkDeleting={deleting}
      bottomSlot={modals}
      businessId={business?.id}
    />
  );
}
