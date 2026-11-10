import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { FileText, Plus, Trash2 } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import {
  JOB_DOCS_BUCKET, JOB_DOC_MAX_BYTES, MAX_DOCS_PER_JOB,
  jobDocPath, jobDocUid, type JobDocument,
} from '@amixos/shared/lib/jobDocs';
import { signedUrl } from '@amixos/shared/lib/storageUrls';
import { wouldExceedStorage, formatBytes } from '@amixos/shared/lib/storageLimits';
import type { SubscriptionInfo } from '@amixos/shared/lib/subscription';
import { formatDateLong } from '@amixos/shared/lib/format';

// Documents attached to a job (contracts, permits, signed paperwork).
// Mirrors JobPhotosSection's shape; storage guardrails: 50 MB per file,
// 20 docs per job, and the business's plan storage quota (same check as
// the Files module — refetched fresh at upload time). Uploads are direct
// (not outbox-routed), same as the Files module.
export function JobDocumentsSection({ jobId, businessId, canWrite }: {
  jobId: string;
  businessId: string;
  canWrite: boolean;
}) {
  const supabase = createSupabaseClient();
  const c = useThemeColors();
  const { business } = useApp();
  const { t: full } = useLang();
  const td = full.dashboard.jobs.detail;
  const dateLoc = full.dashboard.dateLocale;

  const [docs, setDocs] = useState<JobDocument[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    // Bounded by MAX_DOCS_PER_JOB — a single page is always enough.
    const { data } = await supabase.from('job_documents').select('*')
      .eq('job_id', jobId).order('created_at');
    setDocs((data ?? []) as JobDocument[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  useEffect(() => { void load(); }, [load]);

  const subInfo: SubscriptionInfo | null = business ? {
    plan: business.plan,
    subscription_status: business.subscription_status,
    trial_ends_at: business.trial_ends_at,
    current_period_end: business.current_period_end,
  } : null;

  // Pick one or several documents at once (same rules as web, per file:
  // size cap, photo check, plan storage, the per-job limit).
  const pickAndUpload = async () => {
    if (uploading) return;
    if (docs.length >= MAX_DOCS_PER_JOB) {
      Alert.alert('', td.docLimitReached.replace('{{max}}', String(MAX_DOCS_PER_JOB)));
      return;
    }
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
    if (res.canceled || !res.assets?.length) return;
    // One message per kind of problem at the end, not an alert per file.
    const problems = new Set<string>();
    setUploading(true);
    try {
      let count = docs.length;
      for (const f of res.assets) {
        if (count >= MAX_DOCS_PER_JOB) {
          problems.add(td.docLimitReached.replace('{{max}}', String(MAX_DOCS_PER_JOB)));
          break;
        }
        if (f.size != null && f.size > JOB_DOC_MAX_BYTES) { problems.add(td.docTooBig); continue; }
        // Photos belong in the Photos section — catch the accidental pick, but
        // let deliberate image documents (scanned contracts) through.
        if (f.mimeType?.startsWith('image/')) {
          const proceed = await new Promise<boolean>(resolve => {
            Alert.alert(f.name, td.docImageWarn, [
              { text: full.common.buttons.cancel, style: 'cancel', onPress: () => resolve(false) },
              { text: td.docImageAttachAnyway, onPress: () => resolve(true) },
            ]);
          });
          if (!proceed) continue;
        }
        // Plan storage quota — refetch usage fresh so the check is accurate.
        if (subInfo) {
          const { data: used } = await supabase.rpc('business_storage_bytes', { p_business_id: businessId });
          if (wouldExceedStorage(subInfo, Number(used ?? 0), f.size ?? 0)) {
            problems.add(td.docStorageFull);
            break;
          }
        }
        try {
          const path = jobDocPath(businessId, jobId, jobDocUid(), f.name);
          const blob = await fetch(f.uri).then(r => r.blob());
          const arrayBuffer = await new Response(blob).arrayBuffer();
          const { error: upErr } = await supabase.storage.from(JOB_DOCS_BUCKET)
            .upload(path, arrayBuffer, { contentType: f.mimeType ?? undefined, upsert: false });
          if (upErr) { problems.add(td.docUploadError); continue; }
          const { data: row, error: insErr } = await supabase.from('job_documents').insert({
            business_id: businessId, job_id: jobId, storage_path: path,
            file_name: f.name, file_size: f.size ?? null, mime_type: f.mimeType ?? null,
          }).select().single();
          if (insErr || !row) { problems.add(td.docUploadError); continue; }
          setDocs(prev => [...prev, row as JobDocument]);
          count += 1;
        } catch {
          problems.add(td.docUploadError);
        }
      }
    } finally {
      setUploading(false);
    }
    if (problems.size) Alert.alert('', [...problems].join('\n\n'));
  };

  const openDoc = async (doc: JobDocument) => {
    const url = await signedUrl(supabase, doc.storage_path);
    if (url) void Linking.openURL(url);
  };

  const deleteDoc = (doc: JobDocument) => {
    Alert.alert('', td.deleteDocConfirm, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      {
        text: full.common.buttons.delete,
        style: 'destructive',
        onPress: () => void (async () => {
          const { data: deleted } = await supabase.from('job_documents')
            .delete().eq('id', doc.id).select('id');
          if (deleted?.length) setDocs(prev => prev.filter(d => d.id !== doc.id));
        })(),
      },
    ]);
  };

  if (docs.length === 0 && !canWrite) return null;

  return (
    <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide">
          {td.documentsHeading}{docs.length > 0 ? ` (${docs.length})` : ''}
        </Text>
        {canWrite ? (
          <Pressable onPress={pickAndUpload} disabled={uploading} className="flex-row items-center gap-1 active:opacity-60">
            {uploading ? (
              <ActivityIndicator size="small" color={c.primary} />
            ) : (
              <>
                <Plus size={14} color={c.primary} />
                <Text className="text-sm font-medium text-primary">{td.addDocumentBtn}</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      {docs.length === 0 ? (
        <Text className="text-sm text-faint">{td.noDocuments}</Text>
      ) : (
        <View className="gap-0.5">
          {docs.map((doc, i) => (
            <View key={doc.id} className={`flex-row items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-border-soft' : ''}`}>
              <FileText size={16} color={c.muted} />
              <Pressable onPress={() => void openDoc(doc)} className="flex-1 min-w-0 active:opacity-60">
                <Text className="text-sm font-medium text-ink" numberOfLines={1}>{doc.file_name}</Text>
                <Text className="text-xs text-faint">
                  {doc.file_size ? `${formatBytes(doc.file_size)} · ` : ''}{formatDateLong(doc.created_at, dateLoc)}
                </Text>
              </Pressable>
              {canWrite ? (
                <Pressable onPress={() => deleteDoc(doc)} hitSlop={8} className="p-1.5 active:opacity-60">
                  <Trash2 size={14} color={c.danger} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
