import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { loadCached } from '@/lib/offline/cache';
import { queuedUpdate } from '@/lib/offline/mutate';
import { useApp } from '@/lib/AppContext';
import { LocationSwitcher } from '@/components/LocationSwitcher';
import {
  JobsListScreen,
  type JobListItem,
} from '@amixos/shared/screens/dashboard/JobsListScreen';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import { can } from '@amixos/shared/lib/permissions';
import { normalizeJobAlertThresholds } from '@amixos/shared/lib/jobAlerts';
import { logAudit } from '@amixos/shared/lib/audit';
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
  clients: { first_name: string; last_name: string; company: string | null } | null;
  job_assignments: {
    worker_name: string | null;
    is_lead: boolean | null;
    employees: { first_name: string; last_name: string } | null;
  }[];
}

function assignmentName(a: { worker_name: string | null; employees: { first_name: string; last_name: string } | null }): string | null {
  return a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : a.worker_name;
}

export default function TrabajosTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { t: full } = useLang();
  const { business, businesses, currentRole, activeLocationId } = useApp();
  const [rawJobs, setRawJobs] = useState<RawJob[]>([]);
  const [loading, setLoading] = useState(true);
  // The on-focus refresh calls a load() captured on an old render (stale
  // closure), where rawJobs was still []. Reading the list through this
  // "latest" ref keeps the empty-list fast paint from re-running on every
  // return from a detail — which would shrink the full list back to 30 rows
  // and throw away the scroll position.
  const rawJobsRef = useRef<RawJob[]>(rawJobs);
  rawJobsRef.current = rawJobs;

  // Only the columns the list actually renders/searches — `*` was hauling
  // notes, custom fields, and every timestamp for hundreds of rows.
  const JOB_LIST_SELECT = `
    id, client_id, invoice_id, title, description, status, priority,
    job_address, job_city, job_state, scheduled_date, time_start, end_date,
    estimated_hours, time_end, total_amount, estimate_number, external_ref, issue_date,
    expiry_date, delegated_to_business_id, delegated_from_business_id,
    published_to_crew, created_at, archived_at,
    clients(first_name, last_name, company),
    job_assignments(worker_name, is_lead, employees(first_name, last_name))
  `;

  // Guards against a stale slow load overwriting a newer one (e.g. branch switch).
  const loadSeqRef = useRef(0);
  const load = async () => {
    if (!business) return;
    const businessId = business.id;
    const seq = ++loadSeqRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseQuery = (): any => {
      let q = supabase.from('jobs').select(JOB_LIST_SELECT).eq('business_id', businessId);
      if (activeLocationId) q = q.eq('location_id', activeLocationId);
      return q;
    };

    // Fast first paint — the newest 30 in one small round-trip, so switching
    // to Jobs feels instant; the full set replaces it right after.
    if (rawJobsRef.current.length === 0) {
      const { data: first } = await baseQuery().order('created_at', { ascending: false }).limit(30);
      if (seq === loadSeqRef.current && first?.length) {
        setRawJobs(first as RawJob[]);
        setLoading(false);
      }
    }

    // Cached so the list (and navigation into a job) works offline. fetchAll
    // throws on error, so loadCached falls back to the last good list. The
    // active branch is part of the cache key so each branch caches separately.
    const res = await loadCached(`jobs_list_${businessId}_${activeLocationId ?? 'all'}`, () =>
      fetchAll<RawJob>((from, to) =>
        baseQuery().order('created_at', { ascending: false }).range(from, to),
      ));
    if (seq !== loadSeqRef.current) return;
    setRawJobs(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business, activeLocationId]);

  // Refresh when returning from create/edit so the new/updated job appears.
  useFocusEffect(useCallback(() => { load(); }, [business?.id, activeLocationId]));

  const updateStatus = async (id: string, status: string) => {
    const update: any = { status };
    if (status === 'completed') update.completed_date = new Date().toISOString().split('T')[0];
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
    leadName: assignmentName(
      j.job_assignments.find(a => a.is_lead) ?? { worker_name: null, employees: null },
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
        loading={loading}
        jobs={jobs}
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
                        await load();
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
              await load();
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
        onViewInvoice={(invoiceId) => router.push(`/dashboard/facturas/${invoiceId}`)}
        onNewJob={() => router.push('/dashboard/trabajos/nuevo' as never)}
        onNewProposal={() => router.push('/dashboard/trabajos/nuevo?modo=propuesta' as never)}
        canCreate={can.createJob(currentRole)}
        canCreateInvoice={can.createInvoice(currentRole)}
        canViewInvoice={can.seeInvoices(currentRole)}
        canCreateEstimates={can.createEstimate(currentRole)}
        alertThresholds={alertThresholds}
        businessId={business?.id}
      />
    </View>
  );
}
