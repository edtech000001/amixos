import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal as RNModal } from 'react-native';
import {
  Plus,
  Search,
  ClipboardList,
  Calendar,
  MapPin,
  ChevronRight,
  CheckCircle2,
  XCircle,
  FileText,
  Users,
  ArrowRight,
  Send,
  ChevronDown,
  Building2,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Input } from '../../ui/Input';
import { formatDateLong, formatTime12h } from '../../lib/format';

export interface JobListItem {
  id: string;
  title: string;
  status: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  estimateNumber: string | null;
  totalAmount: number;
  scheduledDate: string | null;
  timeStart: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  jobAddress: string | null;
  jobCity: string | null;
  jobState: string | null;
  invoiceId: string | null;
  clientName: string | null;
  clientCompany: string | null;
  workerNames: string[];
  delegatedToBusinessName?: string | null;
  delegatedFromBusinessName?: string | null;
}

const PROPOSAL_STATUSES = ['proposal', 'sent', 'accepted', 'declined'];
const TAB_KEYS = ['all', 'propuestas', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled', 'delegated'] as const;
type TabKey = (typeof TAB_KEYS)[number];

export interface JobsListScreenProps {
  loading: boolean;
  jobs: JobListItem[];
  initialTab?: TabKey;
  onJobPress: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => Promise<void> | void;
  onGenerateInvoice: (id: string) => void;
  onViewInvoice: (invoiceId: string) => void;
  onNewJob: () => void;
  onNewProposal: () => void;
}

const STATUS_PILL_BG: Record<string, string> = {
  proposal: 'bg-gray-100',
  sent: 'bg-blue-100',
  accepted: 'bg-emerald-100',
  declined: 'bg-red-100',
  scheduled: 'bg-blue-100',
  in_progress: 'bg-amber-100',
  completed: 'bg-emerald-100',
  cancelled: 'bg-gray-100',
  invoiced: 'bg-purple-100',
};
const STATUS_PILL_TEXT: Record<string, string> = {
  proposal: 'text-gray-600',
  sent: 'text-blue-600',
  accepted: 'text-emerald-700',
  declined: 'text-red-600',
  scheduled: 'text-blue-700',
  in_progress: 'text-amber-700',
  completed: 'text-emerald-700',
  cancelled: 'text-gray-400',
  invoiced: 'text-purple-700',
};
const STATUS_DOT: Record<string, string> = {
  proposal: 'bg-gray-400',
  sent: 'bg-blue-500',
  accepted: 'bg-emerald-500',
  declined: 'bg-red-400',
  scheduled: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-gray-400',
  invoiced: 'bg-purple-500',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-gray-400',
  normal: 'text-blue-500',
  high: 'text-orange-500',
  urgent: 'text-red-500',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function isExpired(j: JobListItem) {
  return j.expiryDate && j.status === 'sent' && new Date(j.expiryDate) < new Date();
}

export function JobsListScreen({
  loading,
  jobs,
  initialTab = 'all',
  onJobPress,
  onUpdateStatus,
  onGenerateInvoice,
  onViewInvoice,
  onNewJob,
  onNewProposal,
}: JobsListScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.jobs;
  const dateLoc = full.dashboard.dateLocale;
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [newMenuOpen, setNewMenuOpen] = useState(false);

  const tw = full.dashboard.workspaces;
  const tabLabels: Record<TabKey, string> = {
    all: t.tabs.all,
    propuestas: t.tabs.proposals,
    scheduled: t.tabs.scheduled,
    in_progress: t.tabs.in_progress,
    completed: t.tabs.completed,
    invoiced: t.tabs.invoiced,
    cancelled: t.tabs.cancelled,
    delegated: tw.delegatedFilterTab,
  };

  const matchesTab = (j: JobListItem) => {
    if (tab === 'all') return true;
    if (tab === 'propuestas') return PROPOSAL_STATUSES.includes(j.status);
    if (tab === 'delegated') return !!j.delegatedToBusinessName;
    return j.status === tab;
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return jobs.filter(j => {
      const matchSearch = [
        j.title, j.estimateNumber, j.clientName, j.clientCompany, j.jobCity,
      ].filter(Boolean).join(' ').toLowerCase().includes(q);
      return matchSearch && matchesTab(j);
    });
  }, [jobs, search, tab]);

  const counts = useMemo(() =>
    TAB_KEYS.reduce((acc, k) => {
      if (k === 'all') acc[k] = jobs.length;
      else if (k === 'propuestas') acc[k] = jobs.filter(j => PROPOSAL_STATUSES.includes(j.status)).length;
      else if (k === 'delegated') acc[k] = jobs.filter(j => !!j.delegatedToBusinessName).length;
      else acc[k] = jobs.filter(j => j.status === k).length;
      return acc;
    }, {} as Record<TabKey, number>),
  [jobs]);

  const pendingValue = jobs.filter(j => j.status === 'sent' && !isExpired(j))
    .reduce((s, j) => s + j.totalAmount, 0);
  const totalRevenue = jobs.filter(j => j.status === 'completed' || j.status === 'invoiced')
    .reduce((s, j) => s + j.totalAmount, 0);
  const inProgressRevenue = jobs.filter(j => j.status === 'in_progress')
    .reduce((s, j) => s + j.totalAmount, 0);

  const renderActionBar = (job: JobListItem) => {
    const expired = isExpired(job);
    if (job.status === 'proposal') {
      return (
        <View className="flex-row items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'sent')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-blue-50">
            <Send size={11} color="#2563EB" />
            <Text className="text-xs font-semibold text-blue-600">{t.actions.markSent}</Text>
          </Pressable>
          <View className="flex-1" />
          <Pressable onPress={() => onUpdateStatus(job.id, 'cancelled')} className="px-3 py-1.5 rounded-lg active:bg-gray-50">
            <Text className="text-xs text-gray-400">{t.actions.cancel}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'sent' && !expired) {
      return (
        <View className="flex-row items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'accepted')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-emerald-50">
            <CheckCircle2 size={11} color="#059669" />
            <Text className="text-xs font-semibold text-emerald-600">{t.actions.markAccepted}</Text>
          </Pressable>
          <Pressable onPress={() => onUpdateStatus(job.id, 'declined')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-red-50">
            <XCircle size={11} color="#EF4444" />
            <Text className="text-xs font-semibold text-red-500">{t.actions.markDeclined}</Text>
          </Pressable>
          <View className="flex-1" />
          <Pressable onPress={() => onUpdateStatus(job.id, 'cancelled')} className="px-3 py-1.5 rounded-lg active:bg-gray-50">
            <Text className="text-xs text-gray-400">{t.actions.cancel}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'accepted') {
      return (
        <View className="flex-row items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'scheduled')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-blue-50">
            <Calendar size={11} color="#2563EB" />
            <Text className="text-xs font-semibold text-blue-600">{t.actions.schedule}</Text>
          </Pressable>
          <Pressable onPress={() => onGenerateInvoice(job.id)} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-purple-50">
            <FileText size={11} color="#9333EA" />
            <Text className="text-xs font-semibold text-purple-600">{t.actions.generateInvoice}</Text>
          </Pressable>
          <View className="flex-1" />
          <Pressable onPress={() => onUpdateStatus(job.id, 'cancelled')} className="px-3 py-1.5 rounded-lg active:bg-gray-50">
            <Text className="text-xs text-gray-400">{t.actions.cancel}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'scheduled') {
      return (
        <View className="flex-row items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'in_progress')} className="px-3 py-1.5 rounded-lg active:bg-amber-50">
            <Text className="text-xs font-semibold text-amber-600">{t.actions.startWork}</Text>
          </Pressable>
          <View className="flex-1" />
          <Pressable onPress={() => onUpdateStatus(job.id, 'cancelled')} className="px-3 py-1.5 rounded-lg active:bg-gray-50">
            <Text className="text-xs text-gray-400">{t.actions.cancel}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'in_progress') {
      return (
        <View className="flex-row items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'completed')} className="px-3 py-1.5 rounded-lg active:bg-emerald-50">
            <Text className="text-xs font-semibold text-emerald-600">{t.actions.markCompleted}</Text>
          </Pressable>
          <View className="flex-1" />
          <Pressable onPress={() => onUpdateStatus(job.id, 'cancelled')} className="px-3 py-1.5 rounded-lg active:bg-gray-50">
            <Text className="text-xs text-gray-400">{t.actions.cancel}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'completed') {
      return (
        <View className="border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onGenerateInvoice(job.id)} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-purple-50 self-start">
            <FileText size={12} color="#9333EA" />
            <Text className="text-xs font-semibold text-purple-600">{t.actions.generateInvoice}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'invoiced' && job.invoiceId) {
      return (
        <View className="border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onViewInvoice(job.invoiceId!)} className="flex-row items-center gap-1 self-start">
            <FileText size={12} color="#9333EA" />
            <Text className="text-xs font-semibold text-purple-600">{t.actions.viewInvoice}</Text>
            <ArrowRight size={11} color="#9333EA" />
          </Pressable>
        </View>
      );
    }
    return null;
  };

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-6 pt-6 pb-36">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-5">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            {t.countTotal.replace('{{count}}', String(jobs.length))}
            {pendingValue > 0 ? (
              <Text className="text-blue-600 font-medium">
                {' · '}{t.pendingValue.replace('{{amount}}', fmt(pendingValue))}
              </Text>
            ) : null}
            {inProgressRevenue > 0 ? (
              <Text className="text-amber-600 font-medium">
                {' · '}{t.inProgressValue.replace('{{amount}}', fmt(inProgressRevenue))}
              </Text>
            ) : null}
            {totalRevenue > 0 ? (
              <Text className="text-emerald-600 font-medium">
                {' · '}{t.completedValue.replace('{{amount}}', fmt(totalRevenue))}
              </Text>
            ) : null}
          </Text>
        </View>
        <Pressable
          onPress={() => setNewMenuOpen(true)}
          className="flex-row items-center gap-1 bg-primary px-4 py-2.5 rounded-xl active:opacity-80"
        >
          <Plus size={15} color="#FFFFFF" />
          <Text className="text-sm font-semibold text-white">{t.newDropdown.trigger}</Text>
          <ChevronDown size={14} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Search + Tabs */}
      <View className="flex-col gap-3 mb-5">
        <Input
          placeholder={t.searchPlaceholder}
          value={search}
          onChangeText={setSearch}
          leftIcon={<Search size={16} color="#9CA3AF" />}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-1 pb-1"
        >
          {TAB_KEYS.map(k => {
            const isActive = tab === k;
            return (
              <Pressable
                key={k}
                onPress={() => setTab(k)}
                className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl ${
                  isActive ? 'bg-primary' : 'bg-gray-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    isActive ? 'text-white' : 'text-gray-500'
                  }`}
                >
                  {tabLabels[k]}
                </Text>
                {counts[k] > 0 ? (
                  <View
                    className={`px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20' : 'bg-gray-200'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isActive ? 'text-white' : 'text-gray-600'
                      }`}
                    >
                      {counts[k]}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Job list */}
      {loading ? (
        <View className="items-center py-20">
          <View className="flex-row gap-1">
            {[0, 1, 2].map(i => (
              <View key={i} className="w-2 h-2 rounded-full bg-primary" />
            ))}
          </View>
        </View>
      ) : filtered.length === 0 ? (
        <View className="items-center py-20">
          <ClipboardList size={40} color="#D1D5DB" />
          <Text className="text-sm text-gray-400 mt-3">
            {search || tab !== 'all' ? t.emptyNoMatch : t.emptyAll}
          </Text>
          {!search && tab === 'all' ? (
            <Pressable onPress={onNewJob} className="mt-1">
              <Text className="text-primary text-sm font-medium">{t.createFirst}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View className="flex-col gap-3">
          {filtered.map(job => {
            const statusKey = job.status as keyof typeof t.statuses;
            const statusLabel = t.statuses[statusKey] ?? job.status;
            const pillBg = STATUS_PILL_BG[job.status] ?? 'bg-blue-100';
            const pillText = STATUS_PILL_TEXT[job.status] ?? 'text-blue-700';
            const dot = STATUS_DOT[job.status] ?? 'bg-blue-500';
            const priorityKey = job.priority as keyof typeof t.priorities;
            const priorityLabel = t.priorities[priorityKey];
            const priorityColor = PRIORITY_COLORS[job.priority] ?? 'text-blue-500';
            const expired = isExpired(job);
            const isProposal = PROPOSAL_STATUSES.includes(job.status);

            return (
              <View
                key={job.id}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
              >
                <Pressable
                  onPress={() => onJobPress(job.id)}
                  className="flex-row items-start gap-4 p-5 active:bg-gray-50"
                >
                  <View className={`w-2.5 h-2.5 rounded-full mt-1.5 ${dot}`} />

                  <View className="flex-1 min-w-0">
                    <View className="flex-row items-start justify-between gap-3 mb-1.5">
                      <View className="flex-1 min-w-0">
                        <View className="flex-row items-center gap-2">
                          {job.estimateNumber ? (
                            <Text className="text-xs font-mono text-gray-400">
                              {job.estimateNumber}
                            </Text>
                          ) : null}
                          <Text className="text-sm font-bold text-gray-900 flex-1" numberOfLines={1}>
                            {job.title}
                          </Text>
                        </View>
                        {job.clientName ? (
                          <Text className="text-xs text-gray-500 mt-0.5">
                            {job.clientName}
                            {job.clientCompany ? ` · ${job.clientCompany}` : ''}
                          </Text>
                        ) : null}
                      </View>
                      <View className="flex-row items-center gap-2">
                        {!isProposal && job.priority !== 'normal' ? (
                          <Text className={`text-xs font-semibold ${priorityColor}`}>
                            {priorityLabel}
                          </Text>
                        ) : null}
                        <View className={`px-2.5 py-1 rounded-full ${pillBg}`}>
                          <Text className={`text-xs font-semibold ${pillText}`}>
                            {statusLabel}
                          </Text>
                        </View>
                        {expired ? (
                          <Text className="text-xs text-orange-500 font-medium">{t.expired}</Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Meta row */}
                    <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
                      {isProposal && job.issueDate ? (
                        <View className="flex-row items-center gap-1">
                          <Calendar size={12} color="#9CA3AF" />
                          <Text className="text-xs text-gray-400">
                            {formatDateLong(job.issueDate, dateLoc)}
                            {job.expiryDate
                              ? ` · ${t.dueShort.replace('{{date}}', formatDateLong(job.expiryDate, dateLoc))}`
                              : ''}
                          </Text>
                        </View>
                      ) : null}
                      {!isProposal && job.scheduledDate ? (
                        <View className="flex-row items-center gap-1">
                          <Calendar size={12} color="#9CA3AF" />
                          <Text className="text-xs text-gray-400">
                            {formatDateLong(job.scheduledDate, dateLoc)}
                            {job.timeStart ? ` · ${formatTime12h(job.timeStart)}` : ''}
                          </Text>
                        </View>
                      ) : null}
                      {job.jobCity || job.jobAddress ? (
                        <View className="flex-row items-center gap-1">
                          <MapPin size={12} color="#9CA3AF" />
                          <Text className="text-xs text-gray-400">
                            {job.jobCity || job.jobAddress}
                            {job.jobState ? `, ${job.jobState}` : ''}
                          </Text>
                        </View>
                      ) : null}
                      {job.workerNames.length > 0 ? (
                        <View className="flex-row items-center gap-1">
                          <Users size={12} color="#9CA3AF" />
                          <Text className="text-xs text-gray-400">
                            {job.workerNames.slice(0, 2).join(', ')}
                            {job.workerNames.length > 2 ? ` +${job.workerNames.length - 2}` : ''}
                          </Text>
                        </View>
                      ) : null}
                      {job.totalAmount > 0 ? (
                        <Text className="text-xs font-bold text-gray-700">
                          {fmt(job.totalAmount)}
                        </Text>
                      ) : null}
                      {job.delegatedToBusinessName ? (
                        <View className="flex-row items-center gap-1">
                          <Building2 size={12} color="#9333EA" />
                          <Text className="text-xs font-semibold text-purple-600">
                            {tw.delegatedBadge.replace('{{name}}', job.delegatedToBusinessName)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <ChevronRight size={16} color="#9CA3AF" />
                </Pressable>

                {renderActionBar(job)}
              </View>
            );
          })}
        </View>
      )}

      {/* New job/proposal action sheet */}
      <RNModal
        visible={newMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNewMenuOpen(false)}
      >
        <Pressable
          onPress={() => setNewMenuOpen(false)}
          className="flex-1 bg-black/40 items-center justify-center px-6"
        >
          <View className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
            <Pressable
              onPress={() => { setNewMenuOpen(false); onNewJob(); }}
              className="flex-row items-center gap-3 px-5 py-4 active:bg-gray-50 border-b border-gray-50"
            >
              <ClipboardList size={18} color="#6B7280" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-gray-900">{t.newDropdown.jobOption}</Text>
                <Text className="text-xs text-gray-400">{t.newDropdown.jobOptionSub}</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => { setNewMenuOpen(false); onNewProposal(); }}
              className="flex-row items-center gap-3 px-5 py-4 active:bg-gray-50"
            >
              <FileText size={18} color="#6B7280" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-gray-900">
                  {t.newDropdown.proposalOption}
                </Text>
                <Text className="text-xs text-gray-400">{t.newDropdown.proposalOptionSub}</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </RNModal>
    </ScrollView>
  );
}
