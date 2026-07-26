import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { loadCached } from '@/lib/offline/cache';
import { useApp } from '@/lib/AppContext';
import { can } from '@amixos/shared/lib/permissions';
import {
  ClientsListScreen,
  type ClientListItem,
} from '@amixos/shared/screens/dashboard/ClientsListScreen';
import { useLang } from '@/lib/i18n/LangProvider';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import { triggerGoogleSyncOrThrow, googleSyncErrorMessage } from '@amixos/shared/lib/googleSync';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import {
  fetchClientsPage,
  fetchAllClientsMatching,
  fetchClientCount,
  clientGroupNeedsAll,
  type ClientsCursor,
} from '@amixos/shared/lib/clientsQuery';
import { usePersistedSearch } from '@amixos/shared/lib/usePersistedSearch';
import { logAudit } from '@amixos/shared/lib/audit';
import { fetchClientLocations, clientIdsAtLocation, clientsWithAnyLocation, type ClientLocation } from '@amixos/shared/lib/locations';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';

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
  city: string | null;
  state: string | null;
  custom_fields: Record<string, string> | null;
  client_contacts?: EmbeddedContact[];
}

// Full page includes contact people (searched + shown under a matched row); a
// page is ≤50 rows so the nested join is cheap. The load-all path (group-by)
// isn't a search, so it skips contacts to stay light at scale.
const CLIENT_PAGE_SELECT = '*, client_contacts(name, role, is_primary)';
const CLIENT_GROUP_SELECT = '*';

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1')
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw;
}

export default function ClientesTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, activeLocationId, currentRole } = useApp();
  const [clientLocations, setClientLocations] = useState<ClientLocation[]>([]);
  const syncBanner = useGoogleSyncBanner();
  const { t: full, locale } = useLang();
  const t = full.dashboard.clients;

  const [rawClients, setRawClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedSearch(business ? `search.clients.${business.id}` : null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [templates, setTemplates] = useState<{ field_key: string; field_label: string }[]>([]);

  // ── Server-side pagination + search + count ─────────────────────────────────
  const [serverTotal, setServerTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadSeqRef = useRef(0);
  const cursorRef = useRef<ClientsCursor | null>(null);
  const paramsRef = useRef<{ businessId: string; search: string } | null>(null);
  const loadAllRef = useRef(false);

  // Branch scoping: clients restricted to OTHER branches are hidden (small set).
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
    try {
      const tplRes = await supabase
        .from('client_field_templates')
        .select('field_key, field_label, field_label_es, field_label_en')
        .eq('business_id', business.id)
        .order('sort_order');
      setTemplates(localizeTemplates((tplRes.data as { field_key: string; field_label: string }[] | null) ?? [], locale));
    } catch { /* offline — no templates */ }
    void fetchClientLocations(supabase, business.id).then(setClientLocations).catch(() => {});
  };

  const runQuery = async (base: { businessId: string; search: string }, loadAll = false) => {
    const seq = ++loadSeqRef.current;
    paramsRef.current = base;
    loadAllRef.current = loadAll;
    setLoading(true);
    cursorRef.current = null;
    setHasMore(false);
    const params = { ...base, excludeIds: excludeIdsRef.current };
    if (loadAll) {
      // Group-by needs every matching row. Online action (not cached).
      try {
        const rows = await fetchAllClientsMatching<Client>(supabase, CLIENT_GROUP_SELECT, params);
        const total = await fetchClientCount(supabase, params);
        if (seq !== loadSeqRef.current) return;
        setRawClients(rows);
        setServerTotal(total);
      } catch { /* offline / error */ }
      finally { if (seq === loadSeqRef.current) setLoading(false); }
      return;
    }
    const cacheKey = `clients_list_${base.businessId}_${activeLocationId ?? 'all'}`;
    const res = await loadCached<{ clients: Client[]; nextCursor: ClientsCursor | null; total: number }>(cacheKey, async () => {
      const [page, total] = await Promise.all([
        fetchClientsPage<Client>(supabase, CLIENT_PAGE_SELECT, { ...params, pageSize: 50 }),
        fetchClientCount(supabase, params),
      ]);
      return { clients: page.clients, nextCursor: page.nextCursor, total };
    });
    if (seq !== loadSeqRef.current) return;
    const d = res.data;
    setRawClients(d?.clients ?? []);
    cursorRef.current = res.fromCache ? null : (d?.nextCursor ?? null);
    setHasMore(!res.fromCache && !!d?.nextCursor);
    setServerTotal(d?.total ?? 0);
    setLoading(false);
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
    } catch { /* offline / error — keep what's loaded */ }
    finally { setLoadingMore(false); }
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

  // Refresh templates/locations + the current query on focus so edits / new
  // clients / deletes from sub-pages show up. Keyed on business + locale.
  useFocusEffect(
    useCallback(() => {
      void loadMeta();
      reRun();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [business, locale, activeLocationId]),
  );

  const items: ClientListItem[] = useMemo(
    () =>
      rawClients.map(c => ({
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
      })),
    [rawClients],
  );

  // In server mode the loaded rows ARE the matching set, so select-all /
  // bulk-delete operate on exactly what's loaded (visible).
  const filteredIds = useMemo(() => new Set(items.map(c => c.id)), [items]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredIds.size) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredIds));
  };

  const openDetail = (id: string) => router.push(`/dashboard/clientes/${id}` as never);
  const openAdd = () => router.push('/dashboard/clientes/nuevo' as never);
  const openEdit = (id: string) =>
    router.push(`/dashboard/clientes/nuevo?edit=${id}` as never);

  const remove = (id: string) => {
    if (!can.deleteClient(currentRole)) return;
    Alert.alert('Eliminar cliente', t.confirmDeleteSingle, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
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
          setSelectedIds(prev => {
            const n = new Set(prev);
            n.delete(id);
            return n;
          });
        },
      },
    ]);
  };

  const bulkDelete = () => {
    if (!can.deleteClient(currentRole)) return;
    if (selectedIds.size === 0) return;
    Alert.alert(
      'Eliminar clientes',
      t.confirmDeleteBulk.replace('{{count}}', String(selectedIds.size)),
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setBulkDeleting(true);
            const ids = Array.from(selectedIds);
            let orphans: { businessId: string; resourceName: string }[] = [];
            if (business?.id) {
              const { data: syncedRows } = await supabase
                .from('clients')
                .select('google_resource_name')
                .in('id', ids)
                .not('google_resource_name', 'is', null);
              orphans = ((syncedRows ?? []) as { google_resource_name: string | null }[])
                .map(r => r.google_resource_name)
                .filter((rn): rn is string => !!rn)
                .map(rn => ({ businessId: business.id, resourceName: rn }));
            }
            for (let i = 0; i < ids.length; i += 50) {
              await supabase.from('clients').delete().in('id', ids.slice(i, i + 50));
            }
            if (business) {
              void logAudit(supabase, business.id, 'client.deleted', 'client', null, { count: ids.length });
            }
            setRawClients(prev => prev.filter(c => !selectedIds.has(c.id)));
            setSelectedIds(new Set());
            setBulkDeleting(false);
            if (orphans.length > 0) {
              syncBanner.runDeleteBatch(orphans);
            }
          },
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top }}>
      <ClientsListScreen
        loading={loading}
        clients={items}
        customFieldTemplates={templates}
        search={search}
        onSearchChange={(text) => {
          setSearch(text);
          setSelectedIds(new Set());
        }}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onClientPress={openDetail}
        onEditPress={can.editClient(currentRole) ? openEdit : undefined}
        onDeletePress={can.deleteClient(currentRole) ? remove : undefined}
        onNewClientPress={can.createClient(currentRole) ? openAdd : undefined}
        onBulkDeletePress={can.deleteClient(currentRole) ? bulkDelete : undefined}
        onClearSelection={() => setSelectedIds(new Set())}
        bulkDeleting={bulkDeleting}
        businessId={business?.id}
        serverMode
        serverTotal={serverTotal}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        onFiltersChange={handleFiltersChange}
      />
    </View>
  );
}
