'use client';

// Web-only CalendarScreen — plain HTML + Tailwind. The RN CalendarScreen.tsx
// renders unstyled on web (react-native-web drops NativeWind className), so this
// variant mirrors its UX with DOM elements. Same exported API + types so the web
// page wrapper is untouched and the bundler resolves this .web.tsx automatically.
// All date/layout logic is shared from calendarModel; the shared DatePicker has
// its own .web variant, so it's reused for the date/time fields.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SkeletonRow } from '../../ui/Skeleton';
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
  X,
} from 'lucide-react';
import { useLang } from '../../i18n';
import { DatePicker } from '../../ui/DatePicker';
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
  leads: CalendarClient[];
  loading?: boolean;
  onRangeChange: (start: Date, end: Date) => void;
  onFetchRange?: (start: Date, end: Date) => Promise<CalItem[]>;
  // Write callbacks are optional: omit them (e.g. a read-only role gated in the
  // wrapper) to hide all create/edit/delete affordances. onSaveEvent gates
  // create + edit; onDeleteEvent gates delete.
  onSaveEvent?: (input: CalendarEventInput, editingId: string | null) => Promise<void> | void;
  onDeleteEvent?: (id: string) => Promise<void> | void;
  onJobPress: (id: string) => void;
}

// ── Per-type visual treatment ───────────────────────────────────────────────
const TYPE_BAR: Record<CalEventType, string> = {
  job: 'bg-primary', meeting: 'bg-teal-500', delivery: 'bg-orange-500',
  reminder: 'bg-amber-500', follow_up: 'bg-violet-500', other: 'bg-gray-400',
};
const TYPE_CHIP_BG: Record<CalEventType, string> = {
  job: 'bg-primary/10', meeting: 'bg-teal-500/10', delivery: 'bg-orange-500/10',
  reminder: 'bg-amber-500/10', follow_up: 'bg-violet-500/10', other: 'bg-border-soft',
};
const TYPE_CHIP_TEXT: Record<CalEventType, string> = {
  job: 'text-primary', meeting: 'text-teal-600', delivery: 'text-orange-600',
  reminder: 'text-amber-600', follow_up: 'text-violet-600', other: 'text-muted',
};
const TYPE_HEX: Record<CalEventType, string> = {
  job: '#2563EB', meeting: '#14B8A6', delivery: '#F97316',
  reminder: '#F59E0B', follow_up: '#8B5CF6', other: '#9CA3AF',
};
const TYPE_ICON: Record<CalEventType, typeof Briefcase> = {
  job: Briefcase, meeting: Users, delivery: Truck,
  reminder: Bell, follow_up: RefreshCcw, other: CalendarDays,
};
const JOB_STATUS_BG: Record<string, string> = {
  posible: 'bg-teal-100', scheduled: 'bg-blue-100', in_progress: 'bg-amber-100',
  completed: 'bg-emerald-100', invoiced: 'bg-purple-100', cancelled: 'bg-border-soft',
};
const JOB_STATUS_TEXT: Record<string, string> = {
  posible: 'text-teal-700', scheduled: 'text-blue-700', in_progress: 'text-amber-700',
  completed: 'text-emerald-700', invoiced: 'text-purple-700', cancelled: 'text-muted',
};

function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }
function ymd(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function hm(d: Date): string { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

type CalDict = ReturnType<typeof useLang>['t']['dashboard']['calendar'];

// ── Inline DOM UI (shared RN ui components are unstyled on web) ──────────────
function WebModal({ open, onClose, title, size = 'md', children }: {
  open: boolean; onClose: () => void; title: string; size?: 'sm' | 'md' | 'lg'; children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    // Lock background scroll so the page behind doesn't move / steal wheel scroll.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-card rounded-2xl shadow-xl w-full ${w} max-h-[90vh] overflow-y-auto`}>
        <div className="sticky top-0 bg-card flex items-center justify-between px-5 py-4 border-b border-border-soft z-10">
          <h3 className="font-semibold text-ink capitalize">{title}</h3>
          <button type="button" onClick={onClose} className="text-faint hover:text-ink"><X size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, multiline }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  const cls = 'rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary';
  return (
    <div className="flex flex-col gap-1.5">
      {label ? <label className="text-sm font-medium text-ink">{label}</label> : null}
      {multiline ? (
        <textarea rows={3} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className={`${cls} resize-y`} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className={cls} />
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label ? <label className="text-sm font-medium text-ink">{label}</label> : null}
      <select value={value} onChange={e => onChange(e.target.value)}
        className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-ink">{label}</span>
      <button type="button" onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors relative ${value ? 'bg-primary' : 'bg-border'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-all ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function Btn({ variant = 'primary', onClick, disabled, loading, children, className = '' }: {
  variant?: 'primary' | 'secondary' | 'danger'; onClick?: () => void; disabled?: boolean; loading?: boolean; children: ReactNode; className?: string;
}) {
  const base = 'flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50';
  const v = variant === 'primary' ? 'bg-primary text-white hover:opacity-90'
    : variant === 'danger' ? 'bg-red-500/10 text-red-600 hover:bg-red-100'
    : 'border border-border text-ink hover:bg-surface';
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading} className={`${base} ${v} ${className}`}>
      {children}
    </button>
  );
}

function blankForm(day: Date): CalendarEventInput {
  return {
    title: '', description: '', eventType: 'meeting',
    date: ymd(day), endDate: ymd(day), allDay: false,
    timeStart: '08:00', timeEnd: '09:00', location: '', clientId: '',
  };
}
function fromItem(it: CalItem): CalendarEventInput {
  return {
    title: it.title, description: it.description ?? '', eventType: it.eventType,
    date: ymd(it.spanStart), endDate: ymd(it.spanEnd), allDay: it.allDay,
    timeStart: it.allDay ? '08:00' : hm(it.start), timeEnd: it.end ? hm(it.end) : '09:00',
    location: it.location ?? '', clientId: it.clientId ?? '',
  };
}
function whenLabel(it: CalItem, locale: string, t: CalDict): string {
  const dayPart = it.start.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  if (it.allDay) return `${dayPart} · ${t.agenda.allDay}`;
  const timePart = it.end ? `${formatTime12h(it.start)} – ${formatTime12h(it.end)}` : formatTime12h(it.start);
  return `${dayPart} · ${timePart}`;
}

export function CalendarScreen({
  items, clients, leads, loading, onRangeChange, onFetchRange, onSaveEvent, onDeleteEvent, onJobPress,
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

  const [availOpen, setAvailOpen] = useState(false);
  const [availWeek, setAvailWeek] = useState<Date>(today);
  const [availItems, setAvailItems] = useState<CalItem[]>([]);
  const [detailItem, setDetailItem] = useState<CalItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CalendarEventInput>(() => blankForm(today));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { start, end } = useMemo(() => visibleRange(view, cursor), [view, cursor]);
  const rangeKey = `${start.getTime()}-${end.getTime()}`;
  const onRangeChangeRef = useRef(onRangeChange);
  onRangeChangeRef.current = onRangeChange;
  useEffect(() => {
    onRangeChangeRef.current(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

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
    else setCursor(selectedDay);
  };
  const goToday = () => { setCursor(today); setSelectedDay(today); };
  const shift = (dir: 1 | -1) => {
    if (view === 'month') {
      const c = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
      setCursor(c); setSelectedDay(monthAnchor(c));
    } else if (view === 'week') {
      const c = addDays(cursor, dir * 7);
      setCursor(c); setSelectedDay(addDays(selectedDay, dir * 7));
    } else {
      const c = addDays(cursor, dir); setCursor(c); setSelectedDay(c);
    }
  };

  const agendaDay = view === 'day' ? cursor : selectedDay;
  // The legend doubles as type filters: all event types start enabled, so the
  // calendar shows everything by default; clicking a legend item hides that
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

  const agendaItems = useMemo(() => itemsForDay(visibleItems, agendaDay), [visibleItems, agendaDay]);

  const availDays = useMemo(() => weekDays(availWeek), [availWeek]);
  useEffect(() => {
    if (!availOpen) return;
    if (!onFetchRange) { setAvailItems(items); return; }
    let cancelled = false;
    Promise.resolve(onFetchRange(availDays[0], availDays[6])).then(res => { if (!cancelled) setAvailItems(res); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availOpen, availWeek, onFetchRange, items]);

  const availGrid = useMemo(() => {
    const jobsByDay = availDays.map(d => itemsForDay(availItems, d).filter(it => it.kind === 'job'));
    return leads.map(lead => ({
      lead,
      days: jobsByDay.map(jobs => jobs.filter(j => j.assignees.some(a => a.id === lead.id))),
    }));
  }, [availDays, availItems, leads]);

  const openAvailability = () => { setAvailWeek(agendaDay); setAvailOpen(true); };

  const navLabel = useMemo(() => {
    if (view === 'month') return cursor.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });
    if (view === 'week') {
      const d = weekDays(cursor);
      const aLabel = d[0].toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });
      const bLabel = d[6].toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
      return `${aLabel} – ${bLabel}`;
    }
    return cursor.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' });
  }, [view, cursor, dateLocale]);

  const canEdit = !!onSaveEvent;   // may create / edit events
  const canDelete = !!onDeleteEvent;
  const openNew = (day: Date) => { if (!onSaveEvent) return; setEditingId(null); setForm(blankForm(day)); setDetailItem(null); setFormOpen(true); };
  const openEdit = (it: CalItem) => { if (!onSaveEvent) return; setEditingId(it.id); setForm(fromItem(it)); setDetailItem(null); setFormOpen(true); };
  const onItemPress = (it: CalItem) => { if (it.kind === 'job') onJobPress(it.id); else setDetailItem(it); };

  const canSave = form.title.trim().length > 0 && !!form.date;
  const saveForm = async () => {
    if (!canSave || !onSaveEvent) return;
    setSaving(true);
    try {
      const normalized: CalendarEventInput = { ...form, endDate: form.endDate && form.endDate >= form.date ? form.endDate : form.date };
      await onSaveEvent(normalized, editingId);
      setFormOpen(false);
    } finally { setSaving(false); }
  };
  const removeEvent = async () => {
    if (!detailItem || !onDeleteEvent) return;
    setDeleting(true);
    try { await onDeleteEvent(detailItem.id); setDetailItem(null); } finally { setDeleting(false); }
  };

  return (
    <div className="bg-surface min-h-full">
      <div className="px-5 pt-6 pb-12 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-2xl font-bold text-ink">{t.title}</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={openAvailability}
              className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-xl hover:bg-surface">
              <Users size={15} color="#4B5563" />
              <span className="text-sm font-semibold text-muted">{t.availability.button}</span>
            </button>
            {canEdit ? (
            <button type="button" onClick={() => openNew(agendaDay)}
              className="flex items-center gap-1.5 bg-primary px-3.5 py-2 rounded-xl hover:opacity-90">
              <Plus size={15} color="#FFFFFF" />
              <span className="text-sm font-semibold text-white">{t.newEvent}</span>
            </button>
            ) : null}
          </div>
        </div>

        {/* View switcher + Today */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex bg-border-soft rounded-xl p-1">
            {(['month', 'week', 'day'] as CalView[]).map(v => {
              const active = view === v;
              return (
                <button key={v} type="button" onClick={() => switchView(v)} className={`px-3.5 py-1.5 rounded-lg ${active ? 'bg-card shadow-sm' : ''}`}>
                  <span className={`text-xs font-semibold ${active ? 'text-ink' : 'text-muted'}`}>{t.views[v]}</span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={goToday} className="px-3 py-1.5 rounded-lg border border-border hover:bg-surface">
            <span className="text-xs font-semibold text-muted">{t.today}</span>
          </button>
        </div>

        {/* Nav row */}
        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={() => shift(-1)} className="p-2 rounded-xl hover:bg-border-soft"><ChevronLeft size={18} color="#4B5563" /></button>
          <div className="text-base font-semibold text-ink capitalize">{navLabel}</div>
          <button type="button" onClick={() => shift(1)} className="p-2 rounded-xl hover:bg-border-soft"><ChevronRight size={18} color="#4B5563" /></button>
        </div>

        {/* View body */}
        {view === 'month' ? (
          <MonthGrid cursor={cursor} items={visibleItems} today={today} selectedDay={selectedDay} dateLocale={dateLocale}
            moreLabel={t.moreCount} onDayPress={setSelectedDay} onItemPress={onItemPress} />
        ) : view === 'week' ? (
          <WeekStrip cursor={cursor} items={visibleItems} today={today} selectedDay={selectedDay} dateLocale={dateLocale} onDayPress={setSelectedDay} />
        ) : null}

        {/* Legend doubles as type filters. Click to toggle a type; all start
           enabled. Disabled types dim + strike through. */}
        {view !== 'day' ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-4">
            {SELECTABLE_EVENT_TYPES.concat('job').map(k => {
              const key = k as CalEventType;
              const active = typeFilter.has(key);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleType(key)}
                  aria-pressed={active}
                  className="flex items-center gap-1.5 py-0.5 hover:opacity-70 transition-opacity"
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${active ? TYPE_BAR[key] : 'bg-gray-300'}`} />
                  <span className={`text-xs ${active ? 'text-muted' : 'text-faint line-through'}`}>
                    {t.eventTypes[key]}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Agenda */}
        <div className="mt-6">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-base font-bold text-ink capitalize">
              {agendaDay.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            {agendaItems.length > 0 ? <div className="text-xs text-faint">{t.agenda.count.replace('{{count}}', String(agendaItems.length))}</div> : null}
          </div>
          {loading && agendaItems.length === 0 ? (
            /* Events still loading: show row placeholders rather than the
               "nothing scheduled" empty state, which reads as a fact. */
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="bg-card rounded-2xl border border-border-soft">
                  <SkeletonRow />
                </div>
              ))}
            </div>
          ) : agendaItems.length === 0 ? (
            canEdit ? (
              <button type="button" onClick={() => openNew(agendaDay)}
                className="w-full flex flex-col items-center justify-center py-10 rounded-2xl border border-dashed border-border bg-surface/50 hover:bg-surface">
                <CalendarDays size={26} color="#D1D5DB" />
                <span className="text-sm text-faint mt-2">{t.agenda.empty}</span>
                <span className="text-xs text-primary font-semibold mt-1">{t.agenda.emptyAdd}</span>
              </button>
            ) : (
              <div className="w-full flex flex-col items-center justify-center py-10 rounded-2xl border border-dashed border-border bg-surface/50">
                <CalendarDays size={26} color="#D1D5DB" />
                <span className="text-sm text-faint mt-2">{t.agenda.empty}</span>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-2">
              {agendaItems.map(it => (
                <AgendaRow key={it.key} item={it} t={t}
                  jobStatusLabel={it.status ? (jobStatuses as Record<string, string>)[it.status] ?? it.status : ''}
                  onPress={() => onItemPress(it)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Availability modal */}
      <WebModal open={availOpen} onClose={() => setAvailOpen(false)} title={t.availability.title} size="lg">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setAvailWeek(addDays(availWeek, -7))} className="p-2 rounded-xl hover:bg-border-soft"><ChevronLeft size={16} color="#4B5563" /></button>
            <div className="text-sm font-semibold text-ink capitalize">
              {`${availDays[0].toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })} – ${availDays[6].toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}`}
            </div>
            <button type="button" onClick={() => setAvailWeek(addDays(availWeek, 7))} className="p-2 rounded-xl hover:bg-border-soft"><ChevronRight size={16} color="#4B5563" /></button>
          </div>
          <div className="text-xs text-faint">{t.availability.hint}</div>
          {leads.length === 0 ? (
            <div className="text-sm text-faint py-6 text-center">{t.availability.noTeam}</div>
          ) : (
            <div>
              <div className="flex items-end pb-2 border-b border-border-soft">
                <div className="w-24 shrink-0" />
                {availDays.map(d => {
                  const isToday = sameDay(d, today);
                  return (
                    <div key={d.getTime()} className="flex-1 flex flex-col items-center">
                      <span className={`text-[10px] uppercase ${isToday ? 'text-primary font-bold' : 'text-faint'}`}>{d.toLocaleDateString(dateLocale, { weekday: 'narrow' })}</span>
                      <span className={`text-xs font-semibold ${isToday ? 'text-primary' : 'text-muted'}`}>{d.getDate()}</span>
                    </div>
                  );
                })}
              </div>
              {availGrid.map(({ lead, days }) => (
                <div key={lead.id} className="flex items-center py-2 border-b border-border-soft">
                  <div className="w-24 shrink-0 flex items-center gap-1.5 pr-1 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary text-[10px] font-bold">{lead.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="text-xs font-medium text-ink truncate">{lead.name}</span>
                  </div>
                  {days.map((jobs, i) => (
                    <div key={i} className="flex-1 flex items-center justify-center">
                      {jobs.length > 0 ? (
                        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                          <span className="text-[11px] font-bold text-amber-700">{jobs.length}</span>
                        </div>
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-border" />
                      )}
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-amber-100" /><span className="text-xs text-muted">{t.availability.busy}</span></div>
                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-border" /><span className="text-xs text-muted">{t.availability.available}</span></div>
              </div>
            </div>
          )}
          <Btn variant="secondary" onClick={() => setAvailOpen(false)} className="w-full">{t.modal.closeBtn}</Btn>
        </div>
      </WebModal>

      {/* Detail modal */}
      <WebModal open={!!detailItem} onClose={() => setDetailItem(null)} title={detailItem?.title ?? ''} size="sm">
        {detailItem ? (
          <div className="flex flex-col gap-4">
            <div className={`self-start flex items-center gap-1.5 px-2.5 py-1 rounded-full ${TYPE_CHIP_BG[detailItem.eventType]}`}>
              <span className={`text-xs font-semibold ${TYPE_CHIP_TEXT[detailItem.eventType]}`}>{t.eventTypes[detailItem.eventType]}</span>
            </div>
            {detailItem.description ? <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{detailItem.description}</div> : null}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2"><Clock size={14} color="#9CA3AF" /><span className="text-sm text-muted">{whenLabel(detailItem, dateLocale, t)}</span></div>
              {detailItem.location ? <div className="flex items-center gap-2"><MapPin size={14} color="#9CA3AF" /><span className="text-sm text-muted">{detailItem.location}</span></div> : null}
            </div>
            {canEdit || canDelete ? (
              <div className="flex gap-2 pt-1">
                {canEdit ? <Btn variant="secondary" onClick={() => openEdit(detailItem)} className="flex-1"><Pencil size={14} color="#4B5563" />{tc.buttons.edit}</Btn> : null}
                {canDelete ? <Btn variant="danger" onClick={removeEvent} disabled={deleting} className="flex-1"><Trash2 size={14} color="#DC2626" />{deleting ? tc.states.saving : tc.buttons.delete}</Btn> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </WebModal>

      {/* Create / edit form modal */}
      <WebModal open={formOpen} onClose={() => setFormOpen(false)} size="md"
        title={editingId ? t.modal.editTitle : t.modal.newEventTitle.replace('{{date}}', new Date(`${form.date}T00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' }))}>
        <div className="flex flex-col gap-4">
          <TextField label={t.modal.titleLabel} placeholder={t.modal.titlePlaceholder} value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
          <SelectField label={t.modal.typeLabel} value={form.eventType} onChange={v => setForm(f => ({ ...f, eventType: v }))}
            options={SELECTABLE_EVENT_TYPES.map(k => ({ value: k, label: t.eventTypes[k] }))} />
          <ToggleField label={t.modal.allDayLabel} value={form.allDay} onChange={v => setForm(f => ({ ...f, allDay: v }))} />
          <div className="flex gap-3">
            <DatePicker label={t.modal.dateLabel} mode="date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v, endDate: f.endDate < v ? v : f.endDate }))} containerClassName="flex-1" />
            <DatePicker label={t.modal.endDateLabel} mode="date" value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} containerClassName="flex-1" />
          </div>
          {!form.allDay ? (
            <div className="flex gap-3">
              <DatePicker label={t.modal.timeStartLabel} mode="time" value={form.timeStart} onChange={v => setForm(f => ({ ...f, timeStart: v }))} containerClassName="flex-1" />
              <DatePicker label={t.modal.timeEndLabel} mode="time" value={form.timeEnd} onChange={v => setForm(f => ({ ...f, timeEnd: v }))} containerClassName="flex-1" />
            </div>
          ) : null}
          <TextField label={t.modal.locationLabel} placeholder={t.modal.locationPlaceholder} value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} />
          <SelectField label={t.modal.clientLabel} value={form.clientId} onChange={v => setForm(f => ({ ...f, clientId: v }))}
            options={[{ value: '', label: t.modal.noClientOption }, ...clients.map(c => ({ value: c.id, label: c.name }))]} />
          <TextField label={t.modal.notesLabel} placeholder={t.modal.notesPlaceholder} value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} multiline />
          <div className="flex gap-3 pt-1">
            <Btn variant="secondary" onClick={() => setFormOpen(false)} className="flex-1">{tc.buttons.cancel}</Btn>
            <Btn onClick={saveForm} loading={saving} disabled={!canSave} className="flex-1">{t.modal.saveBtn}</Btn>
          </div>
        </div>
      </WebModal>
    </div>
  );
}

// ── Agenda row ───────────────────────────────────────────────────────────────
function AgendaRow({ item, t, jobStatusLabel, onPress }: { item: CalItem; t: CalDict; jobStatusLabel: string; onPress: () => void }) {
  const Icon = TYPE_ICON[item.eventType];
  const subtitle = [item.clientName, item.location].filter(Boolean).join(' · ');
  return (
    <button type="button" onClick={onPress}
      className="w-full flex items-stretch bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden hover:bg-surface text-left">
      <div className={`w-1.5 shrink-0 ${TYPE_BAR[item.eventType]}`} />
      <div className="flex-1 flex items-center gap-3 px-3.5 py-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${TYPE_CHIP_BG[item.eventType]}`}>
          <Icon size={16} color={TYPE_HEX[item.eventType]} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink flex-1 truncate">{item.title}</span>
            {item.kind === 'job' && item.status ? (
              <span className={`px-2 py-0.5 rounded-full shrink-0 ${JOB_STATUS_BG[item.status] ?? 'bg-border-soft'}`}>
                <span className={`text-[10px] font-semibold ${JOB_STATUS_TEXT[item.status] ?? 'text-muted'}`}>{jobStatusLabel}</span>
              </span>
            ) : null}
          </div>
          <div className="text-xs text-muted mt-0.5 truncate">
            {item.allDay ? t.agenda.allDay : formatTime12h(item.start)}
            {!item.allDay && item.end ? ` – ${formatTime12h(item.end)}` : ''}
            {subtitle ? `  ·  ${subtitle}` : ''}
          </div>
          {item.kind === 'job' && item.leadName ? (
            <div className="inline-flex items-center gap-1 mt-1 bg-border-soft rounded-full pl-1 pr-2 py-0.5 max-w-full">
              <span className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center shrink-0"><UserRound size={9} color="#4F46E5" /></span>
              <span className="text-[11px] font-medium text-muted truncate">{item.leadName}</span>
            </div>
          ) : null}
        </div>
        {item.kind === 'job' ? <Chevron size={16} color="#D1D5DB" className="shrink-0" /> : null}
      </div>
    </button>
  );
}

// ── Month grid (multi-day bars packed into lanes) ────────────────────────────
const DAY_HEADER_H = 28;
const LANE_H = 18;
const BAR_H = 15;
const MAX_LANES = 3;
const ROW_MIN_H = DAY_HEADER_H + MAX_LANES * LANE_H + 14;

interface WeekSeg {
  item: CalItem; startCol: number; endCol: number; continuesLeft: boolean; continuesRight: boolean; lane: number;
}

function layOutWeek(week: Date[], items: CalItem[]): { visible: WeekSeg[]; overflow: number[] } {
  const wkStart = week[0];
  const wkEnd = week[6];
  const segs = items
    .filter(it =>
      startOfDay(it.spanStart).getTime() <= startOfDay(wkEnd).getTime() &&
      startOfDay(it.spanEnd).getTime() >= startOfDay(wkStart).getTime())
    .map(it => {
      const rawStart = daysBetween(wkStart, it.spanStart);
      const rawEnd = daysBetween(wkStart, it.spanEnd);
      return { item: it, startCol: Math.max(0, rawStart), endCol: Math.min(6, rawEnd), continuesLeft: rawStart < 0, continuesRight: rawEnd > 6, lane: -1 };
    })
    .sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol) || compareItems(a.item, b.item));

  const lanes: WeekSeg[][] = [];
  for (const seg of segs) {
    let lane = lanes.findIndex(l => l.every(s => seg.startCol > s.endCol || seg.endCol < s.startCol));
    if (lane === -1) { lane = lanes.length; lanes.push([]); }
    seg.lane = lane;
    lanes[lane].push(seg);
  }
  const overflow = Array(7).fill(0);
  for (const seg of segs) {
    if (seg.lane >= MAX_LANES) for (let c = seg.startCol; c <= seg.endCol; c++) overflow[c] += 1;
  }
  return { visible: segs.filter(s => s.lane < MAX_LANES), overflow };
}

function MonthGrid({ cursor, items, today, selectedDay, dateLocale, moreLabel, onDayPress, onItemPress }: {
  cursor: Date; items: CalItem[]; today: Date; selectedDay: Date; dateLocale: string; moreLabel: string;
  onDayPress: (d: Date) => void; onItemPress: (it: CalItem) => void;
}) {
  const weeks = useMemo(() => monthWeeks(cursor), [cursor]);
  const dayHeaders = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(dateLocale, { weekday: 'short', timeZone: 'UTC' })),
    [dateLocale],
  );
  return (
    <div className="bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden">
      <div className="flex border-b border-border-soft">
        {dayHeaders.map((d, i) => (
          <div key={i} className="flex-1 py-2 flex justify-center"><span className="text-xs font-semibold text-faint capitalize">{d}</span></div>
        ))}
      </div>
      {weeks.map((week, wIdx) => {
        const { visible, overflow } = layOutWeek(week, items);
        return (
          <div key={wIdx} style={{ position: 'relative', minHeight: ROW_MIN_H }}>
            <div className="flex" style={{ minHeight: ROW_MIN_H }}>
              {week.map((day, col) => {
                const inMonth = day.getMonth() === cursor.getMonth();
                const isToday = sameDay(day, today);
                const isSelected = sameDay(day, selectedDay);
                return (
                  <button key={col} type="button" onClick={() => onDayPress(day)}
                    className={`flex-1 flex flex-col items-start border-b border-r border-border-soft hover:bg-surface ${col === 6 ? 'border-r-0' : ''} ${isSelected ? 'bg-primary/5' : ''}`}>
                    <div className="p-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isToday ? 'bg-primary' : isSelected ? 'bg-primary/15' : ''}`}>
                        <span className={`text-xs font-semibold ${isToday ? 'text-white' : !inMonth ? 'text-faint' : isSelected ? 'text-primary' : 'text-ink'}`}>{day.getDate()}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {visible.map(seg => {
              const it = seg.item;
              return (
                <button key={it.key} type="button" onClick={() => onItemPress(it)}
                  style={{
                    position: 'absolute',
                    left: `${(seg.startCol / 7) * 100}%`,
                    width: `${((seg.endCol - seg.startCol + 1) / 7) * 100}%`,
                    top: DAY_HEADER_H + seg.lane * LANE_H,
                    height: BAR_H,
                    paddingLeft: seg.continuesLeft ? 0 : 3,
                    paddingRight: seg.continuesRight ? 0 : 3,
                    zIndex: 1,
                  }}>
                  <div className={`h-full flex items-center px-1.5 ${TYPE_BAR[it.eventType]} ${seg.continuesLeft ? '' : 'rounded-l-md'} ${seg.continuesRight ? '' : 'rounded-r-md'}`}>
                    <span className="text-[10px] font-medium text-white truncate">{it.title}</span>
                  </div>
                </button>
              );
            })}
            {overflow.map((n, col) =>
              n > 0 ? (
                <button key={`o${col}`} type="button" onClick={() => onDayPress(week[col])}
                  style={{ position: 'absolute', left: `${(col / 7) * 100}%`, width: `${(1 / 7) * 100}%`, top: DAY_HEADER_H + MAX_LANES * LANE_H }}>
                  <span className="block text-[10px] text-faint text-center truncate">{moreLabel.replace('{{count}}', String(n))}</span>
                </button>
              ) : null,
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Week strip ────────────────────────────────────────────────────────────────
function WeekStrip({ cursor, items, today, selectedDay, dateLocale, onDayPress }: {
  cursor: Date; items: CalItem[]; today: Date; selectedDay: Date; dateLocale: string; onDayPress: (d: Date) => void;
}) {
  const days = useMemo(() => weekDays(cursor), [cursor]);
  return (
    <div className="flex gap-1.5">
      {days.map(day => {
        const isToday = sameDay(day, today);
        const isSelected = sameDay(day, selectedDay);
        const count = countForDay(items, day);
        return (
          <button key={day.getTime()} type="button" onClick={() => onDayPress(day)}
            className={`flex-1 flex flex-col items-center py-2.5 rounded-2xl border hover:opacity-90 ${isSelected ? 'bg-primary border-primary' : 'bg-card border-border-soft'}`}>
            <span className={`text-[10px] font-semibold uppercase ${isSelected ? 'text-white/80' : 'text-faint'}`}>{day.toLocaleDateString(dateLocale, { weekday: 'short' })}</span>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center mt-1 ${isToday && !isSelected ? 'bg-primary/15' : ''}`}>
              <span className={`text-sm font-bold ${isSelected ? 'text-white' : isToday ? 'text-primary' : 'text-ink'}`}>{day.getDate()}</span>
            </div>
            <div className="h-2 mt-1 flex items-center justify-center">
              {count > 0 ? <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-card' : 'bg-primary'}`} /> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
