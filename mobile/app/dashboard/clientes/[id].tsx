import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Modal as RNModal,
  TextInput,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Pencil,
  Trash2,
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  Plus,
  FileText,
  Building2,
  Star,
  UserPlus,
  Share2,
} from 'lucide-react-native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { buildClientCsv, buildClientHtml } from '@amixos/shared/lib/clientShare';
import { createSupabaseClient } from '@/lib/supabase';
import { loadCached, writeCached } from '@/lib/offline/cache';
import { queuedInsert, queuedUpdate } from '@/lib/offline/mutate';
import { newUuid } from '@/lib/offline/ids';
import { isOnlineNow } from '@/lib/offline/network';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { AutocompleteInput, Button, Input, Toggle } from '@amixos/shared/ui';
import { formatDateLong, formatDateTimeLong, formatNumberGrouped } from '@amixos/shared/lib/format';
import { triggerGoogleSyncOrThrow, triggerClientContactGoogleSync, googleSyncErrorMessage } from '@amixos/shared/lib/googleSync';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { CommunicationLog } from '@amixos/shared/screens/dashboard/CommunicationLog';
import { useContactOutcomePrompt } from '@/lib/useContactOutcomePrompt';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
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
  address: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  custom_fields: Record<string, string> | null;
  created_at: string;
  updated_at: string;
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
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  due_date: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  draft:     { bg: '#F3F4F6', fg: '#6B7280' },
  sent:      { bg: '#DBEAFE', fg: '#2563EB' },
  paid:      { bg: '#D1FAE5', fg: '#047857' },
  overdue:   { bg: '#FEE2E2', fg: '#DC2626' },
  cancelled: { bg: '#F3F4F6', fg: '#9CA3AF' },
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const fmtPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1')
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw;
};

const fmtPhoneInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

// Linking.openURL throws an unhandled rejection on the iOS simulator (no
// Mail/Phone app configured) and any device without a registered handler
// for the scheme. Wrap so taps just no-op instead of surfacing a yellow
// dev warning — a real device almost always has handlers.
const openLink = (url: string) => {
  Linking.openURL(url).catch(() => {});
};

const EMPTY_CONTACT = {
  name: '',
  role: '',
  phone: '',
  email: '',
  notes: '',
  is_primary: false,
};

export default function ClienteDetailRoute() {
  const router = useRouter();
  const { id, from, jobId } = useLocalSearchParams<{ id: string; from?: string; jobId?: string }>();
  // Honor ?from=map so the back arrow returns to the map module instead of the
  // clientes list. ?from=job&jobId=… returns to that specific job. We navigate
  // explicitly (not router.back()) because clientes/[id] and trabajos/[id] live
  // in the same Tabs navigator, where back() can land on the wrong tab root.
  const goBack = () => {
    if (from === 'map') {
      router.replace('/dashboard/mas/modulos/map' as never);
    } else if (from === 'job' && jobId) {
      router.replace(`/dashboard/trabajos/${jobId}` as never);
    } else {
      router.replace('/dashboard/clientes' as never);
    }
  };
  const supabase = createSupabaseClient();
  const { business, user } = useApp();
  const syncBanner = useGoogleSyncBanner();
  const { t: full } = useLang();
  const t = full.dashboard.clients;
  const td = t.detail;
  const tc = full.common;
  const tStatus = full.dashboard.invoiceStatus;
  const dateLoc = full.dashboard.dateLocale;

  const [client, setClient] = useState<Client | null>(null);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [loading, setLoading] = useState(true);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);
  const [savingContact, setSavingContact] = useState(false);
  // Cache of distinct role values across this business — feeds the
  // role-field autocomplete so previously-typed titles are one tap away.
  const [roleSuggestions, setRoleSuggestions] = useState<string[]>([]);

  // Communication log: bump to refetch the timeline after a contact is
  // logged via the confirm-outcome prompt.
  const [commReload, setCommReload] = useState(0);
  const { fireContact } = useContactOutcomePrompt({
    supabase,
    businessId: business?.id,
    createdBy: user?.id ?? null,
    labels: full.dashboard.clients.detail.commLog.prompt,
    onLogged: () => setCommReload(n => n + 1),
  });

  const load = async () => {
    if (!business || !id) return;
    setLoading(true);
    // Client + contacts cached so the record opens offline (incl. on-site adds).
    // Invoices + templates are best-effort (offline → empty).
    const clientRes = await loadCached(`client_${id}`, async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Client;
    });
    const contactsRes = await loadCached(`client_contacts_${id}`, async () => {
      const { data, error } = await supabase
        .from('client_contacts')
        .select('*')
        .eq('client_id', id)
        .order('is_primary', { ascending: false });
      if (error) throw error;
      return (data as ClientContact[] | null) ?? [];
    });
    let invData: Invoice[] = [];
    let tplData: FieldTemplate[] = [];
    try {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, total_amount, due_date, created_at')
        .eq('client_id', id)
        .order('created_at', { ascending: false });
      invData = (data as Invoice[] | null) ?? [];
    } catch { /* offline */ }
    try {
      const { data } = await supabase
        .from('client_field_templates')
        .select('*')
        .eq('business_id', business.id)
        .order('sort_order');
      tplData = (data as FieldTemplate[] | null) ?? [];
    } catch { /* offline */ }
    setClient(clientRes.data ?? null);
    setInvoices(invData);
    setTemplates(tplData);
    setContacts(contactsRes.data ?? []);
    setLoading(false);

    // Background fetch of all roles across the business. Cheap query
    // (single column, indexed) and the result feeds the AutocompleteInput
    // in the contact modal. Deduped + sorted client-side.
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

  // useFocusEffect instead of useEffect: the screen re-loads every time it
  // comes into focus, including when the user returns from the Edit screen
  // via router.replace. A plain useEffect keyed on [id, business?.id] would
  // skip the reload because the id is the same as before — leaving the page
  // showing stale data until a manual refresh.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [id, business?.id]),
  );

  const stats = useMemo(() => {
    const totalPaid = invoices
      .filter(i => i.status === 'paid')
      .reduce((s, i) => s + i.total_amount, 0);
    const pendingTotal = invoices
      .filter(i => i.status === 'sent')
      .reduce((s, i) => s + i.total_amount, 0);
    return { totalPaid, pendingTotal, count: invoices.length };
  }, [invoices]);

  // Date only (e.g. due_date). Timestamps with a time component should use
  // fmtDateTime so the time shows up too.
  const fmtDate = (iso: string | null): string | null =>
    iso ? formatDateLong(iso, dateLoc) : null;

  const fmtDateTime = (iso: string | null): string | null =>
    iso ? formatDateTimeLong(iso, dateLoc) : null;

  // Build the label map used for both PDF rows and CSV headers — matches
  // what the user already sees in the form labels so a shared CSV imports
  // cleanly into the recipient's Amixos (same locale auto-maps without
  // manual column picking).
  const buildShareLabels = () => ({
    first_name: t.fields.firstName,
    last_name: t.fields.lastName,
    company: t.fields.company,
    phone_cell: t.fields.phoneCell,
    phone_office: t.fields.phoneOffice,
    email_office: t.fields.emailOffice,
    email_home: t.fields.emailHome,
    address: t.fields.addressLine1,
    address_line2: t.fields.addressLine2 ?? 'Línea 2',
    city: t.fields.city,
    state: t.fields.state,
    zip_code: t.fields.zipCode,
    notes: t.fields.notes ?? 'Notas',
  });

  const onShareCsv = async () => {
    if (!client) return;
    try {
      const csv = buildClientCsv(
        client,
        buildShareLabels(),
        templates.map(tpl => ({ field_key: tpl.field_key, field_label: tpl.field_label })),
      );
      const safeName = [client.first_name, client.last_name]
        .filter(Boolean)
        .join('_')
        .replace(/[^a-zA-Z0-9_-]/g, '') || 'cliente';
      const path = `${FileSystem.cacheDirectory}${safeName}.csv`;
      await FileSystem.writeAsStringAsync(path, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: 'text/csv',
          dialogTitle: td.shareTitle,
          UTI: 'public.comma-separated-values-text',
        });
      }
    } catch {
      Alert.alert('', td.shareError);
    }
  };

  const onSharePdf = () => {
    if (!client) return;
    Alert.alert(td.shareDialogTitle, undefined, [
      { text: tc.buttons.cancel, style: 'cancel' },
      { text: td.shareDialogBasic, onPress: () => runPdfShare(false) },
      { text: td.shareDialogAll, onPress: () => runPdfShare(true) },
    ]);
  };

  const runPdfShare = async (includeAll: boolean) => {
    if (!client) return;
    try {
      const html = buildClientHtml(
        client,
        buildShareLabels(),
        templates.map(tpl => ({ field_key: tpl.field_key, field_label: tpl.field_label })),
        {
          includeAll,
          contacts: includeAll
            ? contacts.map(c => ({
                name: c.name,
                role: c.role,
                phone: c.phone,
                email: c.email,
              }))
            : undefined,
          contactsHeading: td.contactPeople,
        },
      );
      // Render HTML → PDF on device, then surface the OS share sheet so
      // the user can save / send / print from there.
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: td.shareTitle,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch {
      Alert.alert('', td.shareError);
    }
  };

  const confirmDelete = () => {
    if (!client) return;
    Alert.alert(t.confirmDeleteSingle, undefined, [
      { text: tc.buttons.cancel, style: 'cancel' },
      {
        text: t.bulkDelete,
        style: 'destructive',
        onPress: async () => {
          // Sync delete BEFORE the local row is gone (API needs the
          // google_resource_name from the row to call People API).
          const apiBaseUrl = getApiBaseUrl();
          const jwt = await getJwt();
          if (apiBaseUrl && jwt) {
            try {
              await triggerGoogleSyncOrThrow('delete', client.id, { apiBaseUrl, jwt });
            } catch (e) {
              syncBanner.reportError(googleSyncErrorMessage(e, 'No se pudo eliminar el contacto de Google Contacts.'));
            }
          }
          await supabase.from('clients').delete().eq('id', client.id);
          router.replace('/dashboard/clientes' as never);
        },
      },
    ]);
  };

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm(EMPTY_CONTACT);
    setContactModalOpen(true);
  };

  const openEditContact = (ct: ClientContact) => {
    setEditingContact(ct);
    setContactForm({
      name: ct.name,
      role: ct.role ?? '',
      phone: ct.phone ?? '',
      email: ct.email ?? '',
      notes: ct.notes ?? '',
      is_primary: ct.is_primary,
    });
    setContactModalOpen(true);
  };

  const saveContact = async () => {
    if (!contactForm.name.trim() || !client || !business) return;
    setSavingContact(true);
    const payload = {
      name: contactForm.name.trim(),
      role: contactForm.role.trim() || null,
      phone: contactForm.phone.trim() || null,
      email: contactForm.email.trim() || null,
      notes: contactForm.notes.trim() || null,
      is_primary: contactForm.is_primary,
    };

    let syncContactId: string | null = null;
    let syncAction: 'create' | 'update' = 'update';
    try {
      // A new primary unsets the others first.
      if (contactForm.is_primary) {
        await queuedUpdate({ table: 'client_contacts', match: { client_id: client.id }, payload: { is_primary: false }, businessId: business.id, label: `Contacto principal` });
      }
      if (editingContact) {
        await queuedUpdate({ table: 'client_contacts', match: { id: editingContact.id }, payload, businessId: business.id, label: `Contacto: ${payload.name}` });
        syncContactId = editingContact.id;
        syncAction = 'update';
      } else {
        const newId = newUuid();
        await queuedInsert({ table: 'client_contacts', payload: { ...payload, id: newId, client_id: client.id, business_id: business.id }, businessId: business.id, label: `Contacto: ${payload.name}` });
        syncContactId = newId;
        syncAction = 'create';
      }
    } catch {
      setSavingContact(false);
      return; // real DB rejection
    }

    // Optimistic local update (works offline; next online focus reconciles).
    // Mirror it to the contacts cache so reopening offline shows the change.
    setContacts((prev) => {
      let next = contactForm.is_primary ? prev.map((c) => ({ ...c, is_primary: false })) : [...prev];
      if (editingContact) {
        next = next.map((c) => (c.id === editingContact.id ? ({ ...c, ...payload } as ClientContact) : c));
      } else {
        next = [{ ...payload, id: syncContactId!, client_id: client.id, business_id: business.id, created_at: new Date().toISOString() } as ClientContact, ...next];
      }
      next = [...next].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
      void writeCached(`client_contacts_${client.id}`, next);
      return next;
    });
    setSavingContact(false);
    setContactModalOpen(false);

    // Fire-and-forget Google sync — online only (best-effort secondary mirror).
    if (syncContactId && isOnlineNow()) {
      void (async () => {
        const apiBaseUrl = getApiBaseUrl();
        const jwt = await getJwt();
        if (apiBaseUrl && jwt) {
          triggerClientContactGoogleSync(syncAction, syncContactId!, { apiBaseUrl, jwt });
        }
      })();
    }
  };

  const removeContact = (ctId: string) => {
    Alert.alert(td.contactModal.confirmDelete, undefined, [
      { text: tc.buttons.cancel, style: 'cancel' },
      {
        text: t.bulkDelete,
        style: 'destructive',
        onPress: async () => {
          // Sync delete BEFORE local row drop so the API can look up the
          // contact's google_resource_name.
          const apiBaseUrl = getApiBaseUrl();
          const jwt = await getJwt();
          if (apiBaseUrl && jwt) {
            await triggerClientContactGoogleSync('delete', ctId, { apiBaseUrl, jwt });
          }
          await supabase.from('client_contacts').delete().eq('id', ctId);
          setContacts(prev => prev.filter(c => c.id !== ctId));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#4F46E5" />
      </SafeAreaView>
    );
  }

  if (!client) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <Text className="text-sm text-gray-500">{t.notFound}</Text>
      </SafeAreaView>
    );
  }

  const primaryPhone = client.phone_cell ?? client.phone;
  const officePhone = client.phone_office;
  const primaryEmail = client.email_office ?? client.email;
  const homeEmail = client.email_home;
  const fullAddress = [
    client.address,
    client.address_line2,
    [client.city, client.state].filter(Boolean).join(', '),
    client.zip_code,
  ]
    .filter(Boolean)
    .join('\n');
  // Maps link for the address — prefers geocoded coords, falls back to the
  // address string. Opens in whichever maps app the device uses.
  const clientMapsUrl = (() => {
    if (client.lat != null && client.lng != null) {
      return `https://maps.google.com/?q=${client.lat},${client.lng}`;
    }
    const q = [client.address, client.address_line2, client.city, client.state, client.zip_code]
      .filter(Boolean)
      .join(' ')
      .trim();
    return q ? `https://maps.google.com/?q=${encodeURIComponent(q)}` : '';
  })();
  const initials = `${client.first_name.charAt(0)}${client.last_name.charAt(0)}`.toUpperCase();

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable
          onPress={goBack}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-gray-100"
        >
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <View className="flex-row gap-1">
          <Pressable
            onPress={onSharePdf}
            hitSlop={8}
            className="p-2 rounded-lg active:bg-gray-100"
            accessibilityLabel={td.sharePdfBtn}
          >
            <FileText size={18} color="#6B7280" />
          </Pressable>
          <Pressable
            onPress={onShareCsv}
            hitSlop={8}
            className="p-2 rounded-lg active:bg-gray-100"
            accessibilityLabel={td.shareCsvBtn}
          >
            <Share2 size={18} color="#6B7280" />
          </Pressable>
          <Pressable
            onPress={() => router.push(`/dashboard/clientes/nuevo?edit=${client.id}` as never)}
            hitSlop={8}
            className="p-2 rounded-lg active:bg-gray-100"
          >
            <Pencil size={18} color="#6B7280" />
          </Pressable>
          <Pressable
            onPress={confirmDelete}
            hitSlop={8}
            className="p-2 rounded-lg active:bg-red-50"
          >
            <Trash2 size={18} color="#EF4444" />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerClassName="px-5 pt-5 pb-32">
        {/* Header card: avatar + name + company */}
        <View className="flex-row items-center gap-4 mb-5">
          <View className="w-14 h-14 rounded-full bg-primary/10 items-center justify-center">
            <Text className="text-primary text-lg font-bold">{initials}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-xl font-bold text-gray-900">
              {client.first_name} {client.last_name}
            </Text>
            {client.company ? (
              <View className="flex-row items-center gap-1.5 mt-0.5">
                <Building2 size={13} color="#9CA3AF" />
                <Text className="text-sm text-gray-500">{client.company}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Quick actions */}
        <View className="flex-row gap-2 mb-3">
          <Pressable
            disabled={!primaryPhone}
            onPress={() => primaryPhone && fireContact({
              type: 'call',
              target: `tel:${primaryPhone}`,
              contactMethod: primaryPhone,
              clientId: client.id,
            })}
            className={`flex-1 items-center justify-center py-3 rounded-2xl shadow-sm border ${
              primaryPhone
                ? 'bg-white border-gray-100 active:bg-gray-50'
                : 'bg-gray-50 border-gray-100 opacity-50'
            }`}
          >
            <Phone size={18} color={primaryPhone ? '#4F46E5' : '#9CA3AF'} />
            <Text
              className={`text-[11px] font-semibold mt-1 ${
                primaryPhone ? 'text-primary' : 'text-gray-400'
              }`}
            >
              {td.actionCall}
            </Text>
          </Pressable>
          <Pressable
            disabled={!primaryPhone}
            onPress={() => primaryPhone && fireContact({
              type: 'sms',
              target: `sms:${primaryPhone}`,
              contactMethod: primaryPhone,
              clientId: client.id,
            })}
            className={`flex-1 items-center justify-center py-3 rounded-2xl shadow-sm border ${
              primaryPhone
                ? 'bg-white border-gray-100 active:bg-gray-50'
                : 'bg-gray-50 border-gray-100 opacity-50'
            }`}
          >
            <MessageSquare size={18} color={primaryPhone ? '#4F46E5' : '#9CA3AF'} />
            <Text
              className={`text-[11px] font-semibold mt-1 ${
                primaryPhone ? 'text-primary' : 'text-gray-400'
              }`}
            >
              {td.actionText}
            </Text>
          </Pressable>
          <Pressable
            disabled={!primaryEmail}
            onPress={() => primaryEmail && fireContact({
              type: 'email',
              target: `mailto:${primaryEmail}`,
              contactMethod: primaryEmail,
              clientId: client.id,
            })}
            className={`flex-1 items-center justify-center py-3 rounded-2xl shadow-sm border ${
              primaryEmail
                ? 'bg-white border-gray-100 active:bg-gray-50'
                : 'bg-gray-50 border-gray-100 opacity-50'
            }`}
          >
            <Mail size={18} color={primaryEmail ? '#4F46E5' : '#9CA3AF'} />
            <Text
              className={`text-[11px] font-semibold mt-1 ${
                primaryEmail ? 'text-primary' : 'text-gray-400'
              }`}
            >
              {td.actionEmail}
            </Text>
          </Pressable>
        </View>

        <View className="flex-row gap-2 mb-5">
          <Pressable
            onPress={() =>
              router.push(`/dashboard/facturas/nueva?client=${client.id}` as never)
            }
            className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-2xl bg-primary active:opacity-80"
          >
            <Plus size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              {full.dashboard.invoices.newInvoice}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push(`/dashboard/trabajos/nuevo?client=${client.id}` as never)
            }
            className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-primary bg-white active:bg-primary/5"
          >
            <Plus size={16} color="#4F46E5" />
            <Text className="text-sm font-semibold text-primary">
              {full.dashboard.jobs.newDropdown.jobOption}
            </Text>
          </Pressable>
        </View>

        {/* Contact card */}
        <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 gap-3">
          <Text className="text-xs font-semibold text-gray-400 uppercase">{td.contact}</Text>
          {primaryPhone ? (
            <Pressable
              onPress={() => openLink(`tel:${primaryPhone}`)}
              className="flex-row items-start gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-gray-50"
            >
              <Phone size={15} color="#9CA3AF" />
              <View className="flex-1">
                <Text className="text-xs text-gray-400">{t.fields.phoneCell}</Text>
                <Text className="text-sm text-gray-900 font-medium">{fmtPhone(primaryPhone)}</Text>
              </View>
            </Pressable>
          ) : null}
          {officePhone ? (
            <Pressable
              onPress={() => openLink(`tel:${officePhone}`)}
              className="flex-row items-start gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-gray-50"
            >
              <Phone size={15} color="#9CA3AF" />
              <View className="flex-1">
                <Text className="text-xs text-gray-400">{t.fields.phoneOffice}</Text>
                <Text className="text-sm text-gray-900 font-medium">{fmtPhone(officePhone)}</Text>
              </View>
            </Pressable>
          ) : null}
          {primaryEmail ? (
            <Pressable
              onPress={() => openLink(`mailto:${primaryEmail}`)}
              className="flex-row items-start gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-gray-50"
            >
              <Mail size={15} color="#9CA3AF" />
              <View className="flex-1">
                <Text className="text-xs text-gray-400">{t.fields.emailOffice}</Text>
                <Text className="text-sm text-gray-900 font-medium">{primaryEmail}</Text>
              </View>
            </Pressable>
          ) : null}
          {homeEmail ? (
            <Pressable
              onPress={() => openLink(`mailto:${homeEmail}`)}
              className="flex-row items-start gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-gray-50"
            >
              <Mail size={15} color="#9CA3AF" />
              <View className="flex-1">
                <Text className="text-xs text-gray-400">{t.fields.emailHome}</Text>
                <Text className="text-sm text-gray-900 font-medium">{homeEmail}</Text>
              </View>
            </Pressable>
          ) : null}
          {fullAddress ? (
            <Pressable
              onPress={() => clientMapsUrl && openLink(clientMapsUrl)}
              disabled={!clientMapsUrl}
              className="flex-row items-start gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-gray-50"
            >
              <MapPin size={15} color="#9CA3AF" />
              <View className="flex-1">
                <Text className="text-xs text-gray-400">{t.fields.addressLine1}</Text>
                <Text className="text-sm text-gray-900 font-medium">{fullAddress}</Text>
                {clientMapsUrl ? (
                  <Text className="text-xs text-primary font-medium mt-0.5">
                    {full.dashboard.jobs.detail.openInMaps}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ) : null}
          {!primaryPhone && !officePhone && !primaryEmail && !homeEmail && !fullAddress ? (
            <Text className="text-xs text-gray-400">{td.noContactInfo}</Text>
          ) : null}
        </View>

        {/* Contact people card */}
        <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-semibold text-gray-400 uppercase">
              {td.contactPeople}
            </Text>
            <Pressable
              onPress={openAddContact}
              hitSlop={8}
              className="p-1 rounded-lg active:bg-gray-100"
            >
              <UserPlus size={15} color="#9CA3AF" />
            </Pressable>
          </View>

          {contacts.length === 0 ? (
            <View className="items-center py-2">
              <Text className="text-xs text-gray-400">{td.noContacts}</Text>
              <Pressable onPress={openAddContact} className="mt-1">
                <Text className="text-xs text-primary font-medium">{td.addContact}</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              {contacts.map((ct, idx) => (
                <View
                  key={ct.id}
                  className={`py-3 ${
                    idx < contacts.length - 1 ? 'border-b border-gray-50' : ''
                  }`}
                >
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-sm font-semibold text-gray-900">{ct.name}</Text>
                        {ct.is_primary ? (
                          <Star size={11} color="#F59E0B" fill="#F59E0B" />
                        ) : null}
                      </View>
                      {ct.role ? (
                        <Text className="text-xs text-gray-400 mt-0.5">{ct.role}</Text>
                      ) : null}
                      {ct.phone ? (
                        <Text className="text-xs text-gray-500 mt-1">{fmtPhone(ct.phone)}</Text>
                      ) : null}
                      {ct.email ? (
                        <Text className="text-xs text-gray-500">{ct.email}</Text>
                      ) : null}
                      {ct.notes ? (
                        <Text className="text-xs text-gray-400 italic mt-1">{ct.notes}</Text>
                      ) : null}
                    </View>
                    <View className="flex-row gap-1">
                      <Pressable
                        onPress={() => openEditContact(ct)}
                        hitSlop={6}
                        className="p-1.5 rounded-lg active:bg-blue-50"
                      >
                        <Pencil size={13} color="#60A5FA" />
                      </Pressable>
                      <Pressable
                        onPress={() => removeContact(ct.id)}
                        hitSlop={6}
                        className="p-1.5 rounded-lg active:bg-red-50"
                      >
                        <Trash2 size={13} color="#F87171" />
                      </Pressable>
                    </View>
                  </View>

                  {(ct.phone || ct.email) ? (
                    <View className="flex-row gap-2 mt-2.5">
                      {ct.phone ? (
                        <Pressable
                          onPress={() => fireContact({
                            type: 'call',
                            target: `tel:${ct.phone}`,
                            contactMethod: ct.phone,
                            clientId: client.id,
                            clientContactId: ct.id,
                          })}
                          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 active:opacity-70"
                        >
                          <Phone size={12} color="#4F46E5" />
                          <Text className="text-[11px] font-semibold text-primary">{td.actionCall}</Text>
                        </Pressable>
                      ) : null}
                      {ct.phone ? (
                        <Pressable
                          onPress={() => fireContact({
                            type: 'sms',
                            target: `sms:${ct.phone}`,
                            contactMethod: ct.phone,
                            clientId: client.id,
                            clientContactId: ct.id,
                          })}
                          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 active:opacity-70"
                        >
                          <MessageSquare size={12} color="#4F46E5" />
                          <Text className="text-[11px] font-semibold text-primary">{td.actionText}</Text>
                        </Pressable>
                      ) : null}
                      {ct.email ? (
                        <Pressable
                          onPress={() => fireContact({
                            type: 'email',
                            target: `mailto:${ct.email}`,
                            contactMethod: ct.email,
                            clientId: client.id,
                            clientContactId: ct.id,
                          })}
                          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 active:opacity-70"
                        >
                          <Mail size={12} color="#4F46E5" />
                          <Text className="text-[11px] font-semibold text-primary">{td.actionEmail}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Custom fields card */}
        {templates.length > 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 gap-2.5">
            <Text className="text-xs font-semibold text-gray-400 uppercase mb-1">
              {t.sections.customFields}
            </Text>
            {templates.map(tpl => {
              const val = client.custom_fields?.[tpl.field_key];
              if (!val && !tpl.required) return null;
              const display = tpl.field_type === 'boolean'
                ? val === 'true' ? tc.states.yes : tc.states.no
                : tpl.field_type === 'number' && val
                  ? formatNumberGrouped(val)
                  : val ?? '—';
              return (
                <View key={tpl.field_key}>
                  <Text className="text-xs text-gray-400">{tpl.field_label}</Text>
                  <Text className="text-sm text-gray-900 font-medium">{display}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Notes */}
        {client.notes ? (
          <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
            <Text className="text-xs font-semibold text-gray-400 uppercase mb-2">
              {t.sections.notes}
            </Text>
            <Text className="text-sm text-gray-600">{client.notes}</Text>
          </View>
        ) : null}

        {/* Summary card */}
        <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 gap-2">
          <Text className="text-xs font-semibold text-gray-400 uppercase mb-1">{td.summary}</Text>
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-500">{td.totalPaid}</Text>
            <Text className="text-sm font-semibold text-emerald-600">{fmtMoney(stats.totalPaid)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-500">{td.pending}</Text>
            <Text className="text-sm font-semibold text-blue-600">{fmtMoney(stats.pendingTotal)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-500">{td.invoicesCount}</Text>
            <Text className="text-sm font-semibold text-gray-900">{stats.count}</Text>
          </View>
        </View>

        {/* Invoices list — inner View clips the rows to rounded corners; the
           outer keeps the shadow (RN clips shadows under overflow-hidden). */}
        <View className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4">
          <View className="rounded-2xl overflow-hidden">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-50">
            <Text className="text-sm font-semibold text-gray-900">{td.invoicesTitle}</Text>
            <Pressable
              onPress={() =>
                router.push(`/dashboard/facturas/nueva?client=${client.id}` as never)
              }
              hitSlop={6}
              className="flex-row items-center gap-1"
            >
              <Plus size={13} color="#4F46E5" />
              <Text className="text-xs font-medium text-primary">{td.newInvoiceShort}</Text>
            </Pressable>
          </View>

          {invoices.length === 0 ? (
            <View className="items-center py-10">
              <FileText size={28} color="#E5E7EB" />
              <Text className="text-sm text-gray-400 mt-2">{td.noInvoices}</Text>
              <Pressable
                onPress={() =>
                  router.push(`/dashboard/facturas/nueva?client=${client.id}` as never)
                }
                className="mt-1"
              >
                <Text className="text-xs font-medium text-primary">{td.createFirstInvoice}</Text>
              </Pressable>
            </View>
          ) : (
            invoices.map((inv, idx) => {
              const status = STATUS_COLORS[inv.status] ?? STATUS_COLORS.draft;
              const statusKey = inv.status as keyof typeof tStatus;
              const statusLabel = tStatus[statusKey] ?? inv.status;
              return (
                <Pressable
                  key={inv.id}
                  onPress={() => router.push(`/dashboard/facturas/${inv.id}` as never)}
                  className={`flex-row items-center justify-between px-4 py-3 active:bg-gray-50 ${
                    idx < invoices.length - 1 ? 'border-b border-gray-50' : ''
                  }`}
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-900">{inv.invoice_number}</Text>
                    <Text className="text-[11px] text-gray-400 mt-0.5">
                      {fmtDateTime(inv.created_at)}
                      {inv.due_date
                        ? ` · ${td.dueShort.replace('{{date}}', formatDateLong(inv.due_date, dateLoc))}`
                        : ''}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2.5">
                    <View
                      className="px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: status.bg }}
                    >
                      <Text className="text-[10px] font-semibold" style={{ color: status.fg }}>
                        {statusLabel}
                      </Text>
                    </View>
                    <Text className="text-sm font-bold text-gray-900">
                      {fmtMoney(inv.total_amount)}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
          </View>
        </View>

        {/* Communication log — placed last, below the invoices list. */}
        <View className="mb-4">
          <CommunicationLog
            supabase={supabase}
            businessId={business?.id ?? ''}
            clientId={client.id}
            createdBy={user?.id ?? null}
            contacts={contacts.map(c => ({ id: c.id, name: c.name }))}
            reloadToken={commReload}
          />
        </View>

        {/* Created / last-edited footer — mirrors the job detail screen. */}
        <View className="px-1 pb-2 gap-0.5">
          <Text className="text-[10px] text-gray-400">{td.addedAt} · {fmtDateTime(client.created_at)}</Text>
          {client.updated_at && client.updated_at !== client.created_at ? (
            <Text className="text-[10px] text-gray-400">{td.modifiedAt} · {fmtDateTime(client.updated_at)}</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Contact person modal — full-screen sliding sheet so the underlying
          client detail isn't visible bleeding through. Header matches the
          rest of the app: back arrow (cancel) left, save text-button right. */}
      <RNModal
        visible={contactModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setContactModalOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
          <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-gray-100">
            <Pressable
              onPress={() => setContactModalOpen(false)}
              hitSlop={12}
              className="p-2 -ml-2 rounded-lg active:bg-gray-100"
            >
              <ChevronLeft size={22} color="#111827" />
            </Pressable>
            <Text className="text-lg font-semibold text-gray-900" numberOfLines={1}>
              {editingContact ? td.contactModal.editTitle : td.contactModal.addTitle}
            </Text>
            <Pressable
              onPress={saveContact}
              disabled={!contactForm.name.trim() || savingContact}
              hitSlop={12}
              className="px-1.5 py-1 -mr-1.5 rounded-lg active:bg-primary/10"
            >
              <Text
                className={`text-[15px] font-medium ${
                  contactForm.name.trim() && !savingContact ? 'text-primary' : 'text-gray-300'
                }`}
              >
                {tc.buttons.save}
              </Text>
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="px-5 pt-5 pb-12">
            <View className="gap-3">
              <Input
                label={td.contactModal.nameLabel}
                placeholder={td.contactModal.namePlaceholder}
                value={contactForm.name}
                onChangeText={v => setContactForm(f => ({ ...f, name: v }))}
              />
              <AutocompleteInput
                label={td.contactModal.roleLabel}
                placeholder={td.contactModal.rolePlaceholder}
                value={contactForm.role}
                onChangeText={v => setContactForm(f => ({ ...f, role: v }))}
                suggestions={roleSuggestions}
              />
              <Input
                label={td.contactModal.phoneLabel}
                placeholder={t.fields.placeholders.phone}
                value={fmtPhoneInput(contactForm.phone)}
                onChangeText={v => setContactForm(f => ({ ...f, phone: fmtPhoneInput(v) }))}
                keyboardType="phone-pad"
                leftIcon={<Phone size={15} color="#9CA3AF" />}
              />
              <Input
                label={td.contactModal.emailLabel}
                placeholder={td.contactModal.emailPlaceholder}
                value={contactForm.email}
                onChangeText={v => setContactForm(f => ({ ...f, email: v }))}
                keyboardType="email-address"
                autoCapitalize="none"
                leftIcon={<Mail size={15} color="#9CA3AF" />}
              />
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">
                  {td.contactModal.notesLabel}
                </Text>
                <View className="rounded-xl border border-gray-200 bg-white px-4 py-1">
                  <TextInput
                    multiline
                    numberOfLines={3}
                    placeholder={td.contactModal.notesPlaceholder}
                    placeholderTextColor="#9CA3AF"
                    value={contactForm.notes}
                    onChangeText={v => setContactForm(f => ({ ...f, notes: v }))}
                    className="text-sm text-gray-900 py-2"
                    style={{ textAlignVertical: 'top', minHeight: 60 }}
                  />
                </View>
              </View>
              <View className="flex-row items-center gap-3 mt-1">
                <Toggle
                  value={contactForm.is_primary}
                  onValueChange={v => setContactForm(f => ({ ...f, is_primary: v }))}
                />
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-sm text-gray-700">{td.contactModal.primaryLabel}</Text>
                  <Star size={12} color="#4F46E5" fill="#4F46E5" />
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </RNModal>
    </SafeAreaView>
  );
}
