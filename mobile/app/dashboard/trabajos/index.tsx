import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { loadCached } from '@/lib/offline/cache';
import { queuedUpdate } from '@/lib/offline/mutate';
import { useApp } from '@/lib/AppContext';
import {
  JobsListScreen,
  type JobListItem,
} from '@amixos/shared/screens/dashboard/JobsListScreen';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import { can } from '@amixos/shared/lib/permissions';
import { normalizeJobAlertThresholds } from '@amixos/shared/lib/jobAlerts';
import { createInvoiceFromJobs } from '@amixos/shared/lib/invoicing';
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
  issue_date: string | null;
  expiry_date: string | null;
  delegated_to_business_id: string | null;
  delegated_from_business_id: string | null;
  published_to_crew: boolean;
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
  const { business, businesses, currentRole } = useApp();
  const [rawJobs, setRawJobs] = useState<RawJob[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!business) return;
    const businessId = business.id;
    // Cached so the list (and navigation into a job) works offline. fetchAll
    // throws on error, so loadCached falls back to the last good list.
    const res = await loadCached(`jobs_list_${businessId}`, () =>
      fetchAll<RawJob>((from, to) =>
        supabase
          .from('jobs')
          .select(`
            *,
            clients(first_name, last_name, company),
            job_assignments(worker_name, is_lead, employees(first_name, last_name))
          `)
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .range(from, to)));
    setRawJobs(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

  // Refresh when returning from create/edit so the new/updated job appears.
  useFocusEffect(useCallback(() => { load(); }, [business?.id]));

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
  })), [rawJobs, businesses]);

  const alertThresholds = useMemo(
    () => normalizeJobAlertThresholds(business?.job_alert_thresholds),
    [business?.job_alert_thresholds],
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB', paddingTop: insets.top }}>
      <JobsListScreen
        loading={loading}
        jobs={jobs}
        onJobPress={(id) => router.push(`/dashboard/trabajos/${id}` as never)}
        onUpdateStatus={updateStatus}
        onGenerateInvoice={(id) => router.push(`/dashboard/trabajos/${id}` as never)}
        onCreateInvoice={async (jobIds) => {
          if (!business) return;
          const jt = full.dashboard.jobs.new;
          const res = await createInvoiceFromJobs(supabase, {
            businessId: business.id,
            jobIds,
            invoiceTemplate: business.invoice_template,
            startNumber: business.invoice_start_number,
            hideItemTypes: business.job_item_types_enabled === false,
            itemTypeLabels: {
              labor: jt.itemTypeLabor,
              material: jt.itemTypeMaterial,
              equipment: jt.itemTypeEquipment,
              other: jt.itemTypeOther,
            },
            notesLabel: full.dashboard.sidebar.trabajos,
          });
          if (res.ok) {
            router.push(`/dashboard/facturas/${res.invoice.id}`);
            return;
          }
          if ('error' in res && res.error === 'multiple_clients') {
            Alert.alert('', full.dashboard.jobs.batchInvoice.sameClientHint);
          }
        }}
        onViewInvoice={(invoiceId) => router.push(`/dashboard/facturas/${invoiceId}`)}
        onNewJob={() => router.push('/dashboard/trabajos/nuevo' as never)}
        onNewProposal={() => router.push('/dashboard/trabajos/nuevo?modo=propuesta' as never)}
        canCreate={can.createJob(currentRole)}
        alertThresholds={alertThresholds}
        businessId={business?.id}
      />
    </View>
  );
}
