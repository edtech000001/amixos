import { todayLocalISO } from '@amixos/shared/lib/format';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, Text, Pressable, TextInput, ScrollView, Modal as RNModal } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { queuedUpdate } from '@/lib/offline/mutate';
import { useSwr } from '@amixos/shared/lib/swrCache';
import { useApp } from '@/lib/AppContext';
import { LocationSwitcher } from '@/components/LocationSwitcher';
import {
  JobsListScreen,
  type JobListItem,
} from '@amixos/shared/screens/dashboard/JobsListScreen';
import { fetchJobsPage, fetchJobsPageSorted, fetchJobTabCounts, fetchJobGroupIndex, fetchAllJobsInGroup, resolveSearchIds, LAZY_GROUP_DIMS, type JobsCursor, type JobsQueryParams, type JobGroup, type SearchIds } from '@amixos/shared/lib/jobsQuery';
import { usStateName } from '@amixos/shared/lib/usStates';
import { can } from '@amixos/shared/lib/permissions';
import { normalizeJobAlertThresholds } from '@amixos/shared/lib/jobAlerts';
import { logAudit } from '@amixos/shared/lib/audit';
import { clientPickerDisplay } from '@amixos/shared/lib/clientSearch';
import { createInvoicesFromJobs } from '@amixos/shared/lib/invoicing';
import { useLang } from '@/lib/i18n/LangProvider';

interface RawJob {
  id: string;
  client_id: string | null;
  invoice_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  job_address: string | null;
  job_city: string | null;
  job_state: string | null;
  scheduled_date: string | null;
  time_start: string | null;
  end_date: string | null;
  estimated_hours: number | null;
  total_hours: number | null;
  time_end: string | null;
  total_amount: number;
  estimate_number: string | null;
  external_ref?: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  delegated_to_business_id: string | null;
  delegated_from_business_id: string | null;
  published_to_crew: boolean;
  archived_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  clients: { first_name: string; last_name: string; company: string | null } | null;
  job_assignments: {
    worker_name: string | null;
    is_lead: boolean | null;
  }[];
}

// worker_name is denormalized on the assignment, so the list reads it directly
// — no employees join. Avoids a per-assignment RLS-triggering nested join that
// made the list time out once a business had thousands of jobs.
function assignmentName(a: { worker_name: string | null }): string | null {
  return a.worker_name;
}

export default function TrabajosTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { t: full, locale } = useLang();
  const { business, businesses, currentRole, activeLocationId } = useApp();
  const [rawJobs, setRawJobs] = useState<RawJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Only the columns the list actually renders/searches — `*` was hauling
  // notes, custom fields, and every timestamp for hundreds of rows.
  const JOB_LIST_SELECT = `
    id, client_id, invoice_id, title, description, status, priority,
    job_address, job_city, job_state, scheduled_date, time_start, end_date,
    estimated_hours, total_hours, time_end, total_amount, estimate_number, external_ref, issue_date,
    expiry_date, delegated_to_business_id, delegated_from_business_id,
    published_to_crew, created_at, updated_at, archived_at,
    clients(first_name, last_name, company),
    job_assignments(worker_name, is_lead)
  `;

  // Guards against a stale slow load overwriting a newer one (e.g. branch switch).
  const loadSeqRef = useRef(0);
  // ── Server-side pagination + SWR cache ────────────────────────────────────
  // JobsListScreen reports its search/tab/date filters via onFiltersChange.
  // The DEFAULT view (no filters, recent sort) renders instantly from the SWR
  // cache and revalidates in the background; filtered/sorted/grouped views
  // fetch live but keep the previous rows on screen (no blanking).
  const [serverCounts, setServerCounts] = useState<Record<string, number>>({});
  const [moveClientIds, setMoveClientIds] = useState<string[] | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<{ id: string; top: string; sub: string | null }[]>([]);
  const [movingClient, setMovingClient] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<JobsCursor | null>(null);
  const paramsRef = useRef<JobsQueryParams | null>(null);
  // 'page' = recent-order keyset paging; 'sorted' = server-side sort via the
  // jobs_page_ids RPC (offset paging); 'group' = lazy group index + per-group.
  const modeRef = useRef<'page' | 'sorted' | 'group'>('page');
  const sortKeyRef = useRef<string>('recent');
  const sortOffsetRef = useRef(0);
  const searchIdsRef = useRef<SearchIds | null>(null);
  const groupIndexRef = useRef<JobGroup[]>([]);
  const loadedGroupsRef = useRef(0);
  const groupByRef = useRef<string>('none');

  // ── SWR default view: instant from cache, background revalidate ───────────
  type Filters = { search: string; tabs: string[]; sortBy: string; groupBy: string; dateFrom: string | null; dateTo: string | null };
  const [filters, setFilters] = useState<Filters | null>(null);
  const isDefaultFilters = (f: Filters) =>
    !f.search && f.tabs.length === 0 && f.sortBy === 'recent' && f.groupBy === 'none' && !f.dateFrom && !f.dateTo;
  const defaultActive = !!business && !!filters && isDefaultFilters(filters);
  const swrKey = defaultActive ? `jobs_list_v2_${business.id}_${activeLocationId ?? 'all'}` : null;
  type JobsPayload = { jobs: RawJob[]; nextCursor: JobsCursor | null; counts: Record<string, number> };
  const swr = useSwr<JobsPayload>(
    swrKey,
    async () => {
      const params: JobsQueryParams = { businessId: business!.id, locationId: activeLocationId ?? null, tabs: [], search: '' };
      const [page, counts] = await Promise.all([
        fetchJobsPage<RawJob>(supabase, JOB_LIST_SELECT, { ...params, pageSize: 50 }),
        fetchJobTabCounts(supabase, params),
      ]);
      return { jobs: page.jobs, nextCursor: page.nextCursor, counts };
    },
    {
      cacheKey: swrKey,
      resetKey: `${business?.id ?? ''}_${activeLocationId ?? 'all'}`,
      focusThrottleMs: 3_000,
      // Persist only the first page — pagination past it stays network-only.
      cacheTrim: (d) => ({ ...d, jobs: d.jobs.slice(0, 50), nextCursor: null }),
    },
  );
  // Sync SWR payload into the list state whenever the default view is active.
  useEffect(() => {
    if (!swrKey || !swr.data || !business) return;
    ++loadSeqRef.current; // cancel any filtered load still in flight
    modeRef.current = 'page';
    paramsRef.current = { businessId: business.id, locationId: activeLocationId ?? null, tabs: [], search: '' };
    setRawJobs(swr.data.jobs);
    setServerCounts(swr.data.counts);
    cursorRef.current = swr.data.nextCursor;
    setHasMore(!!swr.data.nextCursor);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swr.data, swrKey]);

  // Search-id resolution runs ONCE per load and is shared by the page fetch,
  // the counts RPC, and the group index (it used to run twice).
  const resolveIds = async (params: JobsQueryParams): Promise<SearchIds | null> => {
    const term = params.search?.trim() ?? '';
    return term ? resolveSearchIds(supabase, params.businessId, term) : null;
  };

  // Filtered 'recent'-order paging (2 round trips). Previous rows stay on
  // screen while this loads — the screen only skeletons when there's nothing.
  const runQuery = async (params: JobsQueryParams) => {
    const seq = ++loadSeqRef.current;
    paramsRef.current = params;
    modeRef.current = 'page';
    setLoading(true);
    cursorRef.current = null;
    setHasMore(false);
    try {
      const ids = await resolveIds(params);
      if (seq !== loadSeqRef.current) return;
      searchIdsRef.current = ids;
      const [page, counts] = await Promise.all([
        fetchJobsPage<RawJob>(supabase, JOB_LIST_SELECT, { ...params, pageSize: 50 }, ids),
        fetchJobTabCounts(supabase, { businessId: params.businessId, locationId: params.locationId, search: params.search, dateFrom: params.dateFrom, dateTo: params.dateTo }, ids),
      ]);
      if (seq !== loadSeqRef.current) return;
      setRawJobs(page.jobs);
      cursorRef.current = page.nextCursor;
      setHasMore(!!page.nextCursor);
      setServerCounts(counts);
    } catch { /* offline / error — keep whatever's on screen */ }
    finally { if (seq === loadSeqRef.current) setLoading(false); }
  };

  // Server-side sort (status/startDate/client/company/lead) via jobs_page_ids.
  // Falls back to 'recent' paging when the tab combo can't be expressed
  // (multi-tab / delegated) — filters stay correct, order degrades to recent.
  const runSorted = async (params: JobsQueryParams, sortKey: string) => {
    const seq = ++loadSeqRef.current;
    paramsRef.current = params;
    modeRef.current = 'sorted';
    sortKeyRef.current = sortKey;
    sortOffsetRef.current = 0;
    setLoading(true);
    setHasMore(false);
    try {
      const ids = await resolveIds(params);
      if (seq !== loadSeqRef.current) return;
      searchIdsRef.current = ids;
      const [pageRes, counts] = await Promise.all([
        fetchJobsPageSorted<RawJob>(supabase, JOB_LIST_SELECT, { ...params, sortBy: sortKey, offset: 0, pageSize: 50 }, ids),
        fetchJobTabCounts(supabase, { businessId: params.businessId, locationId: params.locationId, search: params.search, dateFrom: params.dateFrom, dateTo: params.dateTo }, ids),
      ]);
      if (seq !== loadSeqRef.current) return;
      setServerCounts(counts);
      if (pageRes === null) { await runQuery(params); return; }
      setRawJobs(pageRes.jobs);
      sortOffsetRef.current = pageRes.jobs.length;
      setHasMore(pageRes.hasMore);
    } catch { /* offline / error — keep whatever's on screen */ }
    finally { if (seq === loadSeqRef.current) setLoading(false); }
  };

  // Order the group index to match groupJobs (alphabetical by displayed label,
  // empty bucket last) so groups load top-to-bottom.
  const orderGroups = (index: JobGroup[], groupBy: string): JobGroup[] => {
    const labelOf = (g: JobGroup) => (groupBy === 'state' ? usStateName(g.key, locale) : g.label);
    return index.slice().sort((a, b) => {
      const ae = a.key === '', be = b.key === '';
      if (ae !== be) return ae ? 1 : -1;
      return labelOf(a).localeCompare(labelOf(b));
    });
  };

  const loadNextGroup = async () => {
    const seq = loadSeqRef.current;
    const idx = loadedGroupsRef.current;
    const grp = groupIndexRef.current[idx];
    if (!grp || !paramsRef.current) { setHasMore(false); return; }
    setLoadingMore(true);
    try {
      const groupJobsData = await fetchAllJobsInGroup<RawJob>(supabase, JOB_LIST_SELECT, { ...paramsRef.current, groupBy: groupByRef.current, groupKey: grp.key });
      if (seq !== loadSeqRef.current) return;
      setRawJobs(prev => [...prev, ...groupJobsData]);
      loadedGroupsRef.current = idx + 1;
      setHasMore(loadedGroupsRef.current < groupIndexRef.current.length);
    } catch { /* offline / error — keep what's loaded */ }
    finally { setLoadingMore(false); }
  };

  const loadMore = async () => {
    if (loadingMore || !paramsRef.current) return;
    if (modeRef.current === 'group') { void loadNextGroup(); return; }
    const seq = loadSeqRef.current;
    if (modeRef.current === 'sorted') {
      setLoadingMore(true);
      try {
        const pageRes = await fetchJobsPageSorted<RawJob>(
          supabase, JOB_LIST_SELECT,
          { ...paramsRef.current, sortBy: sortKeyRef.current, offset: sortOffsetRef.current, pageSize: 50 },
          searchIdsRef.current,
        );
        if (seq !== loadSeqRef.current || !pageRes) return;
        setRawJobs(prev => [...prev, ...pageRes.jobs]);
        sortOffsetRef.current += pageRes.jobs.length;
        setHasMore(pageRes.hasMore);
      } catch { /* offline / error — keep what's loaded */ }
      finally { setLoadingMore(false); }
      return;
    }
    if (!cursorRef.current) return;
    setLoadingMore(true);
    try {
      const page = await fetchJobsPage<RawJob>(supabase, JOB_LIST_SELECT, { ...paramsRef.current, cursor: cursorRef.current, pageSize: 50 }, searchIdsRef.current);
      if (seq !== loadSeqRef.current) return;
      setRawJobs(prev => [...prev, ...page.jobs]);
      cursorRef.current = page.nextCursor;
      setHasMore(!!page.nextCursor);
    } catch { /* offline / error — keep what's loaded */ }
    finally { setLoadingMore(false); }
  };

  // Lazy group-by: fetch the group index, then the first group (more on scroll).
  // Falls back to load-all + client grouping when the index can't be built.
  const runGroupLazy = async (params: JobsQueryParams, groupBy: string) => {
    const seq = ++loadSeqRef.current;
    paramsRef.current = params;
    groupByRef.current = groupBy;
    modeRef.current = 'group';
    setLoading(true); setHasMore(false); cursorRef.current = null;
    try {
      const ids = await resolveIds(params);
      if (seq !== loadSeqRef.current) return;
      searchIdsRef.current = ids;
      const [index, counts] = await Promise.all([
        fetchJobGroupIndex(supabase, { businessId: params.businessId, groupBy, tabs: params.tabs, search: params.search, locationId: params.locationId, dateFrom: params.dateFrom, dateTo: params.dateTo }, ids),
        fetchJobTabCounts(supabase, { businessId: params.businessId, locationId: params.locationId, search: params.search, dateFrom: params.dateFrom, dateTo: params.dateTo }, ids),
      ]);
      if (seq !== loadSeqRef.current) return;
      setServerCounts(counts);
      if (index === null) {
        // Tab combo the index RPC can't express — stream server-sorted pages by
        // the group dimension instead; groupJobs sections them incrementally.
        await runSorted(params, groupBy === 'state' ? 'recent' : groupBy);
        return;
      }
      groupIndexRef.current = orderGroups(index, groupBy);
      loadedGroupsRef.current = 0;
      setRawJobs([]);
      await loadNextGroup();
    } catch { /* offline / error */ }
    finally { if (seq === loadSeqRef.current) setLoading(false); }
  };

  const reRun = (locationId: string | null) => {
    if (defaultActive) { swr.refresh({ force: true }); return; }
    if (!paramsRef.current) return;
    const p = { ...paramsRef.current, locationId };
    if (modeRef.current === 'group') void runGroupLazy(p, groupByRef.current);
    else if (modeRef.current === 'sorted') void runSorted(p, sortKeyRef.current);
    else void runQuery(p);
  };
  const reload = () => reRun(activeLocationId ?? null);

  // Bulk "move to client" — search clients + reassign the selected jobs.
  const loadMoveClients = async (term: string) => {
    if (!business) return;
    let q = supabase.from('clients').select('id, first_name, last_name, company').eq('business_id', business.id);
    const s = term.trim().replace(/[,()*]/g, ' ').trim();
    if (s) q = q.or(`first_name.ilike.*${s}*,last_name.ilike.*${s}*,company.ilike.*${s}*`);
    const { data } = await q.order('last_name').limit(30);
    setClientResults(((data ?? []) as { id: string; first_name: string | null; last_name: string | null; company: string | null }[])
      .map(c => ({ id: c.id, ...clientPickerDisplay(c) })));
  };
  useEffect(() => {
    if (moveClientIds === null) return;
    const h = setTimeout(() => { void loadMoveClients(clientSearch); }, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSearch, moveClientIds]);
  const doMoveClient = async (clientId: string) => {
    if (!moveClientIds?.length || !business) return;
    setMovingClient(true);
    for (let i = 0; i < moveClientIds.length; i += 50) {
      await supabase.from('jobs').update({ client_id: clientId }).in('id', moveClientIds.slice(i, i + 50));
    }
    void logAudit(supabase, business.id, 'job.updated', 'job', null, { count: moveClientIds.length, bulk: true, field: 'client_id' });
    setMovingClient(false);
    setMoveClientIds(null);
    reload();
  };
  // Re-query on branch change (location isn't part of the child's filters).
  // The default view handles this itself — its SWR key includes the branch.
  useEffect(() => {
    if (!defaultActive) reRun(activeLocationId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocationId]);
  // Revalidate when returning from create/edit — throttled, never blanking.
  useFocusEffect(useCallback(() => {
    if (defaultActive) swr.refresh();
    else reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocationId, defaultActive]));

  const handleFiltersChange = (f: Filters) => {
    if (!business) return;
    setFilters(f);
    // Default view → the SWR hook owns it (key flips non-null; cached rows
    // render immediately and a background revalidate kicks off).
    if (isDefaultFilters(f)) return;
    const params = { businessId: business.id, locationId: activeLocationId ?? null, tabs: f.tabs, search: f.search, dateFrom: f.dateFrom, dateTo: f.dateTo };
    if (f.groupBy !== 'none' && LAZY_GROUP_DIMS.includes(f.groupBy)) {
      void runGroupLazy(params, f.groupBy);
    } else if (f.groupBy === 'lead' || f.groupBy === 'company') {
      // Server-sorted stream by the group dimension — groupJobs sections it.
      void runSorted(params, f.groupBy);
    } else if (f.sortBy !== 'recent') {
      void runSorted(params, f.sortBy);
    } else {
      void runQuery(params);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const update: any = { status };
    if (status === 'completed') update.completed_date = todayLocalISO();
    if (status === 'sent') update.sent_at = new Date().toISOString();
    if (status === 'accepted') update.accepted_at = new Date().toISOString();
    if (status === 'declined') update.declined_at = new Date().toISOString();
    const title = rawJobs.find(j => j.id === id)?.title ?? '';
    try {
      await queuedUpdate({ table: 'jobs', match: { id }, payload: update, businessId: business?.id ?? null, label: `${status}: ${title}` });
    } catch {
      return; // real DB rejection — leave the row unchanged
    }
    setRawJobs(prev => prev.map(j => (j.id === id ? { ...j, ...update } : j)));
    // Keep the SWR default-view cache in step so the next open shows the change.
    swr.mutate(prev => prev ? { ...prev, jobs: prev.jobs.map(j => (j.id === id ? { ...j, ...update } : j)) } : prev);
  };

  const jobs: JobListItem[] = useMemo(() => rawJobs.map(j => ({
    id: j.id,
    title: j.title,
    status: j.status,
    priority: j.priority,
    estimateNumber: j.estimate_number,
    externalRef: j.external_ref ?? null,
    totalAmount: j.total_amount,
    scheduledDate: j.scheduled_date,
    timeStart: j.time_start,
    endDate: j.end_date,
    estimatedHours: j.estimated_hours,
    totalHours: j.total_hours,
    timeEnd: j.time_end,
    issueDate: j.issue_date,
    expiryDate: j.expiry_date,
    jobAddress: j.job_address,
    jobCity: j.job_city,
    jobState: j.job_state,
    invoiceId: j.invoice_id,
    clientId: j.client_id,
    clientName: j.clients ? `${j.clients.first_name} ${j.clients.last_name}` : null,
    clientCompany: j.clients?.company ?? null,
    workerNames: j.job_assignments
      .map(assignmentName)
      .filter((s): s is string => !!s),
    updatedAt: j.updated_at ?? null,
    leadName: assignmentName(
      j.job_assignments.find(a => a.is_lead) ?? { worker_name: null },
    ),
    delegatedToBusinessName: j.delegated_to_business_id
      ? businesses.find(b => b.id === j.delegated_to_business_id)?.name ?? null
      : null,
    delegatedFromBusinessName: j.delegated_from_business_id
      ? businesses.find(b => b.id === j.delegated_from_business_id)?.name ?? null
      : null,
    publishedToCrew: j.published_to_crew,
    archivedAt: j.archived_at ?? null,
  })), [rawJobs, businesses]);

  const alertThresholds = useMemo(
    () => normalizeJobAlertThresholds(business?.job_alert_thresholds),
    [business?.job_alert_thresholds],
  );

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top }}>
      <LocationSwitcher />
      <JobsListScreen
        loading={(loading || swr.loading) && jobs.length === 0}
        refreshing={swr.refreshing || (loading && jobs.length > 0)}
        stale={swr.stale}
        cachedAt={swr.cachedAt}
        jobs={jobs}
        payPeriod={business ? { frequency: business.payroll_frequency, anchorDate: business.payroll_anchor_date, customDays: business.payroll_custom_days } : undefined}
        onJobPress={(id) => router.push(`/dashboard/trabajos/${id}` as never)}
        onUpdateStatus={updateStatus}
        onGenerateInvoice={(id) => router.push(`/dashboard/trabajos/${id}` as never)}
        onCreateInvoice={async (jobIds) => {
          if (!business) return;
          const jt = full.dashboard.jobs.new;
          const res = await createInvoicesFromJobs(supabase, {
            businessId: business.id,
            jobIds,
            invoiceTemplate: business.invoice_template,
            startNumber: business.invoice_start_number,
            dueDays: business.invoice_due_days,
            hideItemTypes: business.job_item_types_enabled === false,
            taxRate: business.invoice_tax_rate ?? 0,
            qtyField: business.invoice_qty_field,
            itemTypeLabels: {
              labor: jt.itemTypeLabor,
              material: jt.itemTypeMaterial,
              equipment: jt.itemTypeEquipment,
              other: jt.itemTypeOther,
            },
            notesLabel: full.dashboard.sidebar.trabajos,
          });
          if (res.ok) {
            // Multiple invoices are confirmed upfront in the list screen, so
            // just route: to the invoice (single) or the list (per-client).
            if (res.invoices.length === 1) {
              router.push(`/dashboard/facturas/${res.invoices[0].id}` as never);
            } else {
              router.push('/dashboard/facturas' as never);
            }
          }
        }}
        onBulkDelete={
          can.deleteJob(currentRole)
            ? (jobIds) =>
                new Promise<void>(resolve => {
                  if (!business) return resolve();
                  const msg = full.dashboard.jobs.confirmDeleteBulk.replace('{{count}}', String(jobIds.length));
                  Alert.alert('', msg, [
                    { text: full.common.buttons.cancel, style: 'cancel', onPress: () => resolve() },
                    {
                      text: full.dashboard.jobs.bulkDelete,
                      style: 'destructive',
                      onPress: async () => {
                        // FK cascades clean job_items / job_assignments /
                        // job_photos (whose trigger removes the storage files).
                        for (let i = 0; i < jobIds.length; i += 50) {
                          await supabase.from('jobs').delete().in('id', jobIds.slice(i, i + 50));
                        }
                        void logAudit(supabase, business.id, 'job.deleted', 'job', null, { count: jobIds.length, bulk: true });
                        reload();
                        resolve();
                      },
                    },
                  ]);
                })
            : undefined
        }
        onBulkArchive={(jobIds, archive) =>
          new Promise<void>(resolve => {
            if (!business) return resolve();
            const doIt = async () => {
              for (let i = 0; i < jobIds.length; i += 50) {
                await supabase.from('jobs')
                  .update({ archived_at: archive ? new Date().toISOString() : null })
                  .in('id', jobIds.slice(i, i + 50));
              }
              void logAudit(supabase, business.id, archive ? 'job.archived' : 'job.unarchived', 'job', null, { count: jobIds.length, bulk: true });
              reload();
              resolve();
            };
            if (!archive) { void doIt(); return; }
            const msg = full.dashboard.jobs.confirmArchiveBulk.replace('{{count}}', String(jobIds.length));
            Alert.alert('', msg, [
              { text: full.common.buttons.cancel, style: 'cancel', onPress: () => resolve() },
              { text: full.dashboard.jobs.bulkArchive, onPress: () => void doIt() },
            ]);
          })
        }
        onBulkChangeClient={can.editJobMetadata(currentRole) ? (ids => { setMoveClientIds(ids); setClientSearch(''); void loadMoveClients(''); }) : undefined}
        onViewInvoice={(invoiceId) => router.push(`/dashboard/facturas/${invoiceId}`)}
        onNewJob={() => router.push('/dashboard/trabajos/nuevo' as never)}
        onNewProposal={() => router.push('/dashboard/trabajos/nuevo?modo=propuesta' as never)}
        canCreate={can.createJob(currentRole)}
        canCreateInvoice={can.createInvoice(currentRole)}
        canViewInvoice={can.seeInvoices(currentRole)}
        canCreateEstimates={can.createEstimate(currentRole)}
        alertThresholds={alertThresholds}
        businessId={business?.id}
        serverMode
        serverCounts={serverCounts}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        onFiltersChange={handleFiltersChange}
      />

      {/* Bulk move-to-client picker */}
      <RNModal visible={moveClientIds !== null} transparent animationType="slide" onRequestClose={() => setMoveClientIds(null)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setMoveClientIds(null)}>
          <Pressable className="bg-card rounded-t-3xl px-5 pt-5 pb-8" onPress={() => {}}>
            <Text className="text-lg font-bold text-ink mb-3">
              {locale === 'es' ? `Mover ${moveClientIds?.length ?? 0} trabajo(s) a…` : `Move ${moveClientIds?.length ?? 0} job(s) to…`}
            </Text>
            <TextInput
              value={clientSearch}
              onChangeText={setClientSearch}
              placeholder={locale === 'es' ? 'Buscar cliente…' : 'Search a client…'}
              placeholderTextColor="#6B7280"
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-ink mb-2"
            />
            {/* Fixed height so the sheet doesn't resize as results change. */}
            <ScrollView style={{ height: 320 }}>
              {clientResults.length === 0 ? (
                <Text className="text-sm text-faint px-1 py-2">{locale === 'es' ? 'Sin resultados.' : 'No results.'}</Text>
              ) : clientResults.map(cl => (
                <Pressable key={cl.id} disabled={movingClient} onPress={() => void doMoveClient(cl.id)} className="px-3 py-3 rounded-xl active:bg-surface">
                  <Text className="text-sm text-ink"><Text className="font-medium">{cl.top}</Text>{cl.sub ? <Text className="text-faint">{`  ·  ${cl.sub}`}</Text> : null}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </RNModal>
    </View>
  );
}
