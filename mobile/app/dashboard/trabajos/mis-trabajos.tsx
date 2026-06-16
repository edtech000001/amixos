import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useAuthStore } from '@/lib/auth/store';
import { useLang } from '@/lib/i18n/LangProvider';
import {
  JobsListScreen,
  type JobListItem,
} from '@amixos/shared/screens/dashboard/JobsListScreen';
import { can } from '@amixos/shared/lib/permissions';

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
  total_amount: number;
  estimate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  delegated_to_business_id: string | null;
  delegated_from_business_id: string | null;
  created_at: string;
  clients: { first_name: string; last_name: string; company: string | null } | null;
  job_assignments: {
    worker_name: string | null;
    is_lead: boolean | null;
    employees: { first_name: string; last_name: string; user_id: string | null } | null;
  }[];
}

/**
 * "Mis Trabajos" — jobs where the current user is the Project Leader.
 *
 * Server-side filter would be cleaner but Supabase PostgREST doesn't let us
 * filter on a nested-relation column AND keep the parent row. We instead pull
 * jobs with their assignments + employee user_id, then filter client-side to
 * those that include a row with is_lead=true AND employees.user_id=auth uid.
 * RLS already prevents seeing jobs the user shouldn't, so the over-fetch is
 * bounded to "their scope".
 */
export default function MisTrabajosTab() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, businesses, currentRole } = useApp();
  const user = useAuthStore((s) => s.user);
  const { t: full } = useLang();
  const tMy = full.dashboard.jobs.myJobs;

  const [rawJobs, setRawJobs] = useState<RawJob[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!business || !user) return;
    const { data } = await supabase
      .from('jobs')
      .select(`
        *,
        clients(first_name, last_name, company),
        job_assignments(worker_name, is_lead, employees(first_name, last_name, user_id))
      `)
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as RawJob[];
    // Keep only jobs where the current user is the lead.
    const filtered = rows.filter((j) =>
      j.job_assignments.some(
        (a) => a.is_lead === true && a.employees?.user_id === user.id,
      ),
    );
    setRawJobs(filtered);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [business?.id, user?.id]);
  useFocusEffect(useCallback(() => { void load(); }, [business?.id, user?.id]));

  const updateStatus = async (id: string, status: string) => {
    const update: any = { status };
    if (status === 'completed') update.completed_date = new Date().toISOString().split('T')[0];
    if (status === 'sent') update.sent_at = new Date().toISOString();
    if (status === 'accepted') update.accepted_at = new Date().toISOString();
    if (status === 'declined') update.declined_at = new Date().toISOString();
    await supabase.from('jobs').update(update).eq('id', id);
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
    issueDate: j.issue_date,
    expiryDate: j.expiry_date,
    jobAddress: j.job_address,
    jobCity: j.job_city,
    jobState: j.job_state,
    invoiceId: j.invoice_id,
    clientName: j.clients ? `${j.clients.first_name} ${j.clients.last_name}` : null,
    clientCompany: j.clients?.company ?? null,
    workerNames: j.job_assignments
      .map(a => a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : a.worker_name)
      .filter((s): s is string => !!s),
    delegatedToBusinessName: j.delegated_to_business_id
      ? businesses.find(b => b.id === j.delegated_to_business_id)?.name ?? null
      : null,
    delegatedFromBusinessName: j.delegated_from_business_id
      ? businesses.find(b => b.id === j.delegated_from_business_id)?.name ?? null
      : null,
  })), [rawJobs, businesses]);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Lightweight header — this is a sub-route, not a tab. */}
      <View className="flex-row items-center px-4 pt-2 pb-1">
        <Pressable onPress={() => router.back()} hitSlop={8} className="p-2 -ml-2">
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <Text className="text-base font-semibold text-gray-900 ml-1">{tMy.title}</Text>
      </View>
      <JobsListScreen
        loading={loading}
        jobs={jobs}
        onJobPress={(id) => router.push(`/dashboard/trabajos/${id}` as never)}
        onUpdateStatus={updateStatus}
        onGenerateInvoice={() => Alert.alert('Coming soon', '')}
        onViewInvoice={(invoiceId) => router.push(`/dashboard/facturas/${invoiceId}`)}
        onNewJob={() => router.push('/dashboard/trabajos/nuevo' as never)}
        onNewProposal={() => router.push('/dashboard/trabajos/nuevo?modo=propuesta' as never)}
        canCreate={can.createJob(currentRole)}
      />
    </SafeAreaView>
  );
}
