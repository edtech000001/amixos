import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Trash2,
  Pencil,
  Briefcase,
  Users,
  Truck,
  Bell,
  RefreshCcw,
  CalendarDays,
  UserRound,
  ChevronRight as Chevron,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Modal } from '../../ui/Modal';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { DatePicker } from '../../ui/DatePicker';
import { Toggle } from '../../ui/Toggle';
import { Button } from '../../ui/Button';
import { Fab } from '../../ui/Fab';
import { formatTime12h } from '../../lib/format';
import {
  type CalItem,
  type CalEventType,
  type CalView,
  SELECTABLE_EVENT_TYPES,
  CAL_EVENT_TYPES,
  startOfDay,
  addDays,
  sameDay,
  weekDays,
  monthWeeks,
  daysBetween,
  compareItems,
  itemsForDay,
  countForDay,
  visibleRange,
} from '../../lib/calendarModel';

// ── Re-exported so the page wrappers share one source of truth ──────────────
export type { CalItem } from '../../lib/calendarModel';

export interface CalendarClient {
  id: string;
  name: string;
}

/** Flat form payload — the page wrapper turns this into a DB row. */
export interface CalendarEventInput {
  title: string;
  description: string;
  eventType: string;
  date: string; // YYYY-MM-DD (start)
  endDate: string; // YYYY-MM-DD (>= date)
  allDay: boolean;
  timeStart: string; // HH:MM
  timeEnd: string; // HH:MM
  location: string;
  clientId: string;
}

export interface CalendarScreenProps {
  items: CalItem[];
  clients: CalendarClient[];
  /** Active team members — the roster shown in the availability panel. */
  leads: CalendarClient[];
  loading?: boolean;
  /** Fires whenever the visible day-range changes; parent refetches. */
  onRangeChange: (start: Date, end: Date) => void;
  /** Fetch items for an arbitrary range without disturbing the main view —
      used by the availability panel so its week works in any calendar view. */
  onFetchRange?: (start: Date, end: Date) => Promise<CalItem[]>;
  onSaveEvent: (input: CalendarEventInput, editingId: string | null) => Promise<void> | void;
  onDeleteEvent: (id: string) => Promise<void> | void;
  onJobPress: (id: string) => void;
}

// ── Per-type visual treatment (the colored bar / chip / icon) ───────────────
const TYPE_BAR: Record<CalEventType, string> = {
  job: 'bg-primary',
  meeting: 'bg-blue-500',
  delivery: 'bg-orange-500',
  reminder: 'bg-amber-500',
  follow_up: 'bg-violet-500',
  other: 'bg-gray-400',
};
const TYPE_CHIP_BG: Record<CalEventType, string> = {
  job: 'bg-primary/10',
  meeting: 'bg-blue-50',
  delivery: 'bg-orange-50',
  reminder: 'bg-amber-50',
  follow_up: 'bg-violet-50',
  other: 'bg-gray-100',
};
const TYPE_CHIP_TEXT: Record<CalEventType, string> = {
  job: 'text-primary',
  meeting: 'text-blue-600',
  delivery: 'text-orange-600',
  reminder: 'text-amber-600',
  follow_up: 'text-violet-600',
  other: 'text-gray-600',
};
const TYPE_HEX: Record<CalEventType, string> = {
  job: '#4F46E5',
  meeting: '#3B82F6',
  delivery: '#F97316',
  reminder: '#F59E0B',
  follow_up: '#8B5CF6',
  other: '#9CA3AF',
};
const TYPE_ICON: Record<CalEventType, typeof Briefcase> = {
  job: Briefcase,
  meeting: Users,
  delivery: Truck,
  reminder: Bell,
  follow_up: RefreshCcw,
  other: CalendarDays,
};

// Kept as separate bg/text maps (not one combined string): a `text-*` class on
// a View makes NativeWind treat it as inheritable, so the chip background goes
// on the View and the color stays on the Text child.
const JOB_STATUS_BG: Record<string, string> = {
  posible: 'bg-teal-100',
  scheduled: 'bg-blue-100',
  in_progress: 'bg-amber-100',
  completed: 'bg-emerald-100',
  invoiced: 'bg-purple-100',
  cancelled: 'bg-gray-100',
};
const JOB_STATUS_TEXT: Record<string, string> = {
  posible: 'text-teal-700',
  scheduled: 'text-blue-700',
  in_progress: 'text-amber-700',
  completed: 'text-emerald-700',
  invoiced: 'text-purple-700',
  cancelled: 'text-gray-500',
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function hm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CalendarScreen({
  items,
  clients,
  leads,
  loading,
  onRangeChange,
  onFetchRange,
  onSaveEvent,
  onDeleteEvent,
  onJobPress,
}: CalendarScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.calendar;
  const tc = full.common;
  const jobStatuses = full.dashboard.jobs.statuses;
  const dateLocale = full.dashboard.dateLocale;
  const today = useMemo(() => startOfDay(new Date()), []);

  const [view, setView] = useState<CalView>('month');
  const [cursor, setCursor] = useState<Date>(today);
  const [selectedDay, setSelectedDay] = useState<Date>(today);

  // Modal state: detail (tapped an event) vs form (create / edit).
  const [availOpen, setAvailOpen] = useState(false);
  const [availWeek, setAvailWeek] = useState<Date>(today);
  const [availItems, setAvailItems] = useState<CalItem[]>([]);
  const [detailItem, setDetailItem] = useState<CalItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CalendarEventInput>(() => blankForm(today));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Visible range → parent refetch (ref keeps parent free of memoization) ──
  const { start, end } = useMemo(() => visibleRange(view, cursor), [view, cursor]);
  const rangeKey = `${start.getTime()}-${end.getTime()}`;
  const onRangeChangeRef = useRef(onRangeChange);
  onRangeChangeRef.current = onRangeChange;
  useEffect(() => {
    onRangeChangeRef.current(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const monthAnchor = (c: Date): Date => {
    if (today.getFullYear() === c.getFullYear() && today.getMonth() === c.getMonth()) return today;
    return new Date(c.getFullYear(), c.getMonth(), 1);
  };
  const weekAnchor = (c: Date): Date => {
    const days = weekDays(c);
    return days.some(d => sameDay(d, today)) ? today : days[0];
  };

  const switchView = (v: CalView) => {
    setView(v);
    if (v === 'month') setSelectedDay(monthAnchor(cursor));
    else if (v === 'week') setSelectedDay(weekAnchor(cursor));
    else {
      setCursor(selectedDay);
    }
  };

  const goToday = () => {
    setCursor(today);
    setSelectedDay(today);
  };
  const goPrev = () => shift(-1);
  const goNext = () => shift(1);
  const shift = (dir: 1 | -1) => {
    if (view === 'month') {
      const c = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
      setCursor(c);
      setSelectedDay(monthAnchor(c));
    } else if (view === 'week') {
      const c = addDays(cursor, dir * 7);
      setCursor(c);
      setSelectedDay(addDays(selectedDay, dir * 7));
    } else {
      const c = addDays(cursor, dir);
      setCursor(c);
      setSelectedDay(c);
    }
  };

  // The legend doubles as type filters: all event types start enabled, so the
  // calendar shows everything by default; tapping a legend item hides that
  // type from the grid + agenda. Not persisted — resets to all-on each open.
  const [typeFilter, setTypeFilter] = useState<Set<CalEventType>>(() => new Set(CAL_EVENT_TYPES));
  const toggleType = (ty: CalEventType) =>
    setTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(ty)) next.delete(ty);
      else next.add(ty);
      return next;
    });
  const visibleItems = useMemo(
    () => items.filter(it => typeFilter.has(it.eventType as CalEventType)),
    [items, typeFilter],
  );

  const agendaDay = view === 'day' ? cursor : selectedDay;
  const agendaItems = useMemo(() => itemsForDay(visibleItems, agendaDay), [visibleItems, agendaDay]);

  // Availability panel: a week grid of who's busy (from assigned jobs) on each
  // day. It fetches its own week so it works regardless of the main view; when
  // no fetcher is supplied it falls back to the already-loaded items.
  const availDays = useMemo(() => weekDays(availWeek), [availWeek]);
  useEffect(() => {
    if (!availOpen) return;
    if (!onFetchRange) {
      setAvailItems(items);
      return;
    }
    let cancelled = false;
    Promise.resolve(onFetchRange(availDays[0], availDays[6])).then(res => {
      if (!cancelled) setAvailItems(res);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availOpen, availWeek, onFetchRange, items]);

  // For each day in the panel week, which jobs each member is booked on.
  const availGrid = useMemo(() => {
    const jobsByDay = availDays.map(d => itemsForDay(availItems, d).filter(it => it.kind === 'job'));
    return leads.map(lead => ({
      lead,
      days: jobsByDay.map(jobs => jobs.filter(j => j.assignees.some(a => a.id === lead.id))),
    }));
  }, [availDays, availItems, leads]);

  const openAvailability = () => {
    setAvailWeek(agendaDay);
    setAvailOpen(true);
  };

  // ── Header label per view ──────────────────────────────────────────────────
  const navLabel = useMemo(() => {
    if (view === 'month') {
      return cursor.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });
    }
    if (view === 'week') {
      const d = weekDays(cursor);
      const a = d[0];
      const b = d[6];
      const aLabel = a.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });
      const bLabel = b.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
      return `${aLabel} – ${bLabel}`;
    }
    return cursor.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' });
  }, [view, cursor, dateLocale]);

  // ── Form helpers ────────────────────────────────────────────────────────────
  const openNew = (day: Date) => {
    setEditingId(null);
    setForm(blankForm(day));
    setDetailItem(null);
    setFormOpen(true);
  };
  const openEdit = (it: CalItem) => {
    setEditingId(it.id);
    setForm(fromItem(it));
    setDetailItem(null);
    setFormOpen(true);
  };
  const onItemPress = (it: CalItem) => {
    if (it.kind === 'job') onJobPress(it.id);
    else setDetailItem(it);
  };

  const canSave = form.title.trim().length > 0 && !!form.date;
  const saveForm = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const normalized: CalendarEventInput = {
        ...form,
        endDate: form.endDate && form.endDate >= form.date ? form.endDate : form.date,
      };
      await onSaveEvent(normalized, editingId);
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  };
  const removeEvent = async () => {
    if (!detailItem) return;
    setDeleting(true);
    try {
      await onDeleteEvent(detailItem.id);
      setDetailItem(null);
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-surface">
      {/* Padding lives on an inner View (not contentContainerClassName) so it
          applies on web too, where react-native-web doesn't run NativeWind. */}
      <ScrollView className="flex-1">
       <View className="px-5 pt-6 pb-36 lg:px-8">
        {/* Header — on web the add button lives here; on native the FAB
            (bottom-right, thumb reach) is the single add affordance. */}
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={openAvailability}
              className="flex-row items-center gap-1.5 border border-gray-200 px-3 py-2 rounded-xl active:bg-gray-50"
            >
              <Users size={15} color="#4B5563" />
              <Text className="text-sm font-semibold text-gray-600">{t.availability.button}</Text>
            </Pressable>
            {Platform.OS === 'web' ? (
              <Pressable
                onPress={() => openNew(agendaDay)}
                className="flex-row items-center gap-1.5 bg-primary px-3.5 py-2 rounded-xl active:opacity-90"
              >
                <Plus size={15} color="#FFFFFF" />
                <Text className="text-sm font-semibold text-white">{t.newEvent}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* View switcher + Today */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row bg-gray-100 rounded-xl p-1">
            {(['month', 'week', 'day'] as CalView[]).map(v => {
              const active = view === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => switchView(v)}
                  className={`px-3.5 py-1.5 rounded-lg ${active ? 'bg-white shadow-sm' : ''}`}
                >
                  <Text className={`text-xs font-semibold ${active ? 'text-gray-900' : 'text-gray-500'}`}>
                    {t.views[v]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={goToday}
            className="px-3 py-1.5 rounded-lg border border-gray-200 active:bg-gray-50"
          >
            <Text className="text-xs font-semibold text-gray-600">{t.today}</Text>
          </Pressable>
        </View>

        {/* Nav row */}
        <View className="flex-row items-center justify-between mb-4">
          <Pressable onPress={goPrev} className="p-2 rounded-xl active:bg-gray-100">
            <ChevronLeft size={18} color="#4B5563" />
          </Pressable>
          <Text className="text-base font-semibold text-gray-900 capitalize">{navLabel}</Text>
          <Pressable onPress={goNext} className="p-2 rounded-xl active:bg-gray-100">
            <ChevronRight size={18} color="#4B5563" />
          </Pressable>
        </View>

        {/* View body */}
        {view === 'month' ? (
          <MonthGrid
            cursor={cursor}
            items={visibleItems}
            today={today}
            selectedDay={selectedDay}
            dateLocale={dateLocale}
            moreLabel={t.moreCount}
            onDayPress={setSelectedDay}
            onItemPress={onItemPress}
          />
        ) : view === 'week' ? (
          <WeekStrip
            cursor={cursor}
            items={visibleItems}
            today={today}
            selectedDay={selectedDay}
            dateLocale={dateLocale}
            onDayPress={setSelectedDay}
          />
        ) : null}

        {/* Legend doubles as type filters (month/week only). Tap to toggle a
           type; all start enabled. Disabled types dim + strike through. */}
        {view !== 'day' ? (
          <View className="flex-row flex-wrap gap-x-3 gap-y-1.5 mt-4">
            {SELECTABLE_EVENT_TYPES.concat('job').map(k => {
              const key = k as CalEventType;
              const active = typeFilter.has(key);
              return (
                <Pressable
                  key={k}
                  onPress={() => toggleType(key)}
                  className="flex-row items-center gap-1.5 py-0.5 active:opacity-60"
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t.eventTypes[key]}
                >
                  <View className={`w-2.5 h-2.5 rounded-full ${active ? TYPE_BAR[key] : 'bg-gray-300'}`} />
                  <Text className={`text-xs ${active ? 'text-gray-500' : 'text-gray-300 line-through'}`}>
                    {t.eventTypes[key]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Agenda list for the focused day */}
        <View className="mt-6">
          <AgendaHeader day={agendaDay} count={agendaItems.length} dateLocale={dateLocale} t={t} />
          {agendaItems.length === 0 ? (
            <Pressable
              onPress={() => openNew(agendaDay)}
              className="items-center justify-center py-10 rounded-2xl border border-dashed border-gray-200 bg-white/50 active:bg-gray-50"
            >
              <CalendarDays size={26} color="#D1D5DB" />
              <Text className="text-sm text-gray-400 mt-2">{t.agenda.empty}</Text>
              <Text className="text-xs text-primary font-semibold mt-1">{t.agenda.emptyAdd}</Text>
            </Pressable>
          ) : (
            <View className="gap-2">
              {agendaItems.map(it => (
                <AgendaRow
                  key={it.key}
                  item={it}
                  t={t}
                  jobStatusLabel={it.status ? (jobStatuses as Record<string, string>)[it.status] ?? it.status : ''}
                  onPress={() => onItemPress(it)}
                />
              ))}
            </View>
          )}
        </View>
       </View>
      </ScrollView>

      {/* New event — floating button (native thumb reach; web uses header btn) */}
      {Platform.OS !== 'web' ? <Fab onPress={() => openNew(agendaDay)} /> : null}

      {/* Team availability — a week grid of who's booked (from assigned jobs),
          with its own week nav so you can scan a range at a glance. */}
      <Modal open={availOpen} onClose={() => setAvailOpen(false)} title={t.availability.title} size="lg">
        <View className="gap-3">
          {/* Week nav */}
          <View className="flex-row items-center justify-between">
            <Pressable onPress={() => setAvailWeek(addDays(availWeek, -7))} className="p-2 rounded-xl active:bg-gray-100">
              <ChevronLeft size={16} color="#4B5563" />
            </Pressable>
            <Text className="text-sm font-semibold text-gray-900 capitalize">
              {`${availDays[0].toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })} – ${availDays[6].toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}`}
            </Text>
            <Pressable onPress={() => setAvailWeek(addDays(availWeek, 7))} className="p-2 rounded-xl active:bg-gray-100">
              <ChevronRight size={16} color="#4B5563" />
            </Pressable>
          </View>
          <Text className="text-xs text-gray-400">{t.availability.hint}</Text>

          {leads.length === 0 ? (
            <Text className="text-sm text-gray-400 py-6 text-center">{t.availability.noTeam}</Text>
          ) : (
            <View>
              {/* Day header row */}
              <View className="flex-row items-end pb-2 border-b border-gray-100">
                <View className="w-24" />
                {availDays.map(d => {
                  const isToday = sameDay(d, today);
                  return (
                    <View key={d.getTime()} className="flex-1 items-center">
                      <Text className={`text-[10px] uppercase ${isToday ? 'text-primary font-bold' : 'text-gray-400'}`}>
                        {d.toLocaleDateString(dateLocale, { weekday: 'narrow' })}
                      </Text>
                      <Text className={`text-xs font-semibold ${isToday ? 'text-primary' : 'text-gray-600'}`}>
                        {d.getDate()}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {/* Member rows */}
              {availGrid.map(({ lead, days }) => (
                <View key={lead.id} className="flex-row items-center py-2 border-b border-gray-50">
                  <View className="w-24 flex-row items-center gap-1.5 pr-1">
                    <View className="w-6 h-6 rounded-full bg-primary/10 items-center justify-center">
                      <Text className="text-primary text-[10px] font-bold">{lead.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text className="text-xs font-medium text-gray-700 flex-1" numberOfLines={1}>
                      {lead.name}
                    </Text>
                  </View>
                  {days.map((jobs, i) => (
                    <View key={i} className="flex-1 items-center justify-center">
                      {jobs.length > 0 ? (
                        <View className="w-7 h-7 rounded-lg bg-amber-100 items-center justify-center">
                          <Text className="text-[11px] font-bold text-amber-700">{jobs.length}</Text>
                        </View>
                      ) : (
                        <View className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                      )}
                    </View>
                  ))}
                </View>
              ))}
              {/* Legend */}
              <View className="flex-row items-center gap-4 mt-3">
                <View className="flex-row items-center gap-1.5">
                  <View className="w-3.5 h-3.5 rounded bg-amber-100" />
                  <Text className="text-xs text-gray-500">{t.availability.busy}</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                  <Text className="text-xs text-gray-500">{t.availability.available}</Text>
                </View>
              </View>
            </View>
          )}

          <Button variant="secondary" onPress={() => setAvailOpen(false)} fullWidth>
            {t.modal.closeBtn}
          </Button>
        </View>
      </Modal>

      {/* Detail modal (events only) */}
      <Modal
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        title={detailItem?.title ?? ''}
        size="sm"
      >
        {detailItem ? (
          <View className="gap-4">
            <View
              className={`self-start flex-row items-center gap-1.5 px-2.5 py-1 rounded-full ${TYPE_CHIP_BG[detailItem.eventType]}`}
            >
              <Text className={`text-xs font-semibold ${TYPE_CHIP_TEXT[detailItem.eventType]}`}>
                {t.eventTypes[detailItem.eventType]}
              </Text>
            </View>
            {detailItem.description ? (
              <Text className="text-sm text-gray-700 leading-relaxed">{detailItem.description}</Text>
            ) : null}
            <View className="gap-2">
              <View className="flex-row items-center gap-2">
                <Clock size={14} color="#9CA3AF" />
                <Text className="text-sm text-gray-600">{whenLabel(detailItem, dateLocale, t)}</Text>
              </View>
              {detailItem.location ? (
                <View className="flex-row items-center gap-2">
                  <MapPin size={14} color="#9CA3AF" />
                  <Text className="text-sm text-gray-600">{detailItem.location}</Text>
                </View>
              ) : null}
            </View>
            <View className="flex-row gap-2 pt-1">
              <Pressable
                onPress={() => openEdit(detailItem)}
                className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 active:bg-gray-50"
              >
                <Pencil size={14} color="#4B5563" />
                <Text className="text-sm font-semibold text-gray-700">{tc.buttons.edit}</Text>
              </Pressable>
              <Pressable
                onPress={removeEvent}
                disabled={deleting}
                className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-50 active:bg-red-100"
              >
                <Trash2 size={14} color="#DC2626" />
                <Text className="text-sm font-semibold text-red-600">
                  {deleting ? tc.states.saving : tc.buttons.delete}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Modal>

      {/* Create / edit form modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={
          editingId
            ? t.modal.editTitle
            : t.modal.newEventTitle.replace(
                '{{date}}',
                new Date(`${form.date}T00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' }),
              )
        }
        size="md"
      >
        <View className="gap-4">
          <Input
            label={t.modal.titleLabel}
            placeholder={t.modal.titlePlaceholder}
            value={form.title}
            onChangeText={(v: string) => setForm(f => ({ ...f, title: v }))}
          />
          <Select
            label={t.modal.typeLabel}
            value={form.eventType}
            onValueChange={v => setForm(f => ({ ...f, eventType: v }))}
            options={SELECTABLE_EVENT_TYPES.map(k => ({ value: k, label: t.eventTypes[k] }))}
          />
          <Toggle
            label={t.modal.allDayLabel}
            value={form.allDay}
            onValueChange={v => setForm(f => ({ ...f, allDay: v }))}
          />
          <View className="flex-row gap-3">
            <DatePicker
              label={t.modal.dateLabel}
              mode="date"
              value={form.date}
              onChange={v => setForm(f => ({ ...f, date: v, endDate: f.endDate < v ? v : f.endDate }))}
              containerClassName="flex-1"
            />
            <DatePicker
              label={t.modal.endDateLabel}
              mode="date"
              value={form.endDate}
              onChange={v => setForm(f => ({ ...f, endDate: v }))}
              containerClassName="flex-1"
            />
          </View>
          {!form.allDay ? (
            <View className="flex-row gap-3">
              <DatePicker
                label={t.modal.timeStartLabel}
                mode="time"
                value={form.timeStart}
                onChange={v => setForm(f => ({ ...f, timeStart: v }))}
                containerClassName="flex-1"
              />
              <DatePicker
                label={t.modal.timeEndLabel}
                mode="time"
                value={form.timeEnd}
                onChange={v => setForm(f => ({ ...f, timeEnd: v }))}
                containerClassName="flex-1"
              />
            </View>
          ) : null}
          <Input
            label={t.modal.locationLabel}
            placeholder={t.modal.locationPlaceholder}
            value={form.location}
            onChangeText={(v: string) => setForm(f => ({ ...f, location: v }))}
          />
          <Select
            label={t.modal.clientLabel}
            value={form.clientId}
            onValueChange={v => setForm(f => ({ ...f, clientId: v }))}
            options={[{ value: '', label: t.modal.noClientOption }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
          />
          <View className="gap-2">
            <Text className="text-sm font-semibold text-gray-700">{t.modal.notesLabel}</Text>
            <Input
              placeholder={t.modal.notesPlaceholder}
              value={form.description}
              onChangeText={(v: string) => setForm(f => ({ ...f, description: v }))}
              multiline
              numberOfLines={3}
              className="h-20"
            />
          </View>
          <View className="flex-row gap-3 pt-1">
            <Button variant="secondary" onPress={() => setFormOpen(false)} className="flex-1">
              {tc.buttons.cancel}
            </Button>
            <Button onPress={saveForm} loading={saving} disabled={!canSave} className="flex-1">
              {t.modal.saveBtn}
            </Button>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type CalDict = ReturnType<typeof useLang>['t']['dashboard']['calendar'];

function blankForm(day: Date): CalendarEventInput {
  return {
    title: '',
    description: '',
    eventType: 'meeting',
    date: ymd(day),
    endDate: ymd(day),
    allDay: false,
    timeStart: '08:00',
    timeEnd: '09:00',
    location: '',
    clientId: '',
  };
}

function fromItem(it: CalItem): CalendarEventInput {
  return {
    title: it.title,
    description: it.description ?? '',
    eventType: it.eventType,
    date: ymd(it.spanStart),
    endDate: ymd(it.spanEnd),
    allDay: it.allDay,
    timeStart: it.allDay ? '08:00' : hm(it.start),
    timeEnd: it.end ? hm(it.end) : '09:00',
    location: it.location ?? '',
    clientId: it.clientId ?? '',
  };
}

function whenLabel(it: CalItem, locale: string, t: CalDict): string {
  const dayPart = it.start.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  if (it.allDay) return `${dayPart} · ${t.agenda.allDay}`;
  const timePart = it.end
    ? `${formatTime12h(it.start)} – ${formatTime12h(it.end)}`
    : formatTime12h(it.start);
  return `${dayPart} · ${timePart}`;
}

function AgendaHeader({
  day,
  count,
  dateLocale,
  t,
}: {
  day: Date;
  count: number;
  dateLocale: string;
  t: CalDict;
}) {
  const label = day.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <View className="flex-row items-baseline justify-between mb-3">
      <Text className="text-base font-bold text-gray-900 capitalize">{label}</Text>
      {count > 0 ? (
        <Text className="text-xs text-gray-400">{t.agenda.count.replace('{{count}}', String(count))}</Text>
      ) : null}
    </View>
  );
}

function AgendaRow({
  item,
  t,
  jobStatusLabel,
  onPress,
}: {
  item: CalItem;
  t: CalDict;
  jobStatusLabel: string;
  onPress: () => void;
}) {
  const Icon = TYPE_ICON[item.eventType];
  const subtitle = [item.clientName, item.location].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-stretch bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden active:bg-gray-50"
    >
      <View className={`w-1.5 ${TYPE_BAR[item.eventType]}`} />
      <View className="flex-1 flex-row items-center gap-3 px-3.5 py-3">
        <View className={`w-9 h-9 rounded-xl items-center justify-center ${TYPE_CHIP_BG[item.eventType]}`}>
          <Icon size={16} color={TYPE_HEX[item.eventType]} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-semibold text-gray-900 flex-1" numberOfLines={1}>
              {item.title}
            </Text>
            {item.kind === 'job' && item.status ? (
              <View className={`px-2 py-0.5 rounded-full ${JOB_STATUS_BG[item.status] ?? 'bg-gray-100'}`}>
                <Text className={`text-[10px] font-semibold ${JOB_STATUS_TEXT[item.status] ?? 'text-gray-500'}`}>
                  {jobStatusLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
            {item.allDay ? t.agenda.allDay : formatTime12h(item.start)}
            {!item.allDay && item.end ? ` – ${formatTime12h(item.end)}` : ''}
            {subtitle ? `  ·  ${subtitle}` : ''}
          </Text>
          {item.kind === 'job' && item.leadName ? (
            <View className="flex-row items-center gap-1 mt-1 self-start bg-gray-100 rounded-full pl-1 pr-2 py-0.5">
              <View className="w-4 h-4 rounded-full bg-primary/15 items-center justify-center">
                <UserRound size={9} color="#4F46E5" />
              </View>
              <Text className="text-[11px] font-medium text-gray-600" numberOfLines={1}>
                {item.leadName}
              </Text>
            </View>
          ) : null}
        </View>
        {item.kind === 'job' ? <Chevron size={16} color="#D1D5DB" /> : null}
      </View>
    </Pressable>
  );
}

// Month grid geometry (px). A multi-day item renders as ONE bar spanning its
// columns, packed into lanes so bars never overlap; lanes past MAX collapse
// into a per-day "+N more".
const DAY_HEADER_H = 28;
const LANE_H = 18;
const BAR_H = 15;
const MAX_LANES = 3;
const ROW_MIN_H = DAY_HEADER_H + MAX_LANES * LANE_H + 14;

interface WeekSeg {
  item: CalItem;
  startCol: number;
  endCol: number;
  continuesLeft: boolean;
  continuesRight: boolean;
  lane: number;
}

// Place a week's items into non-overlapping lanes; return the visible bars and
// the per-column overflow count (items pushed past MAX_LANES).
function layOutWeek(week: Date[], items: CalItem[]): { visible: WeekSeg[]; overflow: number[] } {
  const wkStart = week[0];
  const wkEnd = week[6];
  const segs = items
    .filter(
      it =>
        startOfDay(it.spanStart).getTime() <= startOfDay(wkEnd).getTime() &&
        startOfDay(it.spanEnd).getTime() >= startOfDay(wkStart).getTime(),
    )
    .map(it => {
      const rawStart = daysBetween(wkStart, it.spanStart);
      const rawEnd = daysBetween(wkStart, it.spanEnd);
      return {
        item: it,
        startCol: Math.max(0, rawStart),
        endCol: Math.min(6, rawEnd),
        continuesLeft: rawStart < 0,
        continuesRight: rawEnd > 6,
        lane: -1,
      };
    })
    .sort(
      (a, b) =>
        a.startCol - b.startCol ||
        b.endCol - b.startCol - (a.endCol - a.startCol) ||
        compareItems(a.item, b.item),
    );

  const lanes: WeekSeg[][] = [];
  for (const seg of segs) {
    let lane = lanes.findIndex(l => l.every(s => seg.startCol > s.endCol || seg.endCol < s.startCol));
    if (lane === -1) {
      lane = lanes.length;
      lanes.push([]);
    }
    seg.lane = lane;
    lanes[lane].push(seg);
  }

  const overflow = Array(7).fill(0);
  for (const seg of segs) {
    if (seg.lane >= MAX_LANES) {
      for (let c = seg.startCol; c <= seg.endCol; c++) overflow[c] += 1;
    }
  }
  return { visible: segs.filter(s => s.lane < MAX_LANES), overflow };
}

function MonthGrid({
  cursor,
  items,
  today,
  selectedDay,
  dateLocale,
  moreLabel,
  onDayPress,
  onItemPress,
}: {
  cursor: Date;
  items: CalItem[];
  today: Date;
  selectedDay: Date;
  dateLocale: string;
  moreLabel: string;
  onDayPress: (d: Date) => void;
  onItemPress: (it: CalItem) => void;
}) {
  const weeks = useMemo(() => monthWeeks(cursor), [cursor]);
  const dayHeaders = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(dateLocale, { weekday: 'short', timeZone: 'UTC' }),
      ),
    [dateLocale],
  );

  return (
    <View className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <View className="flex-row border-b border-gray-100">
        {dayHeaders.map((d, i) => (
          <View key={i} className="flex-1 py-2 items-center">
            <Text className="text-xs font-semibold text-gray-400 capitalize">{d}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week, wIdx) => {
        const { visible, overflow } = layOutWeek(week, items);
        return (
          <View key={wIdx} style={{ position: 'relative', minHeight: ROW_MIN_H }}>
            {/* Background day cells (handle day selection) */}
            <View className="flex-row" style={{ minHeight: ROW_MIN_H }}>
              {week.map((day, col) => {
                const inMonth = day.getMonth() === cursor.getMonth();
                const isToday = sameDay(day, today);
                const isSelected = sameDay(day, selectedDay);
                return (
                  <Pressable
                    key={col}
                    onPress={() => onDayPress(day)}
                    className={`flex-1 border-b border-r border-gray-50 active:bg-gray-50 ${col === 6 ? 'border-r-0' : ''} ${
                      !inMonth ? 'bg-gray-50/40' : isSelected ? 'bg-primary/5' : ''
                    }`}
                  >
                    <View className="p-1 items-start">
                      <View
                        className={`w-6 h-6 rounded-full items-center justify-center ${
                          isToday ? 'bg-primary' : isSelected ? 'bg-primary/15' : ''
                        }`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            isToday ? 'text-white' : !inMonth ? 'text-gray-300' : isSelected ? 'text-primary' : 'text-gray-700'
                          }`}
                        >
                          {day.getDate()}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Spanning event bars (one element per item across its days) */}
            {visible.map(seg => {
              const it = seg.item;
              return (
                <Pressable
                  key={it.key}
                  onPress={() => onItemPress(it)}
                  style={{
                    position: 'absolute',
                    left: `${(seg.startCol / 7) * 100}%`,
                    width: `${((seg.endCol - seg.startCol + 1) / 7) * 100}%`,
                    top: DAY_HEADER_H + seg.lane * LANE_H,
                    height: BAR_H,
                    paddingLeft: seg.continuesLeft ? 0 : 3,
                    paddingRight: seg.continuesRight ? 0 : 3,
                    zIndex: 1,
                  }}
                >
                  <View
                    className={`flex-1 justify-center px-1.5 ${TYPE_BAR[it.eventType]} ${
                      seg.continuesLeft ? '' : 'rounded-l-md'
                    } ${seg.continuesRight ? '' : 'rounded-r-md'}`}
                  >
                    <Text className="text-[10px] font-medium text-white" numberOfLines={1}>
                      {it.title}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            {/* Per-day overflow */}
            {overflow.map((n, col) =>
              n > 0 ? (
                <Pressable
                  key={`o${col}`}
                  onPress={() => onDayPress(week[col])}
                  style={{
                    position: 'absolute',
                    left: `${(col / 7) * 100}%`,
                    width: `${(1 / 7) * 100}%`,
                    top: DAY_HEADER_H + MAX_LANES * LANE_H,
                  }}
                >
                  <Text className="text-[10px] text-gray-400 text-center" numberOfLines={1}>
                    {moreLabel.replace('{{count}}', String(n))}
                  </Text>
                </Pressable>
              ) : null,
            )}
          </View>
        );
      })}
    </View>
  );
}

function WeekStrip({
  cursor,
  items,
  today,
  selectedDay,
  dateLocale,
  onDayPress,
}: {
  cursor: Date;
  items: CalItem[];
  today: Date;
  selectedDay: Date;
  dateLocale: string;
  onDayPress: (d: Date) => void;
}) {
  const days = useMemo(() => weekDays(cursor), [cursor]);
  return (
    <View className="flex-row gap-1.5">
      {days.map(day => {
        const isToday = sameDay(day, today);
        const isSelected = sameDay(day, selectedDay);
        const count = countForDay(items, day);
        const weekday = day.toLocaleDateString(dateLocale, { weekday: 'short' });
        return (
          <Pressable
            key={day.getTime()}
            onPress={() => onDayPress(day)}
            className={`flex-1 items-center py-2.5 rounded-2xl border active:opacity-80 ${
              isSelected ? 'bg-primary border-primary' : 'bg-white border-gray-100'
            }`}
          >
            <Text className={`text-[10px] font-semibold uppercase ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
              {weekday}
            </Text>
            <View
              className={`w-7 h-7 rounded-full items-center justify-center mt-1 ${
                isToday && !isSelected ? 'bg-primary/15' : ''
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  isSelected ? 'text-white' : isToday ? 'text-primary' : 'text-gray-800'
                }`}
              >
                {day.getDate()}
              </Text>
            </View>
            <View className="h-2 mt-1 flex-row items-center justify-center">
              {count > 0 ? (
                <View className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-primary'}`} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
