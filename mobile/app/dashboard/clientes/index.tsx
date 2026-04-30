import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  ClientsListScreen,
  type ClientListItem,
} from '@amixos/shared/screens/dashboard/ClientsListScreen';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  phone: string | null;
  phone_cell: string | null;
  email: string | null;
  email_office: string | null;
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
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = async () => {
    if (!business) return;
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    setClients(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

  const items: ClientListItem[] = useMemo(() => clients.map(c => ({
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    company: c.company,
    phoneDisplay: (c.phone_cell ?? c.phone) ? fmtPhone(c.phone_cell ?? c.phone ?? '') : null,
    emailDisplay: c.email_office ?? c.email,
    city: c.city,
    state: c.state,
  })), [clients]);

  const filteredIds = useMemo(() => {
    const q = search.toLowerCase();
    return new Set(
      items
        .filter(c => [c.firstName, c.lastName, c.company, c.phoneDisplay, c.emailDisplay, c.city]
          .filter(Boolean).join(' ').toLowerCase().includes(q))
        .map(c => c.id),
    );
  }, [items, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredIds.size) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIds));
    }
  };

  const remove = (id: string) => {
    Alert.alert('Eliminar cliente', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('clients').delete().eq('id', id);
          setClients(prev => prev.filter(c => c.id !== id));
          setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        },
      },
    ]);
  };

  const bulkDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      'Eliminar clientes',
      `¿Eliminar ${selectedIds.size} cliente(s)?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setBulkDeleting(true);
            const ids = Array.from(selectedIds);
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
        onSearchChange={(text) => { setSearch(text); setSelectedIds(new Set()); }}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onClientPress={(id) => Alert.alert('Detail view', `Client ${id} detail not yet built on mobile`)}
        onEditPress={() => Alert.alert('Coming soon', 'Edit client from mobile not yet built')}
        onDeletePress={remove}
        onNewClientPress={() => Alert.alert('Coming soon', 'Add client from mobile not yet built')}
        // No CSV import on mobile.
        onBulkDeletePress={bulkDelete}
        onClearSelection={() => setSelectedIds(new Set())}
        bulkDeleting={bulkDeleting}
      />
    </SafeAreaView>
  );
}
