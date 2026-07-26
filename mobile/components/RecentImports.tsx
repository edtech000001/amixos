// Collapsible "Recent imports" list — the 10 most recent import_logs rows for
// the business (any import type), with file name, date/time, and counts. Shared
// by the standalone Clients/Photos importers so they match the import hub, which
// has the same list inline. The leading ✓ number = records added.

import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
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
  const en = locale !== 'es';
  const tr = (es: string, enS: string) => (en ? enS : es);
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<Log[] | null>(null);

  useEffect(() => {
    if (!open || logs !== null) return;
    let cancelled = false;
    const supabase = createSupabaseClient();
    void supabase
      .from('import_logs')
      .select('id, file_name, success, updated, skipped, failed, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }: { data: Log[] | null }) => {
        if (!cancelled) setLogs(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [open, logs, businessId]);

  return (
    <View className="bg-surface rounded-xl px-4 py-3">
      <Pressable onPress={() => setOpen(o => !o)} className="active:opacity-70">
        <Text className="text-xs font-semibold text-ink">
          {open ? '▾ ' : '▸ '}{tr('Importaciones recientes', 'Recent imports')}
        </Text>
      </Pressable>
      {open ? (
        <View className="mt-2 gap-1">
          {logs === null ? (
            <Text className="text-[11px] text-faint">…</Text>
          ) : logs.length === 0 ? (
            <Text className="text-[11px] text-faint">{tr('Aún no hay importaciones registradas.', 'No imports recorded yet.')}</Text>
          ) : (
            logs.map(l => (
              <View key={l.id} className="flex-row items-center justify-between gap-3 py-1 border-b border-border-soft">
                <View className="flex-1 min-w-0">
                  <Text className="text-xs font-semibold text-ink" numberOfLines={1}>{l.file_name || '—'}</Text>
                  <Text className="text-[11px] text-faint">
                    {new Date(l.created_at).toLocaleString(en ? 'en-US' : 'es-MX', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
                <Text className="text-[11px] text-muted">
                  {l.success} ✓{l.updated > 0 ? ` · ${l.updated}↺` : ''}{l.skipped > 0 ? ` · ${l.skipped}=` : ''}{l.failed > 0 ? ` · ${l.failed}✗` : ''}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
