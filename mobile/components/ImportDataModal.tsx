import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle2, AlertCircle, Download } from 'lucide-react-native';
import { Modal, Button, Select, Input } from '@amixos/shared/ui';
import {
  importFieldsFor,
  importModeUsesTemplates,
  autoMapHeaders,
  buildImportTemplateCsv,
  runImportFor,
  type ImportMode,
  type ImportResult,
  type ImportTemplateField,
} from '@amixos/shared/lib/importRunners';
import { useLang } from '@/lib/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';

// Mobile CSV import wizard for jobs / invoices / employees — the phone
// counterpart of web/src/components/dashboard/ImportModal.tsx (KEEP the two
// in sync). The field catalog + import logic are shared
// (shared/src/lib/importRunners.ts); this file is only the wizard UI plus the
// iOS-safe file reading. Unlike the web modal, it fetches its own
// custom-field templates / role renames so callers just pass a mode.

export interface ImportDataModalProps {
  open: boolean;
  mode: ImportMode;
  businessId: string;
  onClose: () => void;
  onDone?: () => void;
}

type Step = 'upload' | 'map' | 'preview' | 'done';

const SKIP = '__skip__';

const sanitize = (s: string) => s.replace(/[�﻿]/g, '').replace(/[^\x20-\x7E\xA0-\xFFĀ-￿]/g, '').trim();

export function ImportDataModal({ open, mode, businessId, onClose, onDone }: ImportDataModalProps) {
  const supabase = createSupabaseClient();
  const { user, business } = useApp();
  const { locale } = useLang();
  const en = locale === 'en';
  const tr = (esText: string, enText: string) => (en ? enText : esText);

  const [step, setStep] = useState<Step>('upload');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [colMap, setColMap] = useState<Record<string, string>>({});
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  // Upload-step column guide (accepted values per column), collapsed by default.
  const [guideOpen, setGuideOpen] = useState(false);
  const [result, setResult] = useState<ImportResult>({ success: 0, skipped: 0, failedRows: [], notes: [] });
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  // Fix-and-retry for a failed row: index into result.failedRows being edited,
  // its field values (keyed by field key), and the in-flight flag.
  const [fixingIndex, setFixingIndex] = useState<number | null>(null);
  const [fixValues, setFixValues] = useState<Record<string, string>>({});
  const [retrying, setRetrying] = useState(false);

  // Mode-specific config, fetched once per open: custom-field templates
  // (jobs/employees) + per-business role renames (employees).
  const [templates, setTemplates] = useState<ImportTemplateField[]>([]);
  const [accessRoles, setAccessRoles] = useState<{ key: string; name: string | null }[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (importModeUsesTemplates(mode)) {
        const table = mode === 'jobs' ? 'job_field_templates' : 'employee_field_templates';
        const { data } = await supabase
          .from(table)
          .select('field_key, field_label, field_type, field_options')
          .eq('business_id', businessId)
          .order('sort_order');
        if (!cancelled) setTemplates((data as ImportTemplateField[] | null) ?? []);
      } else {
        setTemplates([]);
      }
      if (mode === 'employees') {
        const { data } = await supabase
          .from('business_roles')
          .select('key, name')
          .eq('business_id', businessId);
        if (!cancelled) setAccessRoles((data as { key: string; name: string | null }[] | null) ?? []);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, businessId]);

  const useTemplates = importModeUsesTemplates(mode);
  // Materiales/Precios columns follow the form's visibility (Ajustes → Trabajos).
  const fieldOpts = { jobPricing: business?.job_item_types_enabled !== false };
  const allImportFields: { key: string; es: string; en: string; label: string; required?: boolean; isCustom?: boolean; hintEs?: string; hintEn?: string }[] = [
    ...importFieldsFor(mode, fieldOpts).map(f => ({ ...f, label: en ? f.en : f.es })),
    ...(useTemplates ? templates.map(t => {
      // Constrained custom fields surface their accepted values in the UI.
      const hint = t.field_type === 'select' && t.field_options?.length
        ? `${tr('Valores', 'Values')}: ${t.field_options.join(', ')}`
        : t.field_type === 'boolean'
          ? tr('Valores: sí/no (true/false)', 'Values: yes/no (true/false)')
          : undefined;
      return { key: `custom:${t.field_key}`, es: t.field_label, en: t.field_label, label: t.field_label, isCustom: true, hintEs: hint, hintEn: hint };
    }) : []),
  ];

  const noun = mode === 'jobs' ? tr('trabajos', 'jobs') : mode === 'employees' ? tr('empleados', 'employees') : tr('facturas', 'invoices');
  const title =
    mode === 'jobs' ? tr('Importar trabajos', 'Import jobs')
    : mode === 'employees' ? tr('Importar equipo', 'Import team')
    : tr('Importar facturas', 'Import invoices');
  const uploadHint =
    mode === 'jobs' ? tr('Sube un CSV con un renglón por proyecto. Incluye la columna Project ID para poder enlazar las facturas después.', 'Upload a CSV with one row per project. Include the Project ID column so invoices can link to them later.')
      + (fieldOpts.jobPricing ? tr(' Repite el mismo Project ID en varias filas para agregar líneas de materiales/precios al mismo trabajo.', ' Repeat the same Project ID on several rows to add line items to one job.') : '')
    : mode === 'employees' ? tr('Sube un CSV con un renglón por persona. Las personas se vinculan por nombre — usa los mismos nombres en tus trabajos y facturas.', 'Upload a CSV with one row per person. People are matched by name — use the same names across your jobs and invoices.')
    : tr('Sube un CSV con un renglón por línea de factura. Importa los trabajos PRIMERO — cada línea se enlaza al trabajo por su Project ID.', 'Upload a CSV with one row per invoice line. Import jobs FIRST — each line links to its job by Project ID.');

  const reset = () => {
    setStep('upload'); setParsing(false); setImporting(false);
    setRows([]); setCsvHeaders([]); setColMap({}); setFilename(''); setError('');
    setResult({ success: 0, skipped: 0, failedRows: [], notes: [] });
    setShowErrorDetails(false);
  };
  const close = () => { reset(); onClose(); };

  const pickFile = async () => {
    setError('');
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const file = picked.assets[0];
      setFilename(file.name);
      setParsing(true);

      // Read via temp copy + Base64 decode — same iOS workarounds as
      // ImportClientsModal (direct/UTF8 reads flake on iOS).
      const docDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!docDir) throw new Error('No writable directory available');
      const tempUri = `${docDir}import_${Date.now()}.csv`;
      await FileSystem.copyAsync({ from: file.uri, to: tempUri });
      let csv: string;
      try {
        const b64 = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });
        const binary = atob(b64);
        try {
          // eslint-disable-next-line deprecation/deprecation
          csv = decodeURIComponent(escape(binary)); // UTF-8
        } catch {
          csv = binary; // Latin-1 fallback
        }
        if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1); // strip BOM
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
        setError(tr('No se encontraron filas. Verifica que el CSV tenga encabezados.', 'No rows found. Check that the CSV has headers.'));
        setParsing(false);
        return;
      }
      setRows(parsed.data.filter((r: Record<string, string>) => Object.values(r).some(v => v && String(v).trim() !== '')));
      setCsvHeaders(headers);
      setColMap(autoMapHeaders(allImportFields, headers));
      setParsing(false);
      setStep('map');
    } catch (err) {
      console.error('ImportDataModal pickFile error:', err);
      setError(tr('Error leyendo el archivo. Verifica que sea un CSV válido.', 'Error reading the file. Check that it is a valid CSV.'));
      setParsing(false);
    }
  };

  const downloadTemplate = async () => {
    const { filename: name, csv } = buildImportTemplateCsv(mode, en ? 'en' : 'es', templates, fieldOpts);
    const path = `${FileSystem.cacheDirectory}${name}`;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, {
        mimeType: 'text/csv',
        dialogTitle: tr('Descargar plantilla', 'Download template'),
        UTI: 'public.comma-separated-values-text',
      });
    }
  };

  const buildCtx = (importRows: Record<string, string>[]) => ({
    supabase,
    businessId,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    locale: (en ? 'en' : 'es') as 'en' | 'es',
    rows: importRows,
    colMap,
    templates: useTemplates ? templates : [],
    accessRoles,
    invoiceTemplate: business?.invoice_template,
  });

  const runImport = async () => {
    setImporting(true);
    try {
      const res = await runImportFor(mode, buildCtx(rows));
      setResult(res);
      setStep('done');
      onDone?.();
    } catch (e) {
      setResult({
        success: 0,
        skipped: 0,
        failedRows: [{ label: 'Error', reason: e instanceof Error ? e.message : String(e) }],
        notes: [],
      });
      setStep('done');
    } finally {
      setImporting(false);
    }
  };

  const mappedFields = allImportFields.filter(f => colMap[f.key]);

  const openFix = (i: number) => {
    const fr = result.failedRows[i];
    if (fr.rowIndex == null) return;
    const row = rows[fr.rowIndex] ?? {};
    const values: Record<string, string> = {};
    mappedFields.forEach(f => { values[f.key] = row[colMap[f.key]] ?? ''; });
    setFixValues(values);
    setFixingIndex(i);
  };

  // Re-run the import for JUST the edited row. Success (or "already exists")
  // removes it from the failure list; a new failure updates the reason in place.
  const retryFix = async () => {
    if (fixingIndex === null) return;
    const editedRow: Record<string, string> = {};
    mappedFields.forEach(f => { editedRow[colMap[f.key]] = fixValues[f.key] ?? ''; });
    setRetrying(true);
    try {
      const res = await runImportFor(mode, buildCtx([editedRow]));
      if (res.success > 0 || res.skipped > 0) {
        setResult(prev => ({
          ...prev,
          success: prev.success + res.success,
          skipped: prev.skipped + res.skipped,
          failedRows: prev.failedRows.filter((_, i) => i !== fixingIndex),
          notes: [...prev.notes, ...res.notes.filter(n => !prev.notes.includes(n))],
        }));
        setFixingIndex(null);
        onDone?.();
      } else {
        const reason = res.failedRows[0]?.reason;
        if (reason) {
          setResult(prev => ({
            ...prev,
            failedRows: prev.failedRows.map((f, i) => (i === fixingIndex ? { ...f, reason } : f)),
          }));
        }
      }
    } finally {
      setRetrying(false);
    }
  };

  const matchedCount = Object.keys(colMap).length;

  return (
    <Modal open={open} onClose={close} title={title}>
      {step === 'upload' ? (
        <View className="gap-3">
          <Text className="text-xs text-gray-500 leading-5">{uploadHint}</Text>
          <Pressable
            onPress={pickFile}
            disabled={parsing || importing}
            className="border-2 border-dashed border-gray-200 rounded-2xl py-6 items-center active:bg-gray-50"
          >
            {parsing ? (
              <>
                <ActivityIndicator color="#4F46E5" />
                <Text className="text-sm text-gray-500 mt-2">{tr('Leyendo archivo…', 'Reading file…')}</Text>
              </>
            ) : (
              <>
                <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center mb-2">
                  <Upload size={20} color="#4F46E5" />
                </View>
                <Text className="text-sm font-semibold text-gray-900">
                  {tr('Elegir archivo CSV', 'Choose CSV file')}
                </Text>
                <Text className="text-xs text-gray-500 mt-0.5">
                  {tr('Desde Archivos, Drive, etc.', 'From Files, Drive, etc.')}
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={downloadTemplate}
            className="flex-row items-center gap-2 self-start px-2 py-2 active:opacity-70"
          >
            <Download size={14} color="#4F46E5" />
            <Text className="text-xs font-semibold text-primary">
              {tr('Descargar plantilla de ejemplo', 'Download example template')}
            </Text>
          </Pressable>

          {/* Column guide — accepted values / behavior per column, readable
             BEFORE filling in the template. */}
          <View className="bg-gray-50 rounded-xl px-4 py-3">
            <Pressable onPress={() => setGuideOpen(o => !o)} className="active:opacity-70">
              <Text className="text-xs font-semibold text-gray-700">
                {guideOpen ? '▾ ' : '▸ '}{tr('Guía de columnas (valores aceptados)', 'Column guide (accepted values)')}
              </Text>
            </Pressable>
            {guideOpen ? (
              <View className="mt-2 gap-1.5">
                <Text className="text-[11px] text-gray-400">
                  {tr('Solo los campos con * son obligatorios — todo lo demás es opcional.', 'Only fields marked * are required — everything else is optional.')}
                </Text>
                {allImportFields.map(f => (
                  <Text key={f.key} className="text-[11px] leading-4">
                    <Text className="font-semibold text-gray-700">{f.label}{f.required ? ' *' : ''}</Text>
                    {(en ? f.hintEn : f.hintEs) ? <Text className="text-gray-500"> — {en ? f.hintEn : f.hintEs}</Text> : null}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>

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
              <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>{filename}</Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                {rows.length} {tr('filas', 'rows')} · {matchedCount} {tr('columnas mapeadas', 'columns mapped')}
              </Text>
            </View>
          </View>

          <Text className="text-xs text-gray-500 leading-5">
            {tr('Asigna cada campo a una columna del CSV. Los campos no mapeados se omiten.', 'Match each field to a CSV column. Unmapped fields are skipped.')}
            {' '}
            {tr('Solo los campos con * son obligatorios — todo lo demás es opcional.', 'Only fields marked * are required — everything else is optional.')}
          </Text>

          <View className="gap-3">
            {allImportFields.map(f => (
              <View key={f.key}>
              <Select
                label={f.required ? `${f.label} *` : f.label}
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
                options={[
                  { value: SKIP, label: tr('— Omitir —', "— Don't import —") },
                  ...csvHeaders.map(h => ({ value: h, label: h })),
                ]}
              />
              {(en ? f.hintEn : f.hintEs) ? (
                <Text className="text-[10px] leading-4 text-gray-400 mt-1">{en ? f.hintEn : f.hintEs}</Text>
              ) : null}
              </View>
            ))}
          </View>

          <View className="flex-row items-center justify-between pt-2">
            <Pressable onPress={close} className="px-3 py-2 rounded-lg active:bg-gray-100">
              <Text className="text-sm font-semibold text-gray-700">{tr('Cancelar', 'Cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => setStep('preview')}
              disabled={matchedCount === 0}
              className={`px-4 py-2 rounded-lg ${matchedCount === 0 ? 'bg-primary/40' : 'bg-primary active:opacity-80'}`}
            >
              <Text className="text-sm font-semibold text-white">{tr('Continuar', 'Continue')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {step === 'preview' ? (
        <View className="gap-4">
          <View className="bg-gray-50 rounded-xl px-4 py-3 flex-row items-center gap-3">
            <FileText size={18} color="#6B7280" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>{filename}</Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                {rows.length} {tr('filas', 'rows')} · {matchedCount} {tr('columnas mapeadas', 'columns mapped')}
              </Text>
            </View>
          </View>

          <View>
            <Text className="text-xs font-semibold text-gray-400 uppercase mb-2">
              {tr('Vista previa · primeras', 'Preview · first')} {Math.min(5, rows.length)} {tr('de', 'of')} {rows.length}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator className="border border-gray-100 rounded-xl bg-white">
              <View>
                <View className="flex-row bg-gray-50 border-b border-gray-100">
                  {allImportFields.filter(f => colMap[f.key]).map(f => (
                    <View key={f.key} style={{ width: 140 }} className="px-3 py-2">
                      <Text className="text-xs font-semibold text-gray-500" numberOfLines={1}>{f.label}</Text>
                    </View>
                  ))}
                </View>
                {rows.slice(0, 5).map((row, ri) => (
                  <View key={ri} className={`flex-row ${ri < Math.min(5, rows.length) - 1 ? 'border-b border-gray-50' : ''}`}>
                    {allImportFields.filter(f => colMap[f.key]).map(f => {
                      const val = row[colMap[f.key]];
                      return (
                        <View key={f.key} style={{ width: 140 }} className="px-3 py-2">
                          <Text className={`text-xs ${val ? 'text-gray-700' : 'text-gray-300'}`} numberOfLines={1}>
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

          <View className="flex-row items-center justify-between pt-2">
            <Pressable onPress={() => setStep('map')} className="px-3 py-2 rounded-lg active:bg-gray-100">
              <Text className="text-sm font-semibold text-gray-700">{tr('Atrás', 'Back')}</Text>
            </Pressable>
            <Pressable
              onPress={runImport}
              disabled={importing}
              className={`px-4 py-2 rounded-lg ${importing ? 'bg-primary/40' : 'bg-primary active:opacity-80'}`}
            >
              <Text className="text-sm font-semibold text-white">
                {importing ? tr('Importando…', 'Importing…') : `${tr('Importar', 'Import')} ${rows.length}`}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {step === 'done' ? (
        <View className="gap-4 items-center py-4">
          <View className="w-16 h-16 rounded-full bg-green-50 items-center justify-center">
            <CheckCircle2 size={32} color="#10B981" />
          </View>
          <Text className="text-lg font-semibold text-gray-900">{tr('¡Importación completa!', 'Import complete!')}</Text>
          <View className="bg-gray-50 rounded-xl px-6 py-4 w-full">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-sm text-gray-600">{`${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${tr('importados', 'imported')}`}</Text>
              <Text className="text-base font-bold text-green-600">{result.success}</Text>
            </View>
            {result.skipped > 0 ? (
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-sm text-gray-600">{tr('Ya existían', 'Already existed')}</Text>
                <Text className="text-base font-bold text-gray-500">{result.skipped}</Text>
              </View>
            ) : null}
            {result.failedRows.length > 0 ? (
              <View className="flex-row justify-between items-center">
                <Text className="text-sm text-gray-600">{tr('Errores', 'Errors')}</Text>
                <Text className="text-base font-bold text-red-600">{result.failedRows.length}</Text>
              </View>
            ) : null}
          </View>

          {result.notes.length > 0 ? (
            <View className="w-full bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              {result.notes.map((n, i) => (
                <Text key={i} className="text-xs text-blue-800">{n}</Text>
              ))}
            </View>
          ) : null}

          {result.failedRows.length > 0 ? (
            <View className="w-full">
              <Pressable onPress={() => setShowErrorDetails(v => !v)} className="flex-row items-center justify-center gap-1 py-2">
                <Text className="text-sm font-medium text-primary">
                  {showErrorDetails ? tr('Ocultar detalles', 'Hide details') : tr('Ver detalles', 'See details')}
                </Text>
                <Text className="text-sm text-primary">{showErrorDetails ? '▴' : '▾'}</Text>
              </Pressable>
              {showErrorDetails ? (
                <View className="bg-red-50 border border-red-100 rounded-xl overflow-hidden">
                  {result.failedRows.slice(0, 20).map((f, i) => (
                    <View key={i} className={`px-4 py-2.5 ${i < Math.min(20, result.failedRows.length) - 1 ? 'border-b border-red-100/60' : ''}`}>
                      <View className="flex-row items-center justify-between gap-2">
                        <View className="flex-1">
                          <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>{f.label}</Text>
                          <Text className="text-xs text-red-700 mt-0.5" numberOfLines={2}>{f.reason}</Text>
                        </View>
                        {f.rowIndex != null ? (
                          <Pressable
                            onPress={() => (fixingIndex === i ? setFixingIndex(null) : openFix(i))}
                            hitSlop={6}
                          >
                            <Text className="text-xs font-semibold text-primary">
                              {fixingIndex === i ? tr('Cancelar', 'Cancel') : tr('Corregir', 'Fix')}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {/* Inline editor — fix the row's values and retry just this row. */}
                      {fixingIndex === i ? (
                        <View className="mt-2 rounded-xl bg-white border border-gray-100 p-3" style={{ gap: 8 }}>
                          {mappedFields.map(mf => (
                            <Input
                              key={mf.key}
                              label={mf.required ? `${mf.label} *` : mf.label}
                              value={fixValues[mf.key] ?? ''}
                              onChangeText={(v: string) => setFixValues(prev => ({ ...prev, [mf.key]: v }))}
                            />
                          ))}
                          <Pressable
                            onPress={() => void retryFix()}
                            disabled={retrying}
                            className={`rounded-lg py-2.5 items-center ${retrying ? 'bg-primary/40' : 'bg-primary active:opacity-80'}`}
                          >
                            <Text className="text-sm font-semibold text-white">
                              {retrying ? tr('Reintentando…', 'Retrying…') : tr('Reintentar fila', 'Retry row')}
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ))}
                  {result.failedRows.length > 20 ? (
                    <View className="px-4 py-2.5 bg-red-100/40">
                      <Text className="text-xs text-gray-600 text-center">+ {result.failedRows.length - 20} {tr('más', 'more')}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          <Button onPress={close} fullWidth>
            <Text className="text-white font-semibold">{tr('Cerrar', 'Close')}</Text>
          </Button>
        </View>
      ) : null}
    </Modal>
  );
}
