import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Printer,
  ShieldCheck,
  Building2,
  CloudOff,
  Star,
  UserPlus,
  Share2,
} from 'lucide-react-native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { buildClientCsv, buildClientHtml } from '@amixos/shared/lib/clientShare';
import { parsePolicyAgents, agentFor, buildPolicyEmail, type PolicyDocKind } from '@amixos/shared/lib/policyAgents';
import { createSupabaseClient } from '@/lib/supabase';
import { loadCached, writeCached } from '@/lib/offline/cache';
import { swrRead } from '@amixos/shared/lib/swrCache';
import { queuedInsert, queuedUpdate } from '@/lib/offline/mutate';
import { newUuid } from '@/lib/offline/ids';
import { isOnlineNow } from '@/lib/offline/network';
import { useApp } from '@/lib/AppContext';
import { can } from '@amixos/shared/lib/permissions';
import { useLang } from '@/lib/i18n/LangProvider';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import { AutocompleteInput, Button, Input, Toggle } from '@amixos/shared/ui';
import { formatDateLong, formatDateTimeLong, formatNumberGrouped, formatRelativeLong } from '@amixos/shared/lib/format';
import { triggerGoogleSyncOrThrow, triggerClientContactGoogleSync, googleSyncErrorMessage } from '@amixos/shared/lib/googleSync';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { CommunicationLog } from '@amixos/shared/screens/dashboard/CommunicationLog';
import { useContactOutcomePrompt } from '@/lib/useContactOutcomePrompt';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { useThemeColors } from '@/lib/ThemeProvider';

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'note' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
  field_config: { integerOnly?: boolean; multi?: boolean } | null;
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
  cc_on_invoices: boolean;
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
  cc_on_invoices: false,
};

export default function ClienteDetailRoute() {
  const router = useRouter();
  const c = useThemeColors();
  const { id, from, jobId, invoice } = useLocalSearchParams<{ id: string; from?: string; jobId?: string; invoice?: string }>();
  // Honor ?from=map so the back arrow returns to the map module instead of the
  // clientes list. ?from=job&jobId=… returns to that specific job. We navigate
  // explicitly (not router.back()) because clientes/[id] and trabajos/[id] live
  // in the same Tabs navigator, where back() can land on the wrong tab root.
  const goBack = () => {
    if (from === 'map') {
      router.replace('/dashboard/mas/modulos/map' as never);
    } else if (from === 'job' && jobId) {
      router.replace(`/dashboard/trabajos/${jobId}` as never);
    } else if (from === 'invoice' && invoice) {
      router.replace(`/dashboard/facturas/${invoice}` as never);
    } else if (router.canGoBack()) {
      // Pop back to the existing list screen (each section is its own Stack)
      // so the list keeps its scroll position and loaded data — replace()
      // would build a fresh list from scratch, resetting both.
      router.back();
    } else {
      router.replace('/dashboard/clientes' as never);
    }
  };
  const supabase = createSupabaseClient();
  const { business, user, currentRole } = useApp();
  // Write gates: viewer / field can read a client but not edit or delete it,
  // nor manage its contacts. RLS enforces this server-side; we hide the
  // buttons so those roles don't tap actions that would silently fail.
  const canEdit = can.editClient(currentRole);
  const canDelete = can.deleteClient(currentRole);
  const syncBanner = useGoogleSyncBanner();
  const { t: full, locale } = useLang();
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
  // True when the live fetch failed and we're showing the saved offline copy —
  // surfaced as a chip (with its save time) so the user knows how stale it is.
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

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

  // True once any snapshot (cached or live) painted — focus revalidates run
  // silently instead of blanking back to the spinner.
  const hasDataRef = useRef(false);
  const load = async () => {
    if (!business || !id) return;
    // Cache-first: paint the last saved snapshot immediately, then let the
    // live fetch below replace it (same keys loadCached persists).
    if (!hasDataRef.current) {
      setLoading(true);
      const [cc, cts] = await Promise.all([
        swrRead<NonNullable<typeof client>>(`client_${id}`),
        swrRead<typeof contacts>(`client_contacts_${id}`),
      ]);
      if (cc?.data && !hasDataRef.current) {
        hasDataRef.current = true;
        setClient(cc.data);
        setContacts(cts?.data ?? []);
        setLoading(false);
      }
    }
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
    hasDataRef.current = !!clientRes.data;
    setClient(clientRes.data ?? null);
    setInvoices(invData);
    setTemplates(localizeTemplates(tplData, locale));
    setContacts(contactsRes.data ?? []);
    setOfflineCopy(clientRes.fromCache || contactsRes.fromCache);
    setCachedAt(clientRes.cachedAt ?? contactsRes.cachedAt);
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
    }, [id, business?.id, locale]),
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
        undefined,
        // Contact people ride along so importing into another Amixos business
        // recreates them (the clients importer parses this column).
        contacts.length
          ? { list: contacts.map(ct => ({ name: ct.name, role: ct.role, phone: ct.phone, email: ct.email })), label: td.contactPeople }
          : undefined,
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

  // "Enviar póliza": draft an email asking the insurance agent (Ajustes →
  // Negocio) to send the COI / workers comp to this client.
  const policyAgents = parsePolicyAgents(business?.policy_agents);
  const canEmailPolicy = !!agentFor(policyAgents, 'coi');
  const sendPolicyEmail = (kind: PolicyDocKind) => {
    if (!client || !business) return;
    const draft = buildPolicyEmail({
      agents: policyAgents,
      kind,
      businessName: business.name,
      client: {
        name: [client.first_name, client.last_name].filter(Boolean).join(' '),
        company: client.company,
        addressLines: [
          [client.address, client.address_line2].filter(Boolean).join(', '),
          [client.city, client.state, client.zip_code].filter(Boolean).join(', '),
        ].filter(Boolean),
        phone: client.phone_cell || client.phone_office,
        email: client.email_office || client.email_home,
      },
      t: {
        subject: td.policy.subject,
        body: td.policy.body,
        docsCoi: td.policy.docsCoi,
        docsWorkcomp: td.policy.docsWorkcomp,
        docsBoth: td.policy.docsBoth,
        nameLabel: td.policy.nameLabel,
        companyLabel: td.policy.companyLabel,
        addressLabel: td.policy.addressLabel,
        phoneLabel: td.policy.phoneLabel,
        emailLabel: td.policy.emailLabel,
      },
    });
    if (!draft) return;
    openLink(`mailto:${draft.to}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`);
  };

  const onEmailPolicy = () => {
    Alert.alert(td.policy.dialogTitle, undefined, [
      { text: tc.buttons.cancel, style: 'cancel' },
      { text: td.policy.coi, onPress: () => sendPolicyEmail('coi') },
      { text: td.policy.workcomp, onPress: () => sendPolicyEmail('workcomp') },
      { text: td.policy.both, onPress: () => sendPolicyEmail('both') },
    ]);
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
          invoices: includeAll && invoices.length
            ? invoices.map(inv => ({
                number: inv.invoice_number,
                date: inv.created_at ? formatDateLong(inv.created_at, dateLoc) : '',
                status: (tStatus as Record<string, string>)[inv.status] ?? inv.status,
                total: `$${formatNumberGrouped(inv.total_amount)}`,
              }))
            : undefined,
          invoicesHeading: td.pdfInvoicesHeading,
          invoicesTotalLabel: td.pdfInvoicesTotal,
          invoicesTotalValue: includeAll && invoices.length
            ? `$${formatNumberGrouped(invoices.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0))}`
            : undefined,
          generatedLine: td.pdfGeneratedOn.replace('{{date}}', formatDateLong(new Date(), dateLoc)),
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
      cc_on_invoices: ct.cc_on_invoices,
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
      cc_on_invoices: contactForm.cc_on_invoices && !!contactForm.email.trim(),
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
        <ActivityIndicator color={c.primary} />
      </SafeAreaView>
    );
  }

  if (!client) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <Text className="text-sm text-muted">{t.notFound}</Text>
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
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-border-soft">
        <Pressable
          onPress={goBack}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-border-soft"
        >
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <View className="flex-row gap-1">
          <Pressable
            onPress={onSharePdf}
            hitSlop={8}
            className="p-2 rounded-lg active:bg-border-soft"
            accessibilityLabel={td.sharePdfBtn}
          >
            <Printer size={18} color={c.muted} />
          </Pressable>
          <Pressable
            onPress={onShareCsv}
            hitSlop={8}
            className="p-2 rounded-lg active:bg-border-soft"
            accessibilityLabel={td.shareCsvBtn}
          >
            <Share2 size={18} color={c.muted} />
          </Pressable>
          {canEmailPolicy ? (
            <Pressable
              onPress={onEmailPolicy}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-border-soft"
              accessibilityLabel={td.policy.btn}
            >
              <ShieldCheck size={18} color={c.muted} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.push(`/dashboard/facturas/precios?client=${client.id}` as never)}
            hitSlop={8}
            className="p-2 rounded-lg active:bg-border-soft"
            accessibilityLabel={full.dashboard.settings.priceSheet.generateForClientBtn}
          >
            <FileText size={18} color={c.muted} />
          </Pressable>
          {canEdit ? (
            <Pressable
              onPress={() => router.push(`/dashboard/clientes/nuevo?edit=${client.id}` as never)}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-border-soft"
            >
              <Pencil size={18} color={c.muted} />
            </Pressable>
          ) : null}
          {canDelete ? (
            <Pressable
              onPress={confirmDelete}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-red-500/10"
            >
              <Trash2 size={18} color={c.danger} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerClassName="px-5 pt-5 pb-44">
        {/* Header card: avatar + name + company */}
        <View className="flex-row items-center gap-4 mb-5">
          <View className="w-14 h-14 rounded-full bg-primary/10 items-center justify-center">
            <Text className="text-primary text-lg font-bold">{initials}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-xl font-bold text-ink">
              {client.first_name} {client.last_name}
            </Text>
            {client.company ? (
              <View className="flex-row items-center gap-1.5 mt-0.5">
                <Building2 size={13} color={c.faint} />
                <Text className="text-sm text-muted">{client.company}</Text>
              </View>
            ) : null}
            {offlineCopy ? (
              <View className="flex-row items-center gap-1.5 self-start mt-1.5 px-2.5 py-1 rounded-full bg-amber-500/10">
                <CloudOff size={12} color="#B45309" />
                <Text className="text-xs font-medium" style={{ color: '#B45309' }}>
                  {locale === 'es' ? 'Copia sin conexión' : 'Offline copy'}
                  {cachedAt
                    ? ` · ${formatRelativeLong(new Date(cachedAt), full.dashboard.clients.detail.commLog.rel)}`
                    : ''}
                </Text>
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
                ? 'bg-card border-border-soft active:bg-surface'
                : 'bg-surface border-border-soft opacity-50'
            }`}
          >
            <Phone size={18} color={primaryPhone ? c.primary : c.faint} />
            <Text
              className={`text-[11px] font-semibold mt-1 ${
                primaryPhone ? 'text-primary' : 'text-faint'
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
                ? 'bg-card border-border-soft active:bg-surface'
                : 'bg-surface border-border-soft opacity-50'
            }`}
          >
            <MessageSquare size={18} color={primaryPhone ? c.primary : c.faint} />
            <Text
              className={`text-[11px] font-semibold mt-1 ${
                primaryPhone ? 'text-primary' : 'text-faint'
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
                ? 'bg-card border-border-soft active:bg-surface'
                : 'bg-surface border-border-soft opacity-50'
            }`}
          >
            <Mail size={18} color={primaryEmail ? c.primary : c.faint} />
            <Text
              className={`text-[11px] font-semibold mt-1 ${
                primaryEmail ? 'text-primary' : 'text-faint'
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
            className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-primary bg-card active:bg-primary/5"
          >
            <Plus size={16} color={c.primary} />
            <Text className="text-sm font-semibold text-primary">
              {full.dashboard.jobs.newDropdown.jobOption}
            </Text>
          </Pressable>
        </View>

        {/* Contact card */}
        <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-4 gap-3">
          <Text className="text-xs font-semibold text-faint uppercase">{td.contact}</Text>
          {primaryPhone ? (
            <Pressable
              onPress={() => openLink(`tel:${primaryPhone}`)}
              className="flex-row items-start gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-surface"
            >
              <Phone size={15} color={c.faint} />
              <View className="flex-1">
                <Text className="text-xs text-faint">{t.fields.phoneCell}</Text>
                <Text className="text-sm text-ink font-medium">{fmtPhone(primaryPhone)}</Text>
              </View>
            </Pressable>
          ) : null}
          {officePhone ? (
            <Pressable
              onPress={() => openLink(`tel:${officePhone}`)}
              className="flex-row items-start gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-surface"
            >
              <Phone size={15} color={c.faint} />
              <View className="flex-1">
                <Text className="text-xs text-faint">{t.fields.phoneOffice}</Text>
                <Text className="text-sm text-ink font-medium">{fmtPhone(officePhone)}</Text>
              </View>
            </Pressable>
          ) : null}
          {primaryEmail ? (
            <Pressable
              onPress={() => openLink(`mailto:${primaryEmail}`)}
              className="flex-row items-start gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-surface"
            >
              <Mail size={15} color={c.faint} />
              <View className="flex-1">
                <Text className="text-xs text-faint">{t.fields.emailOffice}</Text>
                <Text className="text-sm text-ink font-medium">{primaryEmail}</Text>
              </View>
            </Pressable>
          ) : null}
          {homeEmail ? (
            <Pressable
              onPress={() => openLink(`mailto:${homeEmail}`)}
              className="flex-row items-start gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-surface"
            >
              <Mail size={15} color={c.faint} />
              <View className="flex-1">
                <Text className="text-xs text-faint">{t.fields.emailHome}</Text>
                <Text className="text-sm text-ink font-medium">{homeEmail}</Text>
              </View>
            </Pressable>
          ) : null}
          {fullAddress ? (
            <Pressable
              onPress={() => clientMapsUrl && openLink(clientMapsUrl)}
              disabled={!clientMapsUrl}
              className="flex-row items-start gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-surface"
            >
              <MapPin size={15} color={c.faint} />
              <View className="flex-1">
                <Text className="text-xs text-faint">{t.fields.addressLine1}</Text>
                <Text className="text-sm text-ink font-medium">{fullAddress}</Text>
                {clientMapsUrl ? (
                  <Text className="text-xs text-primary font-medium mt-0.5">
                    {full.dashboard.jobs.detail.openInMaps}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ) : null}
          {!primaryPhone && !officePhone && !primaryEmail && !homeEmail && !fullAddress ? (
            <Text className="text-xs text-faint">{td.noContactInfo}</Text>
          ) : null}
        </View>

        {/* Contact people card */}
        <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-semibold text-faint uppercase">
              {td.contactPeople}
            </Text>
            {canEdit ? (
              <Pressable
                onPress={openAddContact}
                hitSlop={8}
                className="p-1 rounded-lg active:bg-border-soft"
              >
                <UserPlus size={15} color={c.faint} />
              </Pressable>
            ) : null}
          </View>

          {contacts.length === 0 ? (
            <View className="items-center py-2">
              <Text className="text-xs text-faint">{td.noContacts}</Text>
              {canEdit ? (
                <Pressable onPress={openAddContact} className="mt-1">
                  <Text className="text-xs text-primary font-medium">{td.addContact}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View>
              {contacts.map((ct, idx) => (
                <View
                  key={ct.id}
                  className={`py-3 ${
                    idx < contacts.length - 1 ? 'border-b border-border-soft' : ''
                  }`}
                >
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-sm font-semibold text-ink">{ct.name}</Text>
                        {ct.is_primary ? (
                          <Star size={11} color={c.warning} fill="#F59E0B" />
                        ) : null}
                        {ct.cc_on_invoices ? (
                          <View className="px-1.5 py-0.5 rounded-full bg-primary/10">
                            <Text className="text-[10px] font-semibold text-primary">{td.contactModal.ccBadge}</Text>
                          </View>
                        ) : null}
                      </View>
                      {ct.role ? (
                        <Text className="text-xs text-faint mt-0.5">{ct.role}</Text>
                      ) : null}
                      {ct.phone ? (
                        <Text className="text-xs text-muted mt-1">{fmtPhone(ct.phone)}</Text>
                      ) : null}
                      {ct.email ? (
                        <Text className="text-xs text-muted">{ct.email}</Text>
                      ) : null}
                      {ct.notes ? (
                        <Text className="text-xs text-faint italic mt-1">{ct.notes}</Text>
                      ) : null}
                    </View>
                    {canEdit ? (
                      <View className="flex-row gap-1">
                        <Pressable
                          onPress={() => openEditContact(ct)}
                          hitSlop={6}
                          className="p-1.5 rounded-lg active:bg-blue-500/10"
                        >
                          <Pencil size={13} color={c.primary} />
                        </Pressable>
                        <Pressable
                          onPress={() => removeContact(ct.id)}
                          hitSlop={6}
                          className="p-1.5 rounded-lg active:bg-red-500/10"
                        >
                          <Trash2 size={13} color={c.danger} />
                        </Pressable>
                      </View>
                    ) : null}
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
                          <Phone size={12} color={c.primary} />
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
                          <MessageSquare size={12} color={c.primary} />
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
                          <Mail size={12} color={c.primary} />
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

        {/* Custom fields card — hidden entirely when no field would render
           (only rows with a value, or required ones, are shown). */}
        {templates.some(tpl => client.custom_fields?.[tpl.field_key] || tpl.required) ? (
          <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-4 gap-2.5">
            <Text className="text-xs font-semibold text-faint uppercase mb-1">
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
                  <Text className="text-xs text-faint">{tpl.field_label}</Text>
                  <Text className="text-sm text-ink font-medium">{display}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Notes */}
        {client.notes ? (
          <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-4">
            <Text className="text-xs font-semibold text-faint uppercase mb-2">
              {t.sections.notes}
            </Text>
            <Text className="text-sm text-muted">{client.notes}</Text>
          </View>
        ) : null}

        {/* Summary card */}
        <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-4 gap-2">
          <Text className="text-xs font-semibold text-faint uppercase mb-1">{td.summary}</Text>
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">{td.totalPaid}</Text>
            <Text className="text-sm font-semibold text-emerald-600">{fmtMoney(stats.totalPaid)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">{td.pending}</Text>
            <Text className="text-sm font-semibold text-blue-600">{fmtMoney(stats.pendingTotal)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">{td.invoicesCount}</Text>
            <Text className="text-sm font-semibold text-ink">{stats.count}</Text>
          </View>
        </View>

        {/* Invoices list — inner View clips the rows to rounded corners; the
           outer keeps the shadow (RN clips shadows under overflow-hidden). */}
        <View className="bg-card rounded-2xl border border-border-soft shadow-sm mb-4">
          <View className="rounded-2xl overflow-hidden">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-soft">
            <Text className="text-sm font-semibold text-ink">{td.invoicesTitle}</Text>
            <Pressable
              onPress={() =>
                router.push(`/dashboard/facturas/nueva?client=${client.id}` as never)
              }
              hitSlop={6}
              className="flex-row items-center gap-1"
            >
              <Plus size={13} color={c.primary} />
              <Text className="text-xs font-medium text-primary">{td.newInvoiceShort}</Text>
            </Pressable>
          </View>

          {invoices.length === 0 ? (
            <View className="items-center py-10">
              <FileText size={28} color={c.faint} />
              <Text className="text-sm text-faint mt-2">{td.noInvoices}</Text>
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
                  onPress={() => router.push(`/dashboard/facturas/${inv.id}?from=client&clientId=${client.id}` as never)}
                  className={`flex-row items-center justify-between px-4 py-3 active:bg-surface ${
                    idx < invoices.length - 1 ? 'border-b border-border-soft' : ''
                  }`}
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-ink">{inv.invoice_number}</Text>
                    <Text className="text-[11px] text-faint mt-0.5">
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
                    <Text className="text-sm font-bold text-ink">
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
          <Text className="text-[10px] text-faint">{td.addedAt} · {fmtDateTime(client.created_at)}</Text>
          {client.updated_at && client.updated_at !== client.created_at ? (
            <Text className="text-[10px] text-faint">{td.modifiedAt} · {fmtDateTime(client.updated_at)}</Text>
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
          <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-border-soft">
            <Pressable
              onPress={() => setContactModalOpen(false)}
              hitSlop={12}
              className="p-2 -ml-2 rounded-lg active:bg-border-soft"
            >
              <ChevronLeft size={22} color={c.ink} />
            </Pressable>
            <Text className="text-lg font-semibold text-ink" numberOfLines={1}>
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
                  contactForm.name.trim() && !savingContact ? 'text-primary' : 'text-faint'
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
                leftIcon={<Phone size={15} color={c.faint} />}
              />
              <Input
                label={td.contactModal.emailLabel}
                placeholder={td.contactModal.emailPlaceholder}
                value={contactForm.email}
                onChangeText={v => setContactForm(f => ({ ...f, email: v }))}
                keyboardType="email-address"
                autoCapitalize="none"
                leftIcon={<Mail size={15} color={c.faint} />}
              />
              <View>
                <Text className="text-sm font-medium text-ink mb-1.5">
                  {td.contactModal.notesLabel}
                </Text>
                <View className="rounded-xl border border-border bg-card px-4 py-1">
                  <TextInput
                    multiline
                    numberOfLines={3}
                    placeholder={td.contactModal.notesPlaceholder}
                    placeholderTextColor={c.faint}
                    value={contactForm.notes}
                    onChangeText={v => setContactForm(f => ({ ...f, notes: v }))}
                    className="text-sm text-ink py-2"
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
                  <Text className="text-sm text-ink">{td.contactModal.primaryLabel}</Text>
                  <Star size={12} color={c.primary} fill="#4F46E5" />
                </View>
              </View>
              {/* Auto-CC this contact on invoices sent to the client (needs an email). */}
              <View className="flex-row items-center gap-3 mt-1">
                <Toggle
                  value={contactForm.cc_on_invoices}
                  onValueChange={v => setContactForm(f => ({ ...f, cc_on_invoices: v }))}
                  disabled={!contactForm.email.trim()}
                />
                <Text className={`text-sm ${contactForm.email.trim() ? 'text-ink' : 'text-faint'}`}>{td.contactModal.ccLabel}</Text>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </RNModal>
    </SafeAreaView>
  );
}
