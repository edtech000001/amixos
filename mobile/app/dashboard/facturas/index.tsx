import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useSwr } from '@amixos/shared/lib/swrCache';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import {
  InvoicesListScreen,
  type InvoiceListItem,
} from '@amixos/shared/screens/dashboard/InvoicesListScreen';
import {
  fetchInvoicesPage,
  fetchInvoiceStatusCounts,
  fetchAllInvoicesMatching,
  statusGroupIndex,
  INVOICE_LAZY_GROUP_DIMS,
  type InvoicesCursor,
  type InvoicesQueryParams,
  type InvoiceGroup,
} from '@amixos/shared/lib/invoicesQuery';
import { logAudit } from '@amixos/shared/lib/audit';
import { can } from '@amixos/shared/lib/permissions';

interface InvoiceClient { first_name: string; last_name: string; company: string | null; state: string | null; }
interface RawInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  due_date: string | null;
  issue_date: string | null;
  created_at: string;
  sent_at: string | null;
  clients: InvoiceClient | null;
  invoice_clients: { clients: InvoiceClient | null }[];
}

// Only the columns the list renders/searches. created_at drives the keyset cursor.
const INVOICE_LIST_SELECT =
  'id, invoice_number, status, total_amount, due_date, issue_date, created_at, sent_at, line_items, clients(first_name, last_name, company, state), invoice_clients(clients(first_name, last_name, company, state)), jobs(external_ref, title)';

// Primary client for company/state — the single `clients` relation if present,
// else the first of the multi-client list.
const primaryClient = (raw: RawInvoice): InvoiceClient | null =>
  raw.clients ?? raw.invoice_clients?.[0]?.clients ?? null;

/** Total matching the active status filter (for the header count). */
const totalFor = (counts: Record<string, number>, statuses?: string[]) =>
  statuses?.length ? statuses.reduce((s, k) => s + (counts[k] ?? 0), 0) : (counts.all ?? 0);

export default function FacturasTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, currentRole, activeLocationId } = useApp();
  const { t: full } = useLang();
  const [rawInvoices, setRawInvoices] = useState<RawInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const mapClientNames = (raw: RawInvoice): string | null => {
    // Embedded client rows can be NULL under RLS (roles with Clients =
    // "Assigned"/none still see invoices) — never assume the join resolved.
    const list = raw.invoice_clients?.length
      ? raw.invoice_clients
          .filter(ic => ic.clients)
          .map(ic => `${ic.clients!.first_name} ${ic.clients!.last_name}`)
      : raw.clients
        ? [`${raw.clients.first_name} ${raw.clients.last_name}`]
        : [];
    return list.length ? list.join(', ') : null;
  };

  // ── Server-side pagination + search + status filter + counts ────────────────
  const [serverCounts, setServerCounts] = useState<Record<string, number>>({});
  const [serverTotal, setServerTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadSeqRef = useRef(0);
  const cursorRef = useRef<InvoicesCursor | null>(null);
  const paramsRef = useRef<InvoicesQueryParams | null>(null);
  const loadAllRef = useRef(false);
  // Lazy group-by: 'group' loads the status-group index then each group on scroll.
  const modeRef = useRef<'page' | 'all' | 'group'>('page');
  const groupIndexRef = useRef<InvoiceGroup[]>([]);
  const loadedGroupsRef = useRef(0);
  const groupByRef = useRef<string>('none');
  // Flip sent invoices past due to 'overdue' ONCE per business before the first
  // query (the badge reads the stored status). After the first pass it no-ops.
  const sweptRef = useRef<string | null>(null);
  const maybeSweep = async (businessId: string) => {
    if (sweptRef.current === businessId) return;
    sweptRef.current = businessId;
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('invoices').update({ status: 'overdue' })
      .eq('business_id', businessId).eq('status', 'sent').lt('due_date', today);
    // …and the reverse: an invoice whose due date was pushed back into the
    // future (or to today) is no longer overdue — demote it to 'sent'.
    await supabase.from('invoices').update({ status: 'sent' })
      .eq('business_id', businessId).eq('status', 'overdue').gte('due_date', today);
  };

  const runQuery = async (params: InvoicesQueryParams, loadAll = false) => {
    const seq = ++loadSeqRef.current;
    paramsRef.current = params;
    loadAllRef.current = loadAll;
    modeRef.current = loadAll ? 'all' : 'page';
    setLoading(true);
    cursorRef.current = null;
    setHasMore(false);
    try {
      await maybeSweep(params.businessId).catch(() => {});
      const countsP = fetchInvoiceStatusCounts(supabase, {
        businessId: params.businessId, locationId: params.locationId,
        search: params.search, dateFrom: params.dateFrom, dateTo: params.dateTo,
      });
      if (loadAll) {
        const acc: RawInvoice[] = [];
        let cursor: InvoicesCursor | null = null;
        for (let i = 0; i < 200; i++) {
          const page = await fetchInvoicesPage<RawInvoice>(supabase, INVOICE_LIST_SELECT, { ...params, cursor, pageSize: 1000 });
          acc.push(...page.invoices);
          if (seq === loadSeqRef.current) setRawInvoices([...acc]); // progressive
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }
        const counts = await countsP;
        if (seq !== loadSeqRef.current) return;
        setServerCounts(counts);
        setServerTotal(totalFor(counts, params.statuses));
      } else {
        const [page, counts] = await Promise.all([
          fetchInvoicesPage<RawInvoice>(supabase, INVOICE_LIST_SELECT, { ...params, pageSize: 50 }),
          countsP,
        ]);
        if (seq !== loadSeqRef.current) return;
        setRawInvoices(page.invoices);
        cursorRef.current = page.nextCursor;
        setHasMore(!!page.nextCursor);
        setServerCounts(counts);
        setServerTotal(totalFor(counts, params.statuses));
      }
    } catch { /* offline / error — keep whatever's on screen */ }
    finally { if (seq === loadSeqRef.current) setLoading(false); }
  };

  // ── SWR default view (no search/status/date, no grouping) ─────────────────
  const [filters, setFilters] = useState<{ search: string; statuses: string[]; groupBy: string; dateFrom: string | null; dateTo: string | null } | null>(null);
  const isDefaultFilters = (f: NonNullable<typeof filters>) =>
    !f.search && f.statuses.length === 0 && f.groupBy === 'none' && !f.dateFrom && !f.dateTo;
  const defaultActive = !!business && !!filters && isDefaultFilters(filters);
  type InvoicesPayload = { invoices: RawInvoice[]; nextCursor: InvoicesCursor | null; counts: Record<string, number> };
  const swrKey = defaultActive ? `invoices_list_v2_${business.id}_${activeLocationId ?? 'all'}` : null;
  const swr = useSwr<InvoicesPayload>(
    swrKey,
    async () => {
      const params: InvoicesQueryParams = { businessId: business!.id, locationId: activeLocationId ?? null, statuses: [], search: '' };
      await maybeSweep(business!.id).catch(() => {});
      const [page, counts] = await Promise.all([
        fetchInvoicesPage<RawInvoice>(supabase, INVOICE_LIST_SELECT, { ...params, pageSize: 50 }),
        fetchInvoiceStatusCounts(supabase, { businessId: business!.id, locationId: activeLocationId ?? null }),
      ]);
      return { invoices: page.invoices, nextCursor: page.nextCursor, counts };
    },
    {
      cacheKey: swrKey,
      resetKey: `${business?.id ?? ''}_${activeLocationId ?? 'all'}`,
      focusThrottleMs: 3_000,
      cacheTrim: (d) => ({ ...d, invoices: d.invoices.slice(0, 50), nextCursor: null }),
    },
  );
  useEffect(() => {
    if (!swrKey || !swr.data || !business) return;
    ++loadSeqRef.current;
    modeRef.current = 'page';
    loadAllRef.current = false;
    paramsRef.current = { businessId: business.id, locationId: activeLocationId ?? null, statuses: [], search: '' };
    setRawInvoices(swr.data.invoices);
    cursorRef.current = swr.data.nextCursor;
    setHasMore(!!swr.data.nextCursor);
    setServerCounts(swr.data.counts);
    setServerTotal(totalFor(swr.data.counts, []));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swr.data, swrKey]);

  const loadNextGroup = async () => {
    const seq = loadSeqRef.current;
    const idx = loadedGroupsRef.current;
    const grp = groupIndexRef.current[idx];
    if (!grp || !paramsRef.current) { setHasMore(false); return; }
    setLoadingMore(true);
    try {
      const rows = await fetchAllInvoicesMatching<RawInvoice>(supabase, INVOICE_LIST_SELECT, { ...paramsRef.current, groupStatus: grp.key });
      if (seq !== loadSeqRef.current) return;
      setRawInvoices(prev => [...prev, ...rows]);
      loadedGroupsRef.current = idx + 1;
      setHasMore(loadedGroupsRef.current < groupIndexRef.current.length);
    } catch { /* offline / error — keep what's loaded */ }
    finally { setLoadingMore(false); }
  };

  const loadMore = async () => {
    if (loadingMore || !paramsRef.current) return;
    if (modeRef.current === 'group') { void loadNextGroup(); return; }
    if (!cursorRef.current) return;
    const seq = loadSeqRef.current;
    setLoadingMore(true);
    try {
      const page = await fetchInvoicesPage<RawInvoice>(supabase, INVOICE_LIST_SELECT, { ...paramsRef.current, cursor: cursorRef.current, pageSize: 50 });
      if (seq !== loadSeqRef.current) return;
      setRawInvoices(prev => [...prev, ...page.invoices]);
      cursorRef.current = page.nextCursor;
      setHasMore(!!page.nextCursor);
    } catch { /* offline / error — keep what's loaded */ }
    finally { setLoadingMore(false); }
  };

  // Lazy status grouping: the index IS the per-status counts. Each status group
  // loads its rows on scroll. Online action (not wrapped in loadCached).
  const runGroupLazy = async (params: InvoicesQueryParams) => {
    const seq = ++loadSeqRef.current;
    paramsRef.current = params;
    groupByRef.current = 'status';
    modeRef.current = 'group';
    loadAllRef.current = false;
    setLoading(true); setHasMore(false); cursorRef.current = null;
    try {
      await maybeSweep(params.businessId);
      const counts = await fetchInvoiceStatusCounts(supabase, {
        businessId: params.businessId, locationId: params.locationId,
        search: params.search, dateFrom: params.dateFrom, dateTo: params.dateTo,
      });
      if (seq !== loadSeqRef.current) return;
      setServerCounts(counts);
      setServerTotal(totalFor(counts, params.statuses));
      let index = statusGroupIndex(counts, (k) => k);
      if (params.statuses?.length) index = index.filter(g => params.statuses!.includes(g.key));
      groupIndexRef.current = index;
      loadedGroupsRef.current = 0;
      setRawInvoices([]);
      await loadNextGroup();
    } catch { /* offline / error */ }
    finally { if (seq === loadSeqRef.current) setLoading(false); }
  };

  const reRun = (locationId: string | null) => {
    if (defaultActive) { swr.refresh({ force: true }); return; }
    if (!paramsRef.current) return;
    const p = { ...paramsRef.current, locationId };
    if (modeRef.current === 'group') void runGroupLazy(p);
    else void runQuery(p, loadAllRef.current);
  };
  const reload = () => reRun(activeLocationId ?? null);
  useEffect(() => {
    if (!defaultActive) reRun(activeLocationId ?? null); // SWR key covers the default view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocationId]);
  // Revalidate on focus — throttled, never blanks.
  useFocusEffect(useCallback(() => {
    if (defaultActive) swr.refresh();
    else reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocationId, defaultActive]));

  const handleFiltersChange = (f: { search: string; statuses: string[]; groupBy: string; dateFrom: string | null; dateTo: string | null }) => {
    if (!business) return;
    setFilters(f);
    if (isDefaultFilters(f)) return; // SWR owns the default view
    const params: InvoicesQueryParams = {
      businessId: business.id, locationId: activeLocationId ?? null,
      statuses: f.statuses, search: f.search, dateFrom: f.dateFrom, dateTo: f.dateTo,
    };
    if (f.groupBy !== 'none' && INVOICE_LAZY_GROUP_DIMS.includes(f.groupBy)) {
      void runGroupLazy(params);
    } else {
      void runQuery(params, f.groupBy !== 'none');
    }
  };

  const updateStatus = async (id: string, status: 'sent' | 'paid') => {
    if (!can.editInvoice(currentRole)) return;
    const update: any = { status };
    if (status === 'paid') update.paid_at = new Date().toISOString();
    if (status === 'sent') update.sent_at = new Date().toISOString();
    await supabase.from('invoices').update(update).eq('id', id);
    if (business) {
      void logAudit(supabase, business.id, status === 'paid' ? 'invoice.paid' : 'invoice.sent', 'invoice', id, {
        invoice_number: rawInvoices.find(inv => inv.id === id)?.invoice_number,
      });
    }
    setRawInvoices(prev => prev.map(inv => (inv.id === id ? { ...inv, status } : inv)));
  };

  const invoices: InvoiceListItem[] = useMemo(() => rawInvoices.map(inv => {
    const pc = primaryClient(inv);
    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      status: inv.status,
      totalAmount: inv.total_amount,
      dueDate: inv.due_date,
      sentAt: inv.sent_at,
      clientNames: mapClientNames(inv),
      company: pc?.company ?? null,
      state: pc?.state ?? null,
      issueDate: inv.issue_date ?? inv.created_at?.slice(0, 10) ?? null,
      searchExtra: [
        ...(((inv as any).line_items ?? []) as { description?: string }[]).map((li: { description?: string }) => li.description ?? ''),
        ...(((inv as any).jobs ?? []) as { external_ref: string | null; title: string | null }[]).flatMap(j => [j.external_ref ?? '', j.title ?? '']),
      ].filter(Boolean).join(' '),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rawInvoices]);

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top }}>
      <InvoicesListScreen
        payPeriod={business ? { frequency: business.payroll_frequency, anchorDate: business.payroll_anchor_date, customDays: business.payroll_custom_days } : undefined}
        loading={loading}
        invoices={invoices}
        onInvoicePress={(id) => router.push(`/dashboard/facturas/${id}`)}
        onNewInvoicePress={can.createInvoice(currentRole) ? () => router.push('/dashboard/facturas/nueva' as never) : undefined}
        onPriceSheetPress={() => router.push('/dashboard/facturas/precios' as never)}
        onUpdateStatus={updateStatus}
        businessId={business?.id}
        serverMode
        serverCounts={serverCounts}
        serverTotal={serverTotal}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        onFiltersChange={handleFiltersChange}
        onBulkDelete={
          can.deleteInvoice(currentRole)
            ? (ids) =>
                new Promise<void>(resolve => {
                  if (!business) return resolve();
                  const msg = full.dashboard.invoices.confirmDeleteBulk.replace('{{count}}', String(ids.length));
                  Alert.alert('', msg, [
                    { text: full.common.buttons.cancel, style: 'cancel', onPress: () => resolve() },
                    {
                      text: full.dashboard.invoices.bulkDelete,
                      style: 'destructive',
                      onPress: async () => {
                        for (let i = 0; i < ids.length; i += 50) {
                          const chunk = ids.slice(i, i + 50);
                          // Mirror the single-delete: revert linked jobs to
                          // Completed, drop client links, then the invoices.
                          await supabase.from('jobs').update({ status: 'completed', invoice_id: null, invoiced_at: null }).in('invoice_id', chunk);
                          await supabase.from('invoice_clients').delete().in('invoice_id', chunk);
                          await supabase.from('invoices').delete().in('id', chunk);
                        }
                        void logAudit(supabase, business.id, 'invoice.deleted', 'invoice', null, { count: ids.length, bulk: true });
                        reload();
                        resolve();
                      },
                    },
                  ]);
                })
            : undefined
        }
      />
    </View>
  );
}
