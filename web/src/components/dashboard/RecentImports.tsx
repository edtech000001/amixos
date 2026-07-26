'use client';

// Collapsible "Recent imports" list — the 10 most recent import_logs rows for
// the business (any import type), with file name, date/time, and counts. Shared
// by the standalone Clients/Photos importers so they match the import hub, which
// has the same list inline. Green = records added.

import { useEffect, useState } from 'react';
import { createSupabaseClient } from '@/lib/supabase';

interface Log {
  id: string;
  file_name: string | null;
  success: number;
  updated: number;
  skipped: number;
  failed: number;
  created_at: string;
}

export function RecentImports({ businessId, locale }: { businessId: string; locale: string }) {
  const en = locale === 'en';
  const tr = (es: string, enS: string) => (en ? enS : es);
  const [logs, setLogs] = useState<Log[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseClient();
    void supabase
      .from('import_logs')
      .select('id, file_name, success, updated, skipped, failed, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(10)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: Log[] | null }) => {
        if (!cancelled) setLogs(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  return (
    <details className="bg-surface rounded-xl px-4 py-3">
      <summary className="text-xs font-semibold text-ink cursor-pointer select-none">
        {tr('Importaciones recientes', 'Recent imports')}
      </summary>
      <div className="mt-2 flex flex-col gap-1 max-h-56 overflow-y-auto pr-1">
        {logs === null ? (
          <p className="text-[11px] text-faint">…</p>
        ) : logs.length === 0 ? (
          <p className="text-[11px] text-faint">
            {tr('Aún no hay importaciones registradas.', 'No imports recorded yet.')}
          </p>
        ) : (
          logs.map(l => (
            <div key={l.id} className="flex items-center justify-between gap-3 py-1 border-b border-border-soft last:border-0">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink truncate">{l.file_name || '—'}</p>
                <p className="text-[11px] text-faint">
                  {new Date(l.created_at).toLocaleString(en ? 'en-US' : 'es-MX', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              </div>
              <p className="text-[11px] text-muted shrink-0 text-right">
                <span className="text-emerald-600 font-semibold">
                  {l.success} {tr('agregados', 'added')}
                </span>
                {l.updated > 0 ? <> · <span className="text-blue-600">{l.updated}↺</span></> : null}
                {l.skipped > 0 ? <> · {l.skipped}=</> : null}
                {l.failed > 0 ? <> · <span className="text-red-500">{l.failed}✗</span></> : null}
              </p>
            </div>
          ))
        )}
      </div>
    </details>
  );
}
