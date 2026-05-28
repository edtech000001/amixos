import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  ClientsListScreen,
  type ClientListItem,
} from '@amixos/shared/screens/dashboard/ClientsListScreen';
import { useLang } from '@/lib/i18n/LangProvider';
import { triggerGoogleSyncOrThrow } from '@amixos/shared/lib/googleSync';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
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
}

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1')
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw;
}

export default function ClientesTab() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const syncBanner = useGoogleSyncBanner();
  const { t: full } = useLang();
  const t = full.dashboard.clients;

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = async () => {
    if (!business) return;
    const businessId = business.id;
    const cl = await fetchAll<Client>((from, to) =>
      supabase
        .from('clients')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .range(from, to));
    setClients(cl);
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
      })),
    [clients],
  );

  const filteredIds = useMemo(() => {
    const q = search.toLowerCase();
    return new Set(
      items
        .filter(c =>
          [c.firstName, c.lastName, c.company, c.phoneDisplay, c.emailDisplay, c.city]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
        .map(c => c.id),
    );
  }, [items, search]);

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
          await supabase.from('clients').delete().eq('id', id);
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

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ClientsListScreen
        loading={loading}
        clients={items}
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
    </SafeAreaView>
  );
}
