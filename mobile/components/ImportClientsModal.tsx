import { useRef, useState } from 'react';
import { parseClientContactsCell } from '@amixos/shared/lib/clientShare';
import { logImportRun } from '@amixos/shared/lib/importRunners';
import { useElapsedTimer } from '@amixos/shared/lib/useElapsedTimer';
import { View, Text, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Contacts from 'expo-contacts';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle2, AlertCircle, Download, Users } from 'lucide-react-native';
import { Modal, Button, Select } from '@amixos/shared/ui';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { parseTimestamp } from '@amixos/shared/lib/dataImport';
import { isGoogleSyncConnected } from '@amixos/shared/lib/googleSync';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { RecentImports } from './RecentImports';
import {
  buildClientIndex, matchExistingClient, clientFieldPatch, mergeContacts,
  type DuplicateStrategy, type ExistingClientLite, type ContactLite,
} from '@amixos/shared/lib/clientImportMerge';

export interface ImportClientsModalProps {
  open: boolean;
  onClose: () => void;
  businessId: string;
  templates: { field_key: string; field_label: string }[];
  /** Business branches — adds a Branch column for multi-location businesses. */
  locations?: { id: string; name: string }[];
  onImportComplete: () => void;
}

type Step = 'upload' | 'map' | 'preview' | 'done';

const SKIP = '__skip__';

const CLIENT_FIELD_KEYS = [
  'first_name', 'last_name', 'company',
  'phone_cell', 'phone_office',
  'email_office', 'email_home',
  'address', 'city', 'state', 'zip_code', 'notes',
  // Optional source-system timestamps — blank keeps the now() defaults.
  'created_at', 'updated_at',
] as const;

// Lightweight US state normalizer — matches the most common spellings.
const STATE_MAP: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
};
const normalizeState = (raw: string): string => {
  const lower = raw.trim().toLowerCase();
  if (lower.length === 2) return raw.trim().toUpperCase();
  return STATE_MAP[lower] ?? raw.trim();
};

const sanitize = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFFĀ-￿]/g, '').trim();

export function ImportClientsModal({
  open,
  onClose,
  businessId,
  templates,
  locations,
  onImportComplete,
}: ImportClientsModalProps) {
  const supabase = createSupabaseClient();
  const { t: full, locale } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.clients;
  const tc = full.common;
  const syncBanner = useGoogleSyncBanner();

  // Branch column only for multi-location businesses. Not a `clients` column —
  // a matched name links the client to that one branch; blank/unknown leaves it
  // shared across every branch (the client list's default for unlinked rows).
  const multiLocation = (locations?.length ?? 0) > 1;
  const branchByName = new Map<string, string>();
  for (const l of locations ?? []) branchByName.set(l.name.trim().toLowerCase(), l.id);
  const branchLabel = locale === 'en' ? 'Branch' : 'Sucursal';

  // Only queue the Google-Contacts mirror if sync is actually connected
  // for this business — otherwise the user sees "Agregando a Google
  // Contacts" for work that will silently no-op server-side.
  const queueGoogleMirrorIfConnected = async (insertedIds: string[]) => {
    if (insertedIds.length === 0) return;
    const apiBaseUrl = getApiBaseUrl() || null;
    const jwt = (await getJwt().catch(() => null)) || null;
    const connected = await isGoogleSyncConnected(businessId, { apiBaseUrl, jwt });
    if (connected) syncBanner.runCreateBatch(insertedIds);
  };

  const [step, setStep] = useState<Step>('upload');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const { label: elapsedLabel } = useElapsedTimer(importing);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [colMap, setColMap] = useState<Record<string, string>>({});
  const [filename, setFilename] = useState('');
  // Import progress (per 50-row batch).
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    success: number;
    failedRows: { label: string; reason: string }[];
  }>({ success: 0, failedRows: [] });
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  // Rows whose client already exists. The importer inserted unconditionally, so
  // re-importing a file silently created a second copy of every client and
  // contact. It now asks once, before writing anything. Mirrors web.
  const [dupPrompt, setDupPrompt] = useState<{ count: number; total: number } | null>(null);
  const dupChoice = useRef<((s: DuplicateStrategy | null) => void) | null>(null);
  const askDuplicateStrategy = (count: number, total: number) =>
    new Promise<DuplicateStrategy | null>(resolve => {
      dupChoice.current = resolve;
      setDupPrompt({ count, total });
    });
  const answerDuplicates = (choice: DuplicateStrategy | null) => {
    setDupPrompt(null);
    dupChoice.current?.(choice);
    dupChoice.current = null;
  };

  const reset = () => {
    setStep('upload');
    setParsing(false);
    setImporting(false);
    setRows([]);
    setCsvHeaders([]);
    setColMap({});
    setFilename('');
    setError('');
    setResult({ success: 0, failedRows: [] });
    setShowErrorDetails(false);
  };

  // Display label for a failed row. Always leads with the CSV line
  // number (matching what the user sees in Excel/Numbers, where row 1
  // is the header and data starts at row 2) so they can find it.
  // Falls through several identifier sources so the user gets something
  // useful even when they didn't map name/phone/email columns.
  const rowLabel = (
    entry: Record<string, unknown>,
    originalRow: Record<string, string> | null,
    csvLine: number,
  ): string => {
    const name = [entry.first_name, entry.last_name].filter(Boolean).join(' ').trim();
    const candidate =
      name ||
      (entry.company as string | undefined) ||
      (entry.phone_cell as string | undefined) ||
      (entry.email_office as string | undefined);
    if (candidate) return `Fila ${csvLine} · ${candidate}`;
    if (originalRow) {
      const nonEmpty = Object.entries(originalRow)
        .filter(([, v]) => v && String(v).trim())
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${String(v).trim()}`);
      if (nonEmpty.length > 0) return `Fila ${csvLine} · ${nonEmpty.join(', ')}`;
    }
    return `Fila ${csvLine} (vacía)`;
  };

  // Batch-insert with per-row retry on failure. The fast path is a single
  // 50-row insert; if Supabase rejects the whole batch (e.g. a duplicate
  // or constraint violation makes the transaction roll back), we fall
  // back to one-by-one inserts on that slice so we can identify the
  // specific bad row and capture its error reason.
  const insertBatchWithRetry = async (
    batch: { entry: Record<string, unknown>; csvLine: number; originalRow: Record<string, string>; branchId?: string | null; contacts?: ReturnType<typeof parseClientContactsCell> }[],
  ): Promise<{
    success: number;
    insertedIds: string[];
    failedRows: { label: string; reason: string }[];
    merged?: number;
    skippedExisting?: number;
    /** User dismissed the duplicate prompt — nothing was written. */
    cancelled?: boolean;
  }> => {
    let success = 0;
    let mergedCount = 0;
    const insertedIds: string[] = [];
    const failedRows: { label: string; reason: string }[] = [];
    // Which rows already exist? Same rule as web and as the jobs importer's
    // client resolver, so all three agree on what "already exists" means.
    const { data: existingRows } = await supabase
      .from('clients')
      .select('id, first_name, last_name, company')
      .eq('business_id', businessId);
    const clientIndex = buildClientIndex((existingRows ?? []) as ExistingClientLite[]);
    const withMatch = batch.map(b => ({
      b,
      existingId: matchExistingClient(
        clientIndex,
        [b.entry.first_name, b.entry.last_name].filter(Boolean).join(' '),
        (b.entry.company as string | null) ?? null,
      ),
    }));
    const dupes = withMatch.filter(x => x.existingId);
    let strategy: DuplicateStrategy = 'skip';
    if (dupes.length) {
      const answer = await askDuplicateStrategy(dupes.length, batch.length);
      if (answer === null) return { success: 0, insertedIds: [], failedRows: [], cancelled: true };
      strategy = answer;
    }
    const toInsert = withMatch.filter(x => !x.existingId).map(x => x.b);
    // Branch links (matched branches only) written once all clients exist.
    const branchLinks: { business_id: string; client_id: string; location_id: string; is_primary: boolean }[] = [];
    // Contact-people rows (from the serialized export column).
    const contactRows: { business_id: string; client_id: string; name: string; role: string | null; phone: string | null; email: string | null }[] = [];
    const queueContacts = (clientId: string, list?: ReturnType<typeof parseClientContactsCell>) => {
      (list ?? []).forEach(ct => contactRows.push({ business_id: businessId, client_id: clientId, ...ct }));
    };
    // New clients only — existing ones are handled by the strategy below.
    for (let i = 0; i < toInsert.length; i += 50) {
      setProgress({ done: i, total: batch.length });
      const slice = toInsert.slice(i, i + 50);
      const { data, error: err } = await supabase
        .from('clients')
        .insert(slice.map(b => b.entry))
        .select('id');
      if (err) {
        for (const b of slice) {
          const { data: d2, error: e2 } = await supabase
            .from('clients')
            .insert(b.entry)
            .select('id')
            .single();
          if (e2) {
            failedRows.push({ label: rowLabel(b.entry, b.originalRow, b.csvLine), reason: e2.message });
          } else {
            success++;
            if (d2?.id) {
              insertedIds.push(d2.id);
              if (b.branchId) branchLinks.push({ business_id: businessId, client_id: d2.id, location_id: b.branchId, is_primary: true });
              queueContacts(d2.id, b.contacts);
            }
          }
        }
      } else {
        success += slice.length;
        // Rows come back in insertion order — zip ids to the slice to attach
        // each row's matched branch link.
        if (Array.isArray(data)) {
          data.forEach((r: { id: string }, j: number) => {
            insertedIds.push(r.id);
            const b = slice[j];
            if (b?.branchId) branchLinks.push({ business_id: businessId, client_id: r.id, location_id: b.branchId, is_primary: true });
            queueContacts(r.id, b?.contacts);
          });
        }
      }
    }
    // Existing clients: apply the chosen strategy. 'skip' writes nothing, which
    // is why it is the safe default and what cancelling falls back to.
    if (strategy !== 'skip') {
      for (const { b, existingId } of dupes) {
        const id = existingId!;
        const existing = (existingRows ?? []).find((r: { id: string }) => r.id === id) ?? {};
        const patch = clientFieldPatch(existing as Record<string, unknown>, b.entry, strategy);
        if (Object.keys(patch).length) await supabase.from('clients').update(patch).eq('id', id);
        if (b.contacts?.length) {
          const { data: have } = await supabase
            .from('client_contacts').select('id, name, email').eq('client_id', id);
          const plan = mergeContacts((have ?? []) as ContactLite[], b.contacts, strategy);
          if (strategy === 'replace' && (have ?? []).length) {
            await supabase.from('client_contacts').delete().eq('client_id', id);
          }
          if (plan.toInsert.length) {
            await supabase.from('client_contacts')
              .insert(plan.toInsert.map(ct => ({ business_id: businessId, client_id: id, ...ct })));
          }
        }
        mergedCount++;
      }
    }

    // Best-effort — a link failure doesn't undo imported clients (they just
    // stay shared across branches).
    for (let i = 0; i < branchLinks.length; i += 200) {
      await supabase.from('client_locations').insert(branchLinks.slice(i, i + 200));
    }
    for (let i = 0; i < contactRows.length; i += 200) {
      await supabase.from('client_contacts').insert(contactRows.slice(i, i + 200));
    }
    return { success, insertedIds, failedRows, merged: mergedCount, skippedExisting: strategy === 'skip' ? dupes.length : 0 };
  };

  // Build a sample CSV (headers + one example row) and share it via the
  // OS share sheet so the user can save it to Files / email / etc. and use
  // it as a template. Same column names as the web template — so a file
  // built on one platform imports cleanly on the other.
  const downloadTemplate = async () => {
    const headers = [
      ...CLIENT_FIELD_KEYS.map(k => FIELD_LABELS[k]),
      ...(multiLocation ? [branchLabel] : []),
    ].join(',');
    const example = [
      'Juan', 'Pérez', 'Pérez Construcción',
      '(555) 123-4567', '(555) 987-6543',
      'juan@perez.com', '',
      '123 Main St', 'Omaha', 'NE', '68102',
      'Cliente nuevo',
      '6/9/2026 8:00', '6/12/2026 4:45 PM',
      ...(multiLocation ? [locations?.[0]?.name ?? ''] : []),
    ].join(',');
    const csv = `${headers}\n${example}\n`;
    const path = `${FileSystem.cacheDirectory}${t.importModal.templateFilename}`;
    await FileSystem.writeAsStringAsync(path, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, {
        mimeType: 'text/csv',
        dialogTitle: t.importModal.templateBtn,
        UTI: 'public.comma-separated-values-text',
      });
    }
  };

  // Read phone contacts (with permission), let the user pick a subset, and
  // insert them as clients directly — no CSV mapping step required.
  const importFromContacts = async () => {
    setError('');
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('', t.importModal.contactsPermissionDenied);
      return;
    }
    // Present the system contact picker. On iOS this is a multi-select
    // overlay; on Android the equivalent flow uses the same API.
    const picked = await Contacts.presentContactPickerAsync();
    if (!picked) return;
    const contactsList = Array.isArray(picked) ? picked : [picked];

    setImporting(true);

    // For contacts-import the "CSV line" isn't meaningful — use the
    // picker position as a stand-in so failures still point at "the Nth
    // contact you picked".
    const batch = contactsList
      .map((c, idx) => {
        const firstName = c.firstName?.trim() || c.name?.trim() || '';
        const lastName = c.lastName?.trim() || '';
        if (!firstName && !lastName) return null;
        const phoneCell = c.phoneNumbers?.find(p => /mobile|cell|móvil/i.test(p.label ?? ''))?.number
          ?? c.phoneNumbers?.[0]?.number
          ?? null;
        const phoneOffice = c.phoneNumbers?.find(p => /work|office|trabajo|oficina/i.test(p.label ?? ''))?.number
          ?? null;
        const emailOffice = c.emails?.find(e => /work|office|trabajo|oficina/i.test(e.label ?? ''))?.email
          ?? c.emails?.[0]?.email
          ?? null;
        const emailHome = c.emails?.find(e => /home|personal|casa/i.test(e.label ?? ''))?.email ?? null;
        const addr = c.addresses?.[0];
        const entry: Record<string, unknown> = {
          business_id: businessId,
          first_name: firstName,
          last_name: lastName,
          company: c.company?.trim() || null,
          phone_cell: phoneCell,
          phone_office: phoneOffice !== phoneCell ? phoneOffice : null,
          email_office: emailOffice,
          email_home: emailHome !== emailOffice ? emailHome : null,
          address: addr?.street ?? null,
          city: addr?.city ?? null,
          state: addr?.region ? normalizeState(addr.region) : null,
          zip_code: addr?.postalCode ?? null,
        };
        return { entry, csvLine: idx + 1, originalRow: {} as Record<string, string> };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const {
      success,
      insertedIds: batchInsertedIds,
      failedRows,
      cancelled,
    } = await insertBatchWithRetry(batch);

    // Dismissed the duplicate prompt → nothing was written. Return to the
    // preview rather than showing a "done" screen for an import that did not
    // happen.
    if (cancelled) {
      setImporting(false);
      setProgress(null);
      return;
    }

    // Hand off to the banner provider — it owns throttling, persistence,
    // and auto-resume if the app is killed mid-batch.
    await queueGoogleMirrorIfConnected(batchInsertedIds);

    setResult({ success, failedRows });
    setImporting(false);
    setStep('done');
    onImportComplete();
  };

  const close = () => {
    reset();
    onClose();
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
    notes: t.fields.notes,
    created_at: t.importModal.colAdded,
    updated_at: t.importModal.colEdited,
  };

  // Behavior notes for non-obvious columns, shown under the mapping select.
  const FIELD_HINTS: Record<string, string> = {
    first_name: 'Cada fila necesita nombre, apellido o empresa.',
    created_at: 'Vacío = fecha/hora actual.',
    updated_at: 'Vacío = fecha/hora actual.',
  };

  const allImportFields = [
    ...CLIENT_FIELD_KEYS.map(k => ({ key: k, label: FIELD_LABELS[k], isCustom: false, hint: FIELD_HINTS[k] as string | undefined })),
    ...(multiLocation
      ? [{ key: 'branch', label: branchLabel, isCustom: false, hint: (locale === 'en' ? 'Blank = visible in all branches.' : 'Vacío = visible en todas las sucursales.') as string | undefined }]
      : []),
    // Serialized contact-people column written by "Share CSV" on a client —
    // makes moving a client between Amixos businesses a clean round trip.
    { key: 'contact_people', label: t.detail.contactPeople, isCustom: false, hint: (locale === 'en' ? 'From another Amixos export — recreated as contact people.' : 'De otra exportación de Amixos — se recrean como personas de contacto.') as string | undefined },
    ...templates.map(tpl => ({
      key: `custom:${tpl.field_key}`,
      label: tpl.field_label,
      isCustom: true,
      hint: undefined as string | undefined,
    })),
  ];

  const autoMapColumns = (headers: string[]): Record<string, string> => {
    const auto: Record<string, string> = {};
    // Lowercase, strip diacritics (NFD decomposes "ó" → "o" + combining
    // accent, which we then drop), then keep only letters/digits. Lets
    // "Código postal" match "Codigo postal", "phone-1" match "phone1", etc.
    const norm = (s: string) =>
      s.toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '');
    allImportFields.forEach(field => {
      const fNorm = norm(field.label);
      const fKey = norm(field.key.replace('custom:', ''));
      const match = headers.find(h => {
        const hNorm = norm(h);
        return (
          hNorm === fKey ||
          hNorm === fNorm ||
          hNorm.includes(fKey) ||
          fKey.includes(hNorm)
        );
      });
      if (match) auto[field.key] = match;
    });
    return auto;
  };

  const pickFile = async () => {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      setFilename(file.name);
      setParsing(true);

      // Read the CSV via a temp copy + Base64 decode. Background on each
      // workaround:
      //   1. Copy DocumentPicker's sandboxed cache file into our app's
      //      documentDirectory — direct reads from the picker cache fail
      //      on iOS simulator.
      //   2. Read with EncodingType.Base64 — UTF8 reads sometimes throw on
      //      iOS even when the file is right there ("readAsStringAsync
      //      has failed"). Base64 just hands us raw bytes which always
      //      works; we decode to text in JS.
      const docDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!docDir) {
        throw new Error('No writable directory available');
      }
      const tempUri = `${docDir}import_${Date.now()}.csv`;
      await FileSystem.copyAsync({ from: file.uri, to: tempUri });
      let csv: string;
      try {
        const b64 = await FileSystem.readAsStringAsync(tempUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        // atob gives a "binary string" where each char's code IS the raw
        // byte value (0–255). Try UTF-8 first; fall back to Latin-1.
        // Most CSVs are one of these two encodings — Excel on Mac/Windows
        // defaults to Windows-1252, "Save as UTF-8 CSV" gives UTF-8.
        const binary = atob(b64);
        try {
          // eslint-disable-next-line deprecation/deprecation
          csv = decodeURIComponent(escape(binary));
        } catch {
          // Bytes aren't valid UTF-8 → treat as Latin-1, where each
          // byte already maps 1:1 to its codepoint.
          csv = binary;
        }
        // Strip UTF-8 BOM if present — Excel/Numbers sometimes adds one,
        // which would otherwise show up as an invisible char prefixing
        // the first column header.
        if (csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1);
      } finally {
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
      }

      const parsed = Papa.parse<Record<string, string>>(csv, {
        header: true,
        skipEmptyLines: 'greedy',
        transform: (v: string) => sanitize(v),
        transformHeader: (h: string) => sanitize(h),
      });

      const headers = parsed.meta.fields ?? [];
      if (headers.length === 0 || parsed.data.length === 0) {
        setError('No se encontraron filas. Verifica que el CSV tenga encabezados.');
        setParsing(false);
        return;
      }

      setRows(parsed.data.filter((r: Record<string, string>) => Object.values(r).some(v => v && String(v).trim() !== '')));
      setCsvHeaders(headers);
      setColMap(autoMapColumns(headers));
      setParsing(false);
      setStep('map');
    } catch (err) {
      console.error('Import pickFile error:', err);
      setError('Error leyendo el archivo. Verifica que sea un CSV válido.');
      setParsing(false);
    }
  };

  const runImport = async () => {
    setImporting(true);
    const batch: { entry: Record<string, unknown>; csvLine: number; originalRow: Record<string, string>; branchId?: string | null; contacts?: ReturnType<typeof parseClientContactsCell> }[] = [];
    const failedRows: { label: string; reason: string }[] = [];
    const unknownBranches = new Set<string>();

    rows.forEach((row, idx) => {
      // CSV line: header is line 1, data starts at line 2.
      const csvLine = idx + 2;
      const entry: Record<string, unknown> = { business_id: businessId };
      const customFields: Record<string, string> = {};

      CLIENT_FIELD_KEYS.forEach(field => {
        const col = colMap[field];
        if (col && row[col] !== undefined) {
          let val: string | null = row[col].trim() || null;
          if (field === 'state' && val) val = normalizeState(val);
          // Timestamps must land as valid ISO or not at all — a raw cell that
          // Postgres can't parse would fail the whole row.
          if (field === 'created_at' || field === 'updated_at') {
            const ts = parseTimestamp(val);
            if (ts) entry[field] = ts;
            return;
          }
          entry[field] = val;
        }
      });

      templates.forEach(tpl => {
        const col = colMap[`custom:${tpl.field_key}`];
        if (col && row[col] !== undefined) {
          const val = row[col].trim();
          if (val) customFields[tpl.field_key] = val;
        }
      });

      if (Object.keys(customFields).length > 0) {
        entry.custom_fields = customFields;
      }

      // Skip rows that have nothing identifiable — track which CSV line
      // it was so the user can open the file and check that row.
      if (!entry.first_name && !entry.last_name && !entry.company) {
        failedRows.push({
          label: rowLabel(entry, row, csvLine),
          reason: 'Sin nombre, apellido o empresa',
        });
        return;
      }
      if (!entry.first_name) entry.first_name = entry.last_name || entry.company || '';
      if (!entry.last_name) entry.last_name = '';
      // Resolve the branch cell (multi-location only). Matched → that branch;
      // blank stays shared; non-empty unmatched is reported (client still imports).
      let branchId: string | null = null;
      if (multiLocation) {
        const bCol = colMap['branch'];
        const branchRaw = bCol && row[bCol] ? row[bCol].trim() : '';
        if (branchRaw) {
          branchId = branchByName.get(branchRaw.toLowerCase()) ?? null;
          if (!branchId) unknownBranches.add(branchRaw);
        }
      }
      const cpCol = colMap['contact_people'];
      const cpRaw = cpCol && row[cpCol] ? row[cpCol].trim() : '';
      batch.push({ entry, csvLine, originalRow: row, branchId, contacts: cpRaw ? parseClientContactsCell(cpRaw) : undefined });
    });

    const { success, insertedIds, failedRows: dbFailures, cancelled } =
      await insertBatchWithRetry(batch);
    // Dismissed the duplicate prompt → nothing was written, so do not fall
    // through and report a completed import.
    if (cancelled) {
      setImporting(false);
      setProgress(null);
      return;
    }
    failedRows.push(...dbFailures);
    if (unknownBranches.size) {
      const shown = Array.from(unknownBranches).slice(0, 10).join(', ');
      failedRows.push({
        label: locale === 'en' ? 'Unrecognized branches' : 'Sucursales no reconocidas',
        reason: locale === 'en'
          ? `${shown} — clients imported as shared (all branches).`
          : `${shown} — clientes importados como compartidos (todas las sucursales).`,
      });
    }

    // Hand off to the banner provider — it owns throttling, persistence,
    // and auto-resume if the app is killed mid-batch.
    await queueGoogleMirrorIfConnected(insertedIds);

    // Audit trail (migration 137).
    void logImportRun(supabase, businessId, 'clients', filename || null, { success, skipped: 0, failedRows });
    setResult({ success, failedRows });
    setImporting(false);
    setStep('done');
    onImportComplete();
  };

  const matchedCount = Object.keys(colMap).length;

  return (
    <Modal open={open} onClose={close} title={t.importBtn}>
      {step === 'upload' ? (
        <View className="gap-3">
          {/* CSV file picker — primary action */}
          <Pressable
            onPress={pickFile}
            disabled={parsing || importing}
            className="border-2 border-dashed border-border rounded-2xl py-6 items-center active:bg-surface"
          >
            {parsing ? (
              <>
                <ActivityIndicator color={c.primary} />
                <Text className="text-sm text-muted mt-2">Leyendo archivo…</Text>
              </>
            ) : (
              <>
                <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center mb-2">
                  <Upload size={20} color={c.primary} />
                </View>
                <Text className="text-sm font-semibold text-ink">
                  {t.importModal.pickFileBtn}
                </Text>
                <Text className="text-xs text-muted mt-0.5">
                  {t.importModal.pickFileHint}
                </Text>
              </>
            )}
          </Pressable>

          {/* Contacts picker — secondary action */}
          <Pressable
            onPress={importFromContacts}
            disabled={importing}
            className="flex-row items-center gap-3 rounded-2xl border border-border px-4 py-3.5 active:bg-surface"
          >
            <View className="w-9 h-9 rounded-xl bg-emerald-500/10 items-center justify-center">
              {importing ? (
                <ActivityIndicator size="small" color={c.success} />
              ) : (
                <Users size={18} color={c.success} />
              )}
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-ink">
                {t.importModal.importContactsBtn}
              </Text>
              <Text className="text-xs text-muted mt-0.5">
                {t.importModal.importContactsHint}
              </Text>
            </View>
          </Pressable>

          {/* Template download — tertiary action */}
          <Pressable
            onPress={downloadTemplate}
            className="flex-row items-center gap-2 self-start px-2 py-2 active:opacity-70"
          >
            <Download size={14} color={c.primary} />
            <Text className="text-xs font-semibold text-primary">
              {t.importModal.templateBtn}
            </Text>
          </Pressable>

          {error ? (
            <View className="bg-red-500/10 border border-red-100 rounded-xl px-4 py-3 flex-row items-start gap-2">
              <AlertCircle size={16} color={c.danger} />
              <Text className="text-red-600 text-sm flex-1">{error}</Text>
            </View>
          ) : null}

          <RecentImports businessId={businessId} locale={locale} />
        </View>
      ) : null}

      {step === 'map' ? (
        <View className="gap-4">
          <View className="bg-surface rounded-xl px-4 py-3 flex-row items-center gap-3">
            <FileText size={18} color={c.muted} />
            <View className="flex-1">
              <Text className="text-sm font-medium text-ink" numberOfLines={1}>
                {filename}
              </Text>
              <Text className="text-xs text-muted mt-0.5">
                {rows.length} fila{rows.length !== 1 ? 's' : ''} · {matchedCount}{' '}
                de {allImportFields.length} columna
                {allImportFields.length !== 1 ? 's' : ''} mapeada
                {matchedCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          <Text className="text-xs text-muted leading-5">
            Asigna cada campo de cliente a una columna del CSV. Los campos no
            mapeados se omiten en la importación.
          </Text>

          <View className="gap-3">
            {allImportFields.map(f => {
              const options = [
                { value: SKIP, label: '— Omitir —' },
                ...csvHeaders.map(h => ({ value: h, label: h })),
              ];
              return (
                <View key={f.key}>
                <Select
                  label={f.label}
                  value={colMap[f.key] ?? SKIP}
                  highlight={!colMap[f.key]}
                  onValueChange={v => {
                    setColMap(prev => {
                      const next = { ...prev };
                      if (v === SKIP) delete next[f.key];
                      else next[f.key] = v;
                      return next;
                    });
                  }}
                  options={options}
                />
                {f.hint ? <Text className="text-[10px] leading-4 text-faint mt-1">{f.hint}</Text> : null}
                </View>
              );
            })}
          </View>

          <View className="flex-row items-center justify-between pt-2">
            <Pressable
              onPress={close}
              className="px-3 py-2 rounded-lg active:bg-border-soft"
            >
              <Text className="text-sm font-semibold text-ink">Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={() => setStep('preview')}
              disabled={matchedCount === 0}
              className={`px-4 py-2 rounded-lg ${matchedCount === 0 ? 'bg-primary/40' : 'bg-primary active:opacity-80'}`}
            >
              <Text className="text-sm font-semibold text-white">Continuar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {step === 'preview' ? (
        <View className="gap-4">
          <View className="bg-surface rounded-xl px-4 py-3 flex-row items-center gap-3">
            <FileText size={18} color={c.muted} />
            <View className="flex-1">
              <Text className="text-sm font-medium text-ink" numberOfLines={1}>
                {filename}
              </Text>
              <Text className="text-xs text-muted mt-0.5">
                {rows.length} fila{rows.length !== 1 ? 's' : ''} · {matchedCount}{' '}
                columna{matchedCount !== 1 ? 's' : ''} mapeada
                {matchedCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          {/* First 5 rows of mapped data — horizontal scroll keeps every
              column visible on a narrow phone screen. Mirrors the table the
              web preview shows. */}
          <View>
            <Text className="text-xs font-semibold text-faint uppercase mb-2">
              Vista previa · primeras {Math.min(5, rows.length)} de {rows.length}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              className="border border-border-soft rounded-xl bg-card"
            >
              <View>
                {/* Header row */}
                <View className="flex-row bg-surface border-b border-border-soft">
                  {allImportFields.filter(f => colMap[f.key]).map(f => (
                    <View key={f.key} style={{ width: 140 }} className="px-3 py-2">
                      <Text className="text-xs font-semibold text-muted" numberOfLines={1}>
                        {f.label}
                      </Text>
                    </View>
                  ))}
                </View>
                {/* Data rows */}
                {rows.slice(0, 5).map((row, ri) => (
                  <View
                    key={ri}
                    className={`flex-row ${ri < Math.min(5, rows.length) - 1 ? 'border-b border-border-soft' : ''}`}
                  >
                    {allImportFields.filter(f => colMap[f.key]).map(f => {
                      const val = row[colMap[f.key]];
                      return (
                        <View key={f.key} style={{ width: 140 }} className="px-3 py-2">
                          <Text
                            className={`text-xs ${val ? 'text-ink' : 'text-faint'}`}
                            numberOfLines={1}
                          >
                            {val || '—'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>

          <Text className="text-xs text-muted leading-5">
            Las filas sin nombre, apellido o empresa serán omitidas.
          </Text>

          <View className="flex-row items-center justify-between pt-2">
            <Pressable
              onPress={close}
              className="px-3 py-2 rounded-lg active:bg-border-soft"
            >
              <Text className="text-sm font-semibold text-ink">Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={runImport}
              disabled={importing}
              className={`px-4 py-2 rounded-lg ${importing ? 'bg-primary/40' : 'bg-primary active:opacity-80'}`}
            >
              <Text className="text-sm font-semibold text-white">
                {importing ? `Importando…${progress ? ` ${progress.done}/${progress.total} · ${elapsedLabel}` : ''}` : `Importar ${rows.length}`}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {step === 'done' ? (
        <View className="gap-4 items-center py-4">
          <View className="w-16 h-16 rounded-full bg-green-500/10 items-center justify-center">
            <CheckCircle2 size={32} color={c.success} />
          </View>
          <Text className="text-lg font-semibold text-ink">¡Importación completa!</Text>
          <Text className="text-xs text-faint -mt-2">Tiempo: {elapsedLabel}</Text>
          <View className="bg-surface rounded-xl px-6 py-4 w-full">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-sm text-muted">Importados</Text>
              <Text className="text-base font-bold text-green-600">{result.success}</Text>
            </View>
            {result.failedRows.length > 0 ? (
              <View className="flex-row justify-between items-center">
                <Text className="text-sm text-muted">Errores</Text>
                <Text className="text-base font-bold text-red-600">{result.failedRows.length}</Text>
              </View>
            ) : null}
          </View>

          {/* Per-row failure breakdown — collapsed by default. Lets the
              user see which contacts didn't import and why (duplicate,
              missing field, validation error from the DB, etc.). */}
          {result.failedRows.length > 0 ? (
            <View className="w-full">
              <Pressable
                onPress={() => setShowErrorDetails(v => !v)}
                className="flex-row items-center justify-center gap-1 py-2"
              >
                <Text className="text-sm font-medium text-primary">
                  {showErrorDetails ? 'Ocultar detalles' : 'Ver detalles'}
                </Text>
                <Text className="text-sm text-primary">
                  {showErrorDetails ? '▴' : '▾'}
                </Text>
              </Pressable>
              {showErrorDetails ? (
                <View className="bg-red-500/10 border border-red-100 rounded-xl overflow-hidden">
                  {result.failedRows.slice(0, 20).map((f, i) => (
                    <View
                      key={i}
                      className={`px-4 py-2.5 ${
                        i < Math.min(20, result.failedRows.length) - 1
                          ? 'border-b border-red-100/60'
                          : ''
                      }`}
                    >
                      <Text className="text-sm font-medium text-ink" numberOfLines={1}>
                        {f.label}
                      </Text>
                      <Text className="text-xs text-red-700 mt-0.5" numberOfLines={2}>
                        {f.reason}
                      </Text>
                    </View>
                  ))}
                  {result.failedRows.length > 20 ? (
                    <View className="px-4 py-2.5 bg-red-100/40">
                      <Text className="text-xs text-muted text-center">
                        + {result.failedRows.length - 20} más
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          <Button onPress={close} fullWidth>
            <Text className="text-white font-semibold">Cerrar</Text>
          </Button>
        </View>
      ) : null}

      {/* Duplicate prompt. An in-modal absolute overlay, NOT a second RNModal —
          iOS silently refuses to present one while another is visible, so the
          import would just appear to hang (see CLAUDE.md). runImport awaits the
          answer, so nothing is written until a choice is made. */}
      {dupPrompt ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', padding: 16 }}>
          <Pressable
            onPress={() => answerDuplicates(null)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
          />
          <View className="bg-card rounded-2xl p-5">
            <Text className="text-base font-bold text-ink">{t.dupTitle}</Text>
            <Text className="text-sm text-muted mt-1">
              {t.dupBody.replace('{{count}}', String(dupPrompt.count)).replace('{{total}}', String(dupPrompt.total))}
            </Text>
            <View className="gap-2 mt-4">
              {([
                ['merge', t.dupMerge, t.dupMergeHint],
                ['replace', t.dupReplace, t.dupReplaceHint],
                ['skip', t.dupSkip, t.dupSkipHint],
              ] as const).map(([key, label, hint]) => (
                <Pressable
                  key={key}
                  onPress={() => answerDuplicates(key)}
                  className="px-4 py-3 rounded-xl border border-border active:bg-surface"
                >
                  <Text className="text-sm font-semibold text-ink">{label}</Text>
                  <Text className="text-xs text-faint mt-0.5">{hint}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => answerDuplicates(null)} className="mt-3 py-3 items-center rounded-xl active:bg-surface">
              <Text className="text-sm font-semibold text-muted">{tc.buttons.cancel}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}
