'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { can } from '@amixos/shared/lib/permissions';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { triggerGoogleSyncOrThrow, googleSyncErrorMessage } from '@amixos/shared/lib/googleSync';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { parseHiddenFields, isFieldHidden } from '@amixos/shared/lib/fieldLayout';
import { CLIENT_FIELDS_ALWAYS_SHOWN } from '@amixos/shared/lib/clientFieldSections';
import { logAudit } from '@amixos/shared/lib/audit';
import {
  fetchClientsPage,
  fetchAllClientsMatching,
  fetchClientCount,
  clientGroupNeedsAll,
  type ClientsCursor,
} from '@amixos/shared/lib/clientsQuery';
import { fetchClientLocations, setClientLocations as saveClientLocations, clientIdsAtLocation, clientsWithAnyLocation, type ClientLocation } from '@amixos/shared/lib/locations';
import { usePersistedSearch } from '@amixos/shared/lib/usePersistedSearch';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import { useScrollRestore, saveScrollAnchor } from '@/lib/useScrollRestore';
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

interface EmbeddedContact { name: string; role: string | null; is_primary: boolean | null }
interface Client {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
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
  /** Contact people, embedded on the page query (server mode). */
  client_contacts?: EmbeddedContact[];
}

// Full page includes contact people (searched + shown under a matched row).
// A page is ≤50 rows, so the nested join is cheap. The load-all path (group-by)
// isn't a search, so it skips contacts entirely to stay light at scale.
const CLIENT_PAGE_SELECT = '*, client_contacts(name, role, is_primary)';
const CLIENT_GROUP_SELECT = '*';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createSupabaseClient();
  const { business, activeLocationId, locations, currentRole } = useApp();
  const multiLocation = (locations?.length ?? 0) > 1;
  const syncBanner = useGoogleSyncBanner();
  const [clientLocations, setClientLocations] = useState<ClientLocation[]>([]);
  // Server-side pagination: rawClients holds the loaded page(s), not the table.
  const [rawClients, setRawClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [search, setSearch] = usePersistedSearch(business ? `search.clients.${business.id}` : null);
  const [loading, setLoading] = useState(true);

  // Coming back from a client detail lands at the top otherwise — restore the
  // list scroll position once the rows have rendered.
  useScrollRestore('clients-list', !loading);
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  // Branch links for the client being added/edited. Empty = shared everywhere.
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // ── Server-side pagination + search + count ─────────────────────────────────
  const [serverTotal, setServerTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadSeqRef = useRef(0);
  const cursorRef = useRef<ClientsCursor | null>(null);
  // The last base params (search) so a re-run (branch switch, mutation) reuses
  // them; excludeIds is injected fresh each call from the ref below.
  const paramsRef = useRef<{ businessId: string; search: string } | null>(null);
  const loadAllRef = useRef(false);

  // Branch scoping: clients restricted to OTHER branches are hidden. Restricted
  // clients (any link) minus those at the active branch. Small set (only
  // explicitly-restricted clients have links). Empty for "All locations".
  const excludeIds = useMemo(() => {
    if (!activeLocationId) return [] as string[];
    const atBranch = clientIdsAtLocation(clientLocations, activeLocationId);
    const withAny = clientsWithAnyLocation(clientLocations);
    return Array.from(withAny).filter(id => !atBranch.has(id));
  }, [clientLocations, activeLocationId]);
  const excludeIdsRef = useRef<string[]>([]);
  useEffect(() => { excludeIdsRef.current = excludeIds; }, [excludeIds]);

  const loadMeta = async () => {
    if (!business) return;
    const businessId = business.id;
    const [{ data: tpl }, cl] = await Promise.all([
      supabase.from('client_field_templates').select('*').eq('business_id', businessId).order('sort_order'),
      fetchClientLocations(supabase, businessId).catch(() => [] as ClientLocation[]),
    ]);
    setTemplates(localizeTemplates(tpl ?? [], locale));
    setClientLocations(cl);
  };
  useEffect(() => { void loadMeta(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [business, locale]);

  const runQuery = async (base: { businessId: string; search: string }, loadAll = false) => {
    const seq = ++loadSeqRef.current;
    paramsRef.current = base;
    loadAllRef.current = loadAll;
    setLoading(true);
    cursorRef.current = null;
    setHasMore(false);
    const params = { ...base, excludeIds: excludeIdsRef.current };
    try {
      const countP = fetchClientCount(supabase, params);
      if (loadAll) {
        // Group-by needs every matching row to bucket. Progressive render.
        const acc: Client[] = [];
        let cursor: ClientsCursor | null = null;
        for (let i = 0; i < 100; i++) {
          const page = await fetchClientsPage<Client>(supabase, CLIENT_GROUP_SELECT, { ...params, cursor, pageSize: 1000 });
          acc.push(...page.clients);
          if (seq === loadSeqRef.current) setRawClients([...acc]);
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }
        const total = await countP;
        if (seq !== loadSeqRef.current) return;
        setServerTotal(total);
      } else {
        const [page, total] = await Promise.all([
          fetchClientsPage<Client>(supabase, CLIENT_PAGE_SELECT, { ...params, pageSize: 50 }),
          countP,
        ]);
        if (seq !== loadSeqRef.current) return;
        setRawClients(page.clients);
        cursorRef.current = page.nextCursor;
        setHasMore(!!page.nextCursor);
        setServerTotal(total);
      }
    } catch (e) {
      console.error('Clients query failed', e);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !paramsRef.current || loadAllRef.current || !cursorRef.current) return;
    const seq = loadSeqRef.current;
    setLoadingMore(true);
    try {
      const page = await fetchClientsPage<Client>(supabase, CLIENT_PAGE_SELECT, { ...paramsRef.current, excludeIds: excludeIdsRef.current, cursor: cursorRef.current, pageSize: 50 });
      if (seq !== loadSeqRef.current) return;
      setRawClients(prev => [...prev, ...page.clients]);
      cursorRef.current = page.nextCursor;
      setHasMore(!!page.nextCursor);
    } catch (e) {
      console.error('Clients load-more failed', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const reRun = () => { if (paramsRef.current) void runQuery(paramsRef.current, loadAllRef.current); };
  // Re-run when the branch scope changes (locations load, or branch switch).
  useEffect(() => {
    if (paramsRef.current) void runQuery(paramsRef.current, loadAllRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excludeIds]);

  const handleFiltersChange = (f: { search: string; groupBy: string }) => {
    if (!business) return;
    void runQuery({ businessId: business.id, search: f.search }, clientGroupNeedsAll(f.groupBy));
  };

  // New client defaults to ALL branches selected = shared everywhere; an edited
  // client with no explicit links shows all selected too. Deselecting limits it.
  const openAdd = () => { if (!can.createClient(currentRole)) return; setSelected(null); setBranchIds(locations.map(l => l.id)); setError(''); setFormMode('add'); };
  const openEdit = (c: Client) => {
    setSelected(c);
    const links = clientLocations.filter(l => l.client_id === c.id).map(l => l.location_id);
    setBranchIds(links.length > 0 ? links : locations.map(l => l.id));
    setError('');
    setFormMode('edit');
  };

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

    // "All branches selected" (or none) = shared everywhere → store NO links so
    // the client stays visible even in branches added later. A partial selection
    // stores explicit links restricting the client to those branches.
    const allBranchIds = locations.map(l => l.id);
    const branchLinksToSave =
      branchIds.length === 0 || branchIds.length >= allBranchIds.length ? [] : branchIds;

    if (formMode === 'add') {
      const { data: created, error: e } = await supabase
        .from('clients')
        .insert({ ...payload, business_id: business!.id })
        .select('id')
        .single();
      if (e) { setError(t.modal.saveError); setSaving(false); return; }
      if (created?.id && multiLocation && branchLinksToSave.length > 0) {
        await saveClientLocations(supabase, business!.id, created.id, branchLinksToSave, branchLinksToSave[0] ?? null);
      }
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
      if (multiLocation) {
        await saveClientLocations(supabase, business!.id, selected.id, branchLinksToSave, branchLinksToSave[0] ?? null);
      }
    }
    await loadMeta(); reRun(); setSaving(false); setFormMode(null);
  };

  const remove = async (id: string) => {
    if (!can.deleteClient(currentRole)) return;
    if (!(await confirm({ message: t.confirmDeleteSingle, destructive: true }))) return;
    // Sync to Google BEFORE local delete so the API can read the
    // client's google_resource_name. If Google rejects the delete we
    // still proceed with the local delete — the banner notifies the user.
    const apiBaseUrl = getApiBaseUrl();
    const jwt = await getJwt();
    if (apiBaseUrl && jwt) {
      try {
        await triggerGoogleSyncOrThrow('delete', id, { apiBaseUrl, jwt });
      } catch (e) {
        syncBanner.reportError(googleSyncErrorMessage(e, 'No se pudo eliminar el contacto de Google Contacts.'));
      }
    }
    const deleted = rawClients.find(c => c.id === id);
    await supabase.from('clients').delete().eq('id', id);
    if (business) {
      void logAudit(supabase, business.id, 'client.deleted', 'client', id, {
        name: deleted ? `${deleted.first_name} ${deleted.last_name}`.trim() : undefined,
      });
    }
    setRawClients(prev => prev.filter(c => c.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const listItems: ClientListItem[] = useMemo(() => rawClients.map(c => ({
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    company: c.company,
    phoneDisplay: c.phone_cell ? fmtPhone(c.phone_cell) : null,
    emailDisplay: c.email_office ?? c.email,
    city: c.city,
    state: c.state,
    contacts: (c.client_contacts ?? [])
      .slice()
      .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
      .map(ct => ({ name: ct.name, role: ct.role })),
    customFields: c.custom_fields,
  })), [rawClients]);

  // In server mode the loaded rows ARE the matching set, so select-all /
  // bulk-delete operate on exactly what's loaded (visible).
  const filteredIds = useMemo(() => new Set(listItems.map(c => c.id)), [listItems]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredIds.size) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredIds));
  };

  const bulkDelete = async () => {
    if (!can.deleteClient(currentRole)) return;
    if (selectedIds.size === 0) return;
    if (!(await confirm({ message: t.confirmDeleteBulk.replace('{{count}}', String(selectedIds.size)), destructive: true }))) return;
    setDeleting(true);
    const ids = Array.from(selectedIds);
    // Pre-fetch resource_names ONLY for clients actually synced to Google.
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
      if (business) {
        void logAudit(supabase, business.id, 'client.deleted', 'client', null, { count: ids.length });
      }
      setRawClients(prev => prev.filter(c => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
    }
    setDeleting(false);
    if (orphans.length > 0) {
      syncBanner.runDeleteBatch(orphans);
    }
  };

  // ── Import (wizard lives in components/dashboard/ImportClientsModal) ──────
  const [importModal, setImportModal] = useState(false);

  // Deep link: ?import=1 auto-opens the wizard.
  useEffect(() => {
    if (searchParams.get('import') !== '1' || !currentRole) return;
    if (can.createClient(currentRole)) setImportModal(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('import');
    params.delete('back');
    const qs = params.toString();
    router.replace(`/dashboard/clientes${qs ? `?${qs}` : ''}`);
  }, [searchParams, router, currentRole]);

  // Dashboard "Nuevo cliente" quick action navigates here with ?new=1.
  useEffect(() => {
    if (searchParams.get('new') !== '1' || !currentRole) return;
    openAdd();
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    const qs = params.toString();
    router.replace(`/dashboard/clientes${qs ? `?${qs}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router, currentRole]);

  const editById = (id: string) => {
    if (!can.editClient(currentRole)) return;
    const c = rawClients.find(cl => cl.id === id);
    if (c) openEdit(c);
  };

  const initialForEdit: Partial<ClientFormValues> | undefined =
    formMode === 'edit' && selected
      ? {
          first_name: selected.first_name,
          last_name: selected.last_name,
          company: selected.company ?? '',
          phone_cell: selected.phone_cell ?? '',
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
        branchOptions={multiLocation ? locations.map(l => ({ id: l.id, name: l.name })) : undefined}
        branchIds={branchIds}
        onToggleBranch={(id) => setBranchIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
        onClose={() => setFormMode(null)}
        onSubmit={save}
      />

      {business && (
        <ImportClientsModal
          open={importModal}
          businessId={business.id}
          templates={templates.map(tpl => ({ field_key: tpl.field_key, field_label: tpl.field_label }))}
          locations={locations.map(l => ({ id: l.id, name: l.name }))}
          onClose={() => setImportModal(false)}
          onDone={() => { void loadMeta(); reRun(); }}
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
      onClientPress={(id) => { saveScrollAnchor('clients-list', id); router.push(`/dashboard/clientes/${id}`); }}
      onEditPress={can.editClient(currentRole) ? editById : undefined}
      onDeletePress={can.deleteClient(currentRole) ? remove : undefined}
      onNewClientPress={can.createClient(currentRole) ? openAdd : undefined}
      onBulkDeletePress={can.deleteClient(currentRole) ? bulkDelete : undefined}
      onClearSelection={() => setSelectedIds(new Set())}
      bulkDeleting={deleting}
      bottomSlot={modals}
      businessId={business?.id}
      serverMode
      serverTotal={serverTotal}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
      onFiltersChange={handleFiltersChange}
    />
  );
}
