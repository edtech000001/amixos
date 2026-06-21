import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { loadCached } from '@/lib/offline/cache';
import { useApp } from '@/lib/AppContext';
import {
  ClientsListScreen,
  type ClientListItem,
} from '@amixos/shared/screens/dashboard/ClientsListScreen';
import { useLang } from '@/lib/i18n/LangProvider';
import { triggerGoogleSyncOrThrow } from '@amixos/shared/lib/googleSync';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import { logAudit } from '@amixos/shared/lib/audit';
import { clientMatchesSearch } from '@amixos/shared/lib/clientSearch';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';

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
  city: string | null;
  state: string | null;
  custom_fields: Record<string, string> | null;
}

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
  const { business } = useApp();
  const syncBanner = useGoogleSyncBanner();
  const { t: full } = useLang();
  const t = full.dashboard.clients;

  const [clients, setClients] = useState<Client[]>([]);
  const [contactsByClient, setContactsByClient] = useState<
    Map<string, { name: string; role: string | null }[]>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Custom-field definitions — for the "group by custom field" menu options.
  const [templates, setTemplates] = useState<{ field_key: string; field_label: string }[]>([]);

  const load = async () => {
    if (!business) return;
    const businessId = business.id;
    // Clients list is cached so it (and on-site adds) work offline. Contacts +
    // templates are best-effort — offline they just come back empty.
    const clRes = await loadCached(`clients_list_${businessId}`, () =>
      fetchAll<Client>((from, to) =>
        supabase
          .from('clients')
          .select('*')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .range(from, to)));
    const cl = clRes.data ?? [];

    let contactRows: { client_id: string; name: string; role: string | null }[] = [];
    let tplData: { field_key: string; field_label: string }[] = [];
    try {
      contactRows = await fetchAll<{ client_id: string; name: string; role: string | null }>((from, to) =>
        supabase
          .from('client_contacts')
          .select('client_id, name, role')
          .eq('business_id', businessId)
          .order('is_primary', { ascending: false })
          .range(from, to));
    } catch { /* offline — no contacts */ }
    try {
      const tplRes = await supabase
        .from('client_field_templates')
        .select('field_key, field_label')
        .eq('business_id', businessId)
        .order('sort_order');
      tplData = (tplRes.data as { field_key: string; field_label: string }[] | null) ?? [];
    } catch { /* offline — no templates */ }

    setTemplates(tplData);
    const byClient = new Map<string, { name: string; role: string | null }[]>();
    for (const ct of contactRows) {
      const arr = byClient.get(ct.client_id);
      if (arr) arr.push({ name: ct.name, role: ct.role });
      else byClient.set(ct.client_id, [{ name: ct.name, role: ct.role }]);
    }
    setClients(cl);
    setContactsByClient(byClient);
    setLoading(false);
  };

  // Reload every time the list comes back into focus so edits / new
  // clients / deletes from sub-pages show up immediately. Keyed on
  // business.id so switching workspaces also reloads.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [business]),
  );

  const items: ClientListItem[] = useMemo(
    () =>
      clients.map(c => ({
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
      })),
    [clients, contactsByClient],
  );

  // Keep this in lockstep with the list screen's own filter so select-all /
  // bulk-delete operate on exactly the rows the user sees.
  const filteredIds = useMemo(
    () => new Set(items.filter(c => clientMatchesSearch(c, search)).map(c => c.id)),
    [items, search],
  );

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
    Alert.alert('Eliminar cliente', t.confirmDeleteSingle, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          // Fire Google delete BEFORE the local row is gone — the API needs
          // to read the client's google_resource_name. Await so ordering is
          // guaranteed; sync is fast and a tiny extra wait is fine on delete.
          const apiBaseUrl = getApiBaseUrl();
          const jwt = await getJwt();
          if (apiBaseUrl && jwt) {
            try {
              await triggerGoogleSyncOrThrow('delete', id, { apiBaseUrl, jwt });
            } catch {
              syncBanner.reportError('No se pudo eliminar el contacto de Google Contacts.');
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
            // Pre-fetch resource_names for the subset that's actually
            // synced to Google. Unsynced rows skip the Google round-trip.
            // Locals delete immediately; orphan cleanup runs throttled
            // in the background banner queue.
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
            // One summary entry for the batch rather than N rows in the log.
            if (business) {
              void logAudit(supabase, business.id, 'client.deleted', 'client', null, { count: ids.length });
            }
            setClients(prev => prev.filter(c => !selectedIds.has(c.id)));
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

  // Manual safe-area padding via useSafeAreaInsets. SafeAreaView from
  // react-native-safe-area-context@4.10.1 was rendering its children at
  // zero height inside the dashboard tab layout (iOS 26 simulator quirk
  // or interaction with the GoogleSyncBanner overlay wrap). Using a
  // plain View + paddingTop sidesteps it.
  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB', paddingTop: insets.top }}>
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
        onEditPress={openEdit}
        onDeletePress={remove}
        onNewClientPress={openAdd}
        onBulkDeletePress={bulkDelete}
        onClearSelection={() => setSelectedIds(new Set())}
        bulkDeleting={bulkDeleting}
      />
    </View>
  );
}
