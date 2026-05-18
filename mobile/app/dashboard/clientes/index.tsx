import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  ClientsListScreen,
  type ClientListItem,
} from '@amixos/shared/screens/dashboard/ClientsListScreen';
import {
  ClientFormModal,
  type ClientFormValues,
  type ClientFieldTemplate,
} from '@amixos/shared/screens/dashboard/ClientFormModal';
import { useLang } from '@/lib/i18n/LangProvider';
import { ImportClientsModal } from '@/components/ImportClientsModal';
import { triggerGoogleSync } from '@amixos/shared/lib/googleSync';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';

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
}

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1')
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw;
}

const FIELD_LABEL_KEYS: (keyof ClientFormValues)[] = [
  'first_name', 'last_name', 'company', 'phone_cell', 'phone_office',
  'email_office', 'email_home', 'address', 'city', 'state', 'zip_code',
];

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

  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    if (!business) return;
    const [{ data: cl }, { data: tpl }] = await Promise.all([
      supabase.from('clients').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
      supabase.from('client_field_templates').select('*').eq('business_id', business.id).order('sort_order'),
    ]);
    setClients(cl ?? []);
    setTemplates(tpl ?? []);
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
    if (selectedIds.size === filteredIds.size) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredIds));
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

  const openAdd = () => { setSelected(null); setError(''); setFormMode('add'); };
  const openEditById = (id: string) => {
    const c = clients.find(cl => cl.id === id);
    if (c) { setSelected(c); setError(''); setFormMode('edit'); }
  };

  const save = async (form: ClientFormValues) => {
    setSaving(true); setError('');
    const req = business?.client_field_required ?? {};
    const missing: string[] = [];
    for (const key of FIELD_LABEL_KEYS) {
      if (!req[key]) continue;
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
      // Fire-and-forget Google sync (no-op if user isn't connected).
      if (created?.id) {
        void (async () => {
          const apiBaseUrl = getApiBaseUrl();
          const jwt = await getJwt();
          if (apiBaseUrl && jwt) {
            triggerGoogleSync('create', created.id, { apiBaseUrl, jwt });
          }
        })();
      }
    } else if (formMode === 'edit' && selected) {
      const { error: e } = await supabase.from('clients').update(payload).eq('id', selected.id);
      if (e) { setError(t.modal.saveError); setSaving(false); return; }
    }
    await load(); setSaving(false); setFormMode(null);
  };

  const remove = (id: string) => {
    Alert.alert('Eliminar cliente', t.confirmDeleteSingle, [
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
      t.confirmDeleteBulk.replace('{{count}}', String(selectedIds.size)),
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
        onEditPress={openEditById}
        onDeletePress={remove}
        onNewClientPress={openAdd}
        onImportPress={() => setImportOpen(true)}
        onBulkDeletePress={bulkDelete}
        onClearSelection={() => setSelectedIds(new Set())}
        bulkDeleting={bulkDeleting}
        bottomSlot={
          <View>
            <ClientFormModal
              open={formMode !== null}
              mode={formMode ?? 'add'}
              initial={initialForEdit}
              templates={templates}
              requiredFlags={business?.client_field_required ?? {}}
              saving={saving}
              error={error}
              onClose={() => setFormMode(null)}
              onSubmit={save}
            />
            {business ? (
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
            ) : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}
