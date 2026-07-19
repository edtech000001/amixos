'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import { SettingsNav } from '@/components/dashboard/SettingsNav';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { AUDIT_ACTION_LABEL, type AuditAction } from '@amixos/shared/lib/audit';
import { usePersistedSearch } from '@amixos/shared/lib/usePersistedSearch';
import { getModuleById } from '@amixos/shared/modules/registry';
import { formatDateTimeLong } from '@amixos/shared/lib/format';

interface AuditRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

// Who performed the action: "Full Name · email" when a display name is set,
// otherwise just the email (and the unknown-user fallback for old rows).
function actorLine(row: AuditRow, unknownUser: string): string {
  const name = row.user_name?.trim();
  if (name && row.user_email) return `${name} · ${row.user_email}`;
  return name || row.user_email || unknownUser;
}

// Load a generous recent window up front (~a month+ for most businesses) so
// the client-side search has a meaningful set to filter; "load more" pulls
// older entries beyond it.
const PAGE_SIZE = 200;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function relTime(
  iso: string,
  t: ReturnType<typeof useLang>['t']['dashboard']['settings']['activity'],
  locale: string,
): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t.timeJustNow;
  if (diff < 3600) return t.timeMinutesAgo.replace('{{n}}', String(Math.floor(diff / 60)));
  if (diff < 86400) return t.timeHoursAgo.replace('{{n}}', String(Math.floor(diff / 3600)));
  if (diff < 86400 * 14) return t.timeDaysAgo.replace('{{n}}', String(Math.floor(diff / 86400)));
  return formatDateTimeLong(iso, locale);
}

function describe(row: AuditRow, lang: 'es' | 'en', moduleName?: (key: string) => string): string {
  const label = AUDIT_ACTION_LABEL[row.action as AuditAction]?.[lang] ?? row.action;
  const d = row.details ?? {};
  const bits: string[] = [];
  // module.enabled/disabled stores module_key — show the human module name.
  if (d.module_key && moduleName) bits.push(moduleName(String(d.module_key)));
  if (d.from && d.to) bits.push(`${d.from} → ${d.to}`);
  if (d.title) bits.push(String(d.title));
  if (d.job_title) bits.push(String(d.job_title));
  if (d.estimate_number) bits.push(String(d.estimate_number));
  if (d.name) bits.push(String(d.name));
  if (d.invoice_number) bits.push(String(d.invoice_number));
  if (typeof d.count === 'number') bits.push(`${d.count}`);
  if (d.email) bits.push(String(d.email));
  // Imports + payroll events (137/audit additions).
  if (d.file) bits.push(String(d.file));
  if (typeof d.amount === 'number') bits.push(`$${Number(d.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  if (typeof d.success === 'number') bits.push(`${d.success} ✓`);
  if (typeof d.failed === 'number' && d.failed > 0) bits.push(`${d.failed} ✗`);
  if (d.target_business_name) bits.push(String(d.target_business_name));
  return bits.length ? `${label} — ${bits.join(' · ')}` : label;
}

export default function ActividadPage() {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.activity;
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';

  // Resolve a module_key (e.g. "files") to its localized display name.
  const moduleName = useCallback((key: string) => {
    const def = getModuleById(key);
    const entry = def
      ? (full.dashboard.modules.list as unknown as Record<string, { name: string } | undefined>)[def.i18nKey]
      : undefined;
    return entry?.name ?? key;
  }, [full]);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [search, setSearch] = usePersistedSearch('search.activity');

  const load = useCallback(async (before?: string) => {
    if (!business) return;
    setLoading(true);
    const { data } = await supabase.rpc('list_audit_log', {
      b_id: business.id,
      page_size: PAGE_SIZE,
      before: before ?? null,
    });
    const next = (data as AuditRow[] | null) ?? [];
    setRows(prev => before ? [...prev, ...next] : next);
    setReachedEnd(next.length < PAGE_SIZE);
    setLoading(false);
  }, [business, supabase]);

  useEffect(() => { void load(); }, [load]);

  // Client-side search over the loaded window — matches the rendered text
  // (action label + who + details), so "maria" or "factura" find what you see.
  const q = norm(search.trim());
  const filtered = q
    ? rows.filter(r =>
        norm(`${describe(r, lang, moduleName)} ${r.user_name ?? ''} ${r.user_email ?? ''} ${r.action} ${JSON.stringify(r.details ?? {})}`).includes(q),
      )
    : rows;

  return (
    <div className="md:flex md:min-h-screen">
      <SettingsNav />
      <div className="flex-1 min-w-0 p-6">
      <div className="bg-card rounded-2xl border border-border-soft p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Activity size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">{t.heading}</h1>
            <p className="text-sm text-muted mt-0.5">{t.subtitle}</p>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className="py-10 flex justify-center">
            <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{animationDelay: `${i*0.15}s`}}/>)}</div>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-faint">{t.emptyState}</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-faint">{t.noResults}</p>
        ) : (
          <div className="flex flex-col max-h-[calc(100vh-280px)] overflow-y-auto -mr-3 pr-3">
            {filtered.map((row, i) => (
              <div key={row.id} className={`flex items-start gap-3 py-3 ${i < filtered.length - 1 ? 'border-b border-border-soft' : ''}`}>
                <div className="w-9 h-9 rounded-full bg-border-soft flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-muted">
                    {(row.user_name || row.user_email || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink">{describe(row, lang, moduleName)}</p>
                  <p className="text-xs text-faint mt-0.5">
                    {actorLine(row, t.unknownUser)} · {relTime(row.created_at, t, locale)}
                  </p>
                </div>
              </div>
            ))}
            {/* Load more pulls older entries beyond the loaded window (and
                widens what search can match). Hidden while actively searching
                a narrowed set to keep the affordance unambiguous. */}
            {!reachedEnd && !q && (
              <button
                onClick={() => load(rows[rows.length - 1]?.created_at)}
                disabled={loading}
                className="mt-4 text-sm font-semibold text-primary hover:underline disabled:opacity-50"
              >
                {loading ? '...' : t.loadMore}
              </button>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
