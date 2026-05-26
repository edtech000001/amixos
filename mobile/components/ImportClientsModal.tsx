import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Contacts from 'expo-contacts';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle2, AlertCircle, Download, Users } from 'lucide-react-native';
import { Modal, Button, Select } from '@amixos/shared/ui';
import { triggerGoogleSync } from '@amixos/shared/lib/googleSync';
import { useLang } from '@/lib/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';

export interface ImportClientsModalProps {
  open: boolean;
  onClose: () => void;
  businessId: string;
  templates: { field_key: string; field_label: string }[];
  onImportComplete: () => void;
}

type Step = 'upload' | 'map' | 'preview' | 'done';

const SKIP = '__skip__';

const CLIENT_FIELD_KEYS = [
  'first_name', 'last_name', 'company',
  'phone_cell', 'phone_office',
  'email_office', 'email_home',
  'address', 'city', 'state', 'zip_code', 'notes',
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
  onImportComplete,
}: ImportClientsModalProps) {
  const supabase = createSupabaseClient();
  const { t: full } = useLang();
  const t = full.dashboard.clients;

  const [step, setStep] = useState<Step>('upload');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [colMap, setColMap] = useState<Record<string, string>>({});
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState({ success: 0, errors: 0 });

  const reset = () => {
    setStep('upload');
    setParsing(false);
    setImporting(false);
    setRows([]);
    setCsvHeaders([]);
    setColMap({});
    setFilename('');
    setError('');
    setResult({ success: 0, errors: 0 });
  };

  // Build a sample CSV (headers + one example row) and share it via the
  // OS share sheet so the user can save it to Files / email / etc. and use
  // it as a template. Same column names as the web template — so a file
  // built on one platform imports cleanly on the other.
  const downloadTemplate = async () => {
    const headers = CLIENT_FIELD_KEYS.map(k => FIELD_LABELS[k]).join(',');
    const example = [
      'Juan', 'Pérez', 'Pérez Construcción',
      '(555) 123-4567', '(555) 987-6543',
      'juan@perez.com', '',
      '123 Main St', 'Omaha', 'NE', '68102',
      'Cliente nuevo',
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
    let success = 0;
    let errors = 0;
    const insertedIds: string[] = [];

    const batch = contactsList
      .map(c => {
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
        return {
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
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    for (let i = 0; i < batch.length; i += 50) {
      const slice = batch.slice(i, i + 50);
      const { data, error: err } = await supabase.from('clients').insert(slice).select('id');
      if (err) errors += slice.length;
      else {
        success += slice.length;
        if (Array.isArray(data)) insertedIds.push(...data.map((r: { id: string }) => r.id));
      }
    }

    // Fire-and-forget Google sync mirror of the CSV path.
    if (insertedIds.length > 0) {
      void (async () => {
        const apiBaseUrl = getApiBaseUrl();
        const jwt = await getJwt();
        if (apiBaseUrl && jwt) {
          for (const id of insertedIds) {
            triggerGoogleSync('create', id, { apiBaseUrl, jwt });
          }
        }
      })();
    }

    setResult({ success, errors });
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
  };

  const allImportFields = [
    ...CLIENT_FIELD_KEYS.map(k => ({ key: k, label: FIELD_LABELS[k], isCustom: false })),
    ...templates.map(tpl => ({
      key: `custom:${tpl.field_key}`,
      label: tpl.field_label,
      isCustom: true,
    })),
  ];

  const autoMapColumns = (headers: string[]): Record<string, string> => {
    const auto: Record<string, string> = {};
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
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

      // Read the CSV via a temp copy in our own documents directory.
      // DocumentPicker drops files into Library/Caches/DocumentPicker on
      // iOS — the URI it returns is sometimes inaccessible to JS APIs
      // (FileSystem.readAsStringAsync throws on simulator; fetch()
      // returns a malformed Response). Copying to FileSystem.document
      // Directory first lands the file in a path our app definitely
      // owns and can read.
      const docDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!docDir) {
        throw new Error('No writable directory available');
      }
      // Unique temp name so concurrent imports (unlikely but safe) don't
      // clobber each other.
      const tempUri = `${docDir}import_${Date.now()}.csv`;
      await FileSystem.copyAsync({ from: file.uri, to: tempUri });
      let csv: string;
      try {
        csv = await FileSystem.readAsStringAsync(tempUri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } finally {
        // Clean up regardless of read success.
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
      }

      const parsed = Papa.parse<Record<string, string>>(csv, {
        header: true,
        skipEmptyLines: true,
        transform: (v: string) => sanitize(v),
        transformHeader: (h: string) => sanitize(h),
      });

      const headers = parsed.meta.fields ?? [];
      if (headers.length === 0 || parsed.data.length === 0) {
        setError('No se encontraron filas. Verifica que el CSV tenga encabezados.');
        setParsing(false);
        return;
      }

      setRows(parsed.data);
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
    let success = 0;
    let errors = 0;
    const batch: Record<string, unknown>[] = [];

    for (const row of rows) {
      const entry: Record<string, unknown> = { business_id: businessId };
      const customFields: Record<string, string> = {};

      CLIENT_FIELD_KEYS.forEach(field => {
        const col = colMap[field];
        if (col && row[col] !== undefined) {
          let val: string | null = row[col].trim() || null;
          if (field === 'state' && val) val = normalizeState(val);
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

      // Skip rows that have nothing identifiable.
      if (!entry.first_name && !entry.last_name && !entry.company) {
        errors++;
        continue;
      }
      if (!entry.first_name) entry.first_name = entry.last_name || entry.company || '';
      if (!entry.last_name) entry.last_name = '';
      batch.push(entry);
    }

    const insertedIds: string[] = [];
    for (let i = 0; i < batch.length; i += 50) {
      const slice = batch.slice(i, i + 50);
      const { data, error: err } = await supabase
        .from('clients')
        .insert(slice)
        .select('id');
      if (err) {
        errors += slice.length;
      } else {
        success += slice.length;
        if (Array.isArray(data)) insertedIds.push(...data.map((r: { id: string }) => r.id));
      }
    }

    // Fire-and-forget Google sync for each newly imported client.
    if (insertedIds.length > 0) {
      void (async () => {
        const apiBaseUrl = getApiBaseUrl();
        const jwt = await getJwt();
        if (apiBaseUrl && jwt) {
          for (const id of insertedIds) {
            triggerGoogleSync('create', id, { apiBaseUrl, jwt });
          }
        }
      })();
    }

    setResult({ success, errors });
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
            className="border-2 border-dashed border-gray-200 rounded-2xl py-6 items-center active:bg-gray-50"
          >
            {parsing ? (
              <>
                <ActivityIndicator color="#4F46E5" />
                <Text className="text-sm text-gray-500 mt-2">Leyendo archivo…</Text>
              </>
            ) : (
              <>
                <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center mb-2">
                  <Upload size={20} color="#4F46E5" />
                </View>
                <Text className="text-sm font-semibold text-gray-900">
                  {t.importModal.pickFileBtn}
                </Text>
                <Text className="text-xs text-gray-500 mt-0.5">
                  {t.importModal.pickFileHint}
                </Text>
              </>
            )}
          </Pressable>

          {/* Contacts picker — secondary action */}
          <Pressable
            onPress={importFromContacts}
            disabled={importing}
            className="flex-row items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3.5 active:bg-gray-50"
          >
            <View className="w-9 h-9 rounded-xl bg-emerald-50 items-center justify-center">
              {importing ? (
                <ActivityIndicator size="small" color="#059669" />
              ) : (
                <Users size={18} color="#059669" />
              )}
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900">
                {t.importModal.importContactsBtn}
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                {t.importModal.importContactsHint}
              </Text>
            </View>
          </Pressable>

          {/* Template download — tertiary action */}
          <Pressable
            onPress={downloadTemplate}
            className="flex-row items-center gap-2 self-start px-2 py-2 active:opacity-70"
          >
            <Download size={14} color="#4F46E5" />
            <Text className="text-xs font-semibold text-primary">
              {t.importModal.templateBtn}
            </Text>
          </Pressable>

          {error ? (
            <View className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex-row items-start gap-2">
              <AlertCircle size={16} color="#EF4444" />
              <Text className="text-red-600 text-sm flex-1">{error}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {step === 'map' ? (
        <View className="gap-4">
          <View className="bg-gray-50 rounded-xl px-4 py-3 flex-row items-center gap-3">
            <FileText size={18} color="#6B7280" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
                {filename}
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                {rows.length} fila{rows.length !== 1 ? 's' : ''} · {matchedCount}{' '}
                de {allImportFields.length} mapeada
                {matchedCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          <Text className="text-xs text-gray-500 leading-5">
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
                <Select
                  key={f.key}
                  label={f.label}
                  value={colMap[f.key] ?? SKIP}
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
              );
            })}
          </View>

          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setStep('upload')}
              className="flex-1 py-3 rounded-xl border border-gray-200 items-center active:bg-gray-50"
            >
              <Text className="text-sm font-semibold text-gray-700">Atrás</Text>
            </Pressable>
            <View className="flex-1">
              <Button onPress={() => setStep('preview')} fullWidth disabled={matchedCount === 0}>
                <Text className="text-white font-semibold">Continuar</Text>
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {step === 'preview' ? (
        <View className="gap-4">
          <View className="bg-gray-50 rounded-xl px-4 py-3 flex-row items-center gap-3">
            <FileText size={18} color="#6B7280" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
                {filename}
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                {rows.length} fila{rows.length !== 1 ? 's' : ''} · {matchedCount}{' '}
                campo{matchedCount !== 1 ? 's' : ''} mapeado
                {matchedCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          <View>
            <Text className="text-xs font-semibold text-gray-400 uppercase mb-2">
              Mapeo final
            </Text>
            <View className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              {allImportFields
                .filter(f => colMap[f.key])
                .map((f, i, arr) => (
                  <View
                    key={f.key}
                    className={`flex-row items-center justify-between px-4 py-2.5 ${
                      i < arr.length - 1 ? 'border-b border-gray-50' : ''
                    }`}
                  >
                    <Text className="text-sm text-gray-900 flex-1" numberOfLines={1}>
                      {f.label}
                    </Text>
                    <Text className="text-xs text-gray-500 ml-2" numberOfLines={1}>
                      ← {colMap[f.key]}
                    </Text>
                  </View>
                ))}
            </View>
          </View>

          <Text className="text-xs text-gray-500 leading-5">
            Las filas sin nombre, apellido o empresa serán omitidas.
          </Text>

          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setStep('map')}
              className="flex-1 py-3 rounded-xl border border-gray-200 items-center active:bg-gray-50"
            >
              <Text className="text-sm font-semibold text-gray-700">Atrás</Text>
            </Pressable>
            <View className="flex-1">
              <Button onPress={runImport} loading={importing} fullWidth>
                <Text className="text-white font-semibold">
                  Importar {rows.length}
                </Text>
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {step === 'done' ? (
        <View className="gap-4 items-center py-4">
          <View className="w-16 h-16 rounded-full bg-green-50 items-center justify-center">
            <CheckCircle2 size={32} color="#10B981" />
          </View>
          <Text className="text-lg font-semibold text-gray-900">¡Importación completa!</Text>
          <View className="bg-gray-50 rounded-xl px-6 py-4 w-full">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-sm text-gray-600">Importados</Text>
              <Text className="text-base font-bold text-green-600">{result.success}</Text>
            </View>
            {result.errors > 0 ? (
              <View className="flex-row justify-between items-center">
                <Text className="text-sm text-gray-600">Errores</Text>
                <Text className="text-base font-bold text-red-600">{result.errors}</Text>
              </View>
            ) : null}
          </View>
          <Button onPress={close} fullWidth>
            <Text className="text-white font-semibold">Cerrar</Text>
          </Button>
        </View>
      ) : null}
    </Modal>
  );
}
