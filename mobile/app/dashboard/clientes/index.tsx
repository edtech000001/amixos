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
import { ImportClientsModal } from '@/components/ImportClientsModal';
import { triggerGoogleSync } from '@amixos/shared/lib/googleSync';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: string;
  field_options: string[] | null;
  required: boolean;
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
  const { t: full } = useLang();
  const t = full.dashboard.clients;

  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    if (!business) return;
    const [{ data: cl }, { data: tpl }] = await Promise.all([
      supabase
        .from('clients')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('client_field_templates')
        .select('*')
        .eq('business_id', business.id)
        .order('sort_order'),
    ]);
    setClients((cl as Client[] | null) ?? []);
    setTemplates((tpl as FieldTemplate[] | null) ?? []);
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
          if (apiBaseUrl && jwt) await triggerGoogleSync('delete', id, { apiBaseUrl, jwt });
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
            const apiBaseUrl = getApiBaseUrl();
            const jwt = await getJwt();
            // Sync deletes BEFORE local delete. Run in parallel per id to keep
            // bulk delete reasonable on large selections.
            if (apiBaseUrl && jwt) {
              await Promise.all(
                ids.map(cid => triggerGoogleSync('delete', cid, { apiBaseUrl, jwt })),
              );
            }
            for (let i = 0; i < ids.length; i += 50) {
              await supabase.from('clients').delete().in('id', ids.slice(i, i + 50));
            }
            setClients(prev => prev.filter(c => !selectedIds.has(c.id)));
            setSelectedIds(new Set());
            setBulkDeleting(false);
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
        onImportPress={() => setImportOpen(true)}
        onBulkDeletePress={bulkDelete}
        onClearSelection={() => setSelectedIds(new Set())}
        bulkDeleting={bulkDeleting}
        bottomSlot={
          business ? (
            <View>
              <ImportClientsModal
                open={importOpen}
                onClose={() => setImportOpen(false)}
                businessId={business.id}
                templates={templates.map(tpl => ({
                  field_key: tpl.field_key,
                  field_label: tpl.field_label,
                }))}
                onImportComplete={load}
              />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
