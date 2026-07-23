'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Plus, Trash2, ExternalLink } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { confirm, alertMessage } from '@amixos/shared/ui/confirmBus';
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
// the Files module — refetched fresh at upload time).
export function JobDocumentsSection({ jobId, businessId, canWrite }: {
  jobId: string;
  businessId: string;
  canWrite: boolean;
}) {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const { t: full } = useLang();
  const td = full.dashboard.jobs.detail;
  const dateLoc = full.dashboard.dateLocale;
  const inputRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<JobDocument[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    // Bounded by MAX_DOCS_PER_JOB — a single page is always enough.
    supabase.from('job_documents').select('*')
      .eq('job_id', jobId).order('created_at')
      .then(({ data }) => setDocs((data ?? []) as JobDocument[]));
  }, [jobId]);

  const subInfo: SubscriptionInfo | null = business ? {
    plan: business.plan,
    subscription_status: business.subscription_status,
    trial_ends_at: business.trial_ends_at,
    current_period_end: business.current_period_end,
  } : null;

  const onFilesChosen = async (files: FileList | null) => {
    if (!files?.length || uploading) return;
    setUploading(true);
    try {
      let count = docs.length;
      for (const file of Array.from(files)) {
        if (count >= MAX_DOCS_PER_JOB) {
          void alertMessage({ message: td.docLimitReached.replace('{{max}}', String(MAX_DOCS_PER_JOB)), destructive: true });
          break;
        }
        if (file.size > JOB_DOC_MAX_BYTES) {
          void alertMessage({ message: td.docTooBig, destructive: true });
          continue;
        }
        // Photos belong in the Photos section — catch the accidental pick,
        // but let deliberate image documents (scanned contracts) through.
        if (file.type.startsWith('image/')) {
          const ok = await confirm({ message: td.docImageWarn, confirmText: td.docImageAttachAnyway });
          if (!ok) continue;
        }
        // Plan storage quota — refetch usage fresh so the check is accurate.
        if (subInfo) {
          const { data: used } = await supabase.rpc('business_storage_bytes', { p_business_id: businessId });
          if (wouldExceedStorage(subInfo, Number(used ?? 0), file.size)) {
            void alertMessage({ message: td.docStorageFull, destructive: true });
            break;
          }
        }
        const path = jobDocPath(businessId, jobId, jobDocUid(), file.name);
        const { error: upErr } = await supabase.storage.from(JOB_DOCS_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
        if (upErr) { void alertMessage({ message: td.docUploadError, destructive: true }); continue; }
        const { data: row, error: insErr } = await supabase.from('job_documents').insert({
          business_id: businessId, job_id: jobId, storage_path: path,
          file_name: file.name, file_size: file.size, mime_type: file.type || null,
        }).select().single();
        if (insErr || !row) { void alertMessage({ message: td.docUploadError, destructive: true }); continue; }
        setDocs(prev => [...prev, row as JobDocument]);
        count += 1;
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  // Open in a new tab: open a blank tab synchronously (popup blockers), then
  // point it at a freshly minted signed URL (same pattern as the Files module).
  const openDoc = async (doc: JobDocument) => {
    const tab = window.open('', '_blank');
    const url = await signedUrl(supabase, doc.storage_path);
    if (tab) { if (url) tab.location.href = url; else tab.close(); }
  };

  const deleteDoc = async (doc: JobDocument) => {
    const ok = await confirm({ message: td.deleteDocConfirm, destructive: true });
    if (!ok) return;
    const { data: deleted } = await supabase.from('job_documents')
      .delete().eq('id', doc.id).select('id');
    if (deleted?.length) setDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  if (docs.length === 0 && !canWrite) return null;

  return (
    <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-faint uppercase tracking-wide">
          {td.documentsHeading}{docs.length > 0 ? ` (${docs.length})` : ''}
        </h2>
        {canWrite && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-50">
            <Plus size={14}/> {td.addDocumentBtn}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" multiple hidden onChange={e => onFilesChosen(e.target.files)} />

      {docs.length === 0 ? (
        <p className="text-sm text-faint">{td.noDocuments}</p>
      ) : (
        <div className="flex flex-col divide-y divide-border-soft">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 py-2.5">
              <FileText size={16} className="text-muted shrink-0"/>
              <button onClick={() => openDoc(doc)} className="flex-1 min-w-0 text-left group">
                <p className="text-sm font-medium text-ink truncate group-hover:underline">
                  {doc.file_name}
                  <ExternalLink size={11} className="inline ml-1.5 text-faint"/>
                </p>
                <p className="text-xs text-faint">
                  {doc.file_size ? `${formatBytes(doc.file_size)} · ` : ''}{formatDateLong(doc.created_at, dateLoc)}
                </p>
              </button>
              {canWrite && (
                <button onClick={() => deleteDoc(doc)}
                  className="p-1.5 rounded-lg text-faint hover:text-red-500 hover:bg-red-500/10 transition-colors">
                  <Trash2 size={14}/>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
