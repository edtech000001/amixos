'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Clock, MapPin } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/i18n/LangProvider';
import {
  CalendarScreen,
  type CalendarEvent as ScreenEvent,
} from '@amixos/shared/screens/dashboard/CalendarScreen';

interface CalEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  event_type: string;
  client_id: string | null;
}

interface Client { id: string; first_name: string; last_name: string; }

type EventTypeKey = 'job' | 'meeting' | 'delivery' | 'follow_up' | 'other';
const EVENT_TYPE_KEYS: EventTypeKey[] = ['job', 'meeting', 'delivery', 'follow_up', 'other'];

const EVENT_TYPE_STYLES: Record<EventTypeKey, { color: string; bg: string }> = {
  job:       { color: 'text-primary',    bg: 'bg-primary/10 border-primary/30' },
  meeting:   { color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  delivery:  { color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  follow_up: { color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200' },
  other:     { color: 'text-gray-600',   bg: 'bg-gray-50 border-gray-200' },
};

const EMPTY_FORM = {
  title: '', description: '', event_type: 'job', location: '', client_id: '',
  date: '', time_start: '08:00', time_end: '17:00',
};

function eventTypeStyle(key: string) {
  return EVENT_TYPE_STYLES[(key as EventTypeKey)] ?? EVENT_TYPE_STYLES.other;
}

export default function CalendarioPage() {
  const { t: full } = useLang();
  const t = full.dashboard.calendar;
  const tc = full.common;
  const dateLocale = full.dashboard.dateLocale;

  const eventTypeLabel = (key: string): string => {
    if ((EVENT_TYPE_KEYS as string[]).includes(key)) {
      return t.eventTypes[key as EventTypeKey];
    }
    return t.eventTypes.other;
  };

  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [cursor, setCursor] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<Date | null>(null);
  const [modal, setModal] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CalEvent | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadEvents = async () => {
    if (!business) return;
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString();
    const end   = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59).toISOString();
    const { data } = await supabase.from('calendar_events')
      .select('*').eq('business_id', business.id)
      .gte('start_time', start).lte('start_time', end)
      .order('start_time');
    setEvents(data ?? []);
  };

  useEffect(() => {
    if (!business) return;
    supabase.from('clients').select('id, first_name, last_name').eq('business_id', business.id).then(({ data }) => setClients(data ?? []));
  }, [business]);

  useEffect(() => { loadEvents(); }, [business, cursor]);

  const screenEvents: ScreenEvent[] = events.map(e => ({
    id: e.id,
    title: e.title,
    startTime: e.start_time,
    eventType: e.event_type,
  }));

  const openAddModal = (d: Date) => {
    setSelected(d);
    setForm({ ...EMPTY_FORM, date: d.toISOString().split('T')[0] });
    setDetailEvent(null);
    setModal(true);
  };

  const openEvent = (id: string) => {
    const ev = events.find(e => e.id === id);
    if (ev) { setDetailEvent(ev); setModal(true); }
  };

  const saveEvent = async () => {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    const start = new Date(`${form.date}T${form.time_start}`).toISOString();
    const end   = form.time_end ? new Date(`${form.date}T${form.time_end}`).toISOString() : null;
    await supabase.from('calendar_events').insert({
      business_id: business!.id,
      title: form.title,
      description: form.description || null,
      event_type: form.event_type,
      location: form.location || null,
      client_id: form.client_id || null,
      start_time: start,
      end_time: end,
    });
    await loadEvents();
    setSaving(false);
    setModal(false);
  };

  const deleteEvent = async (id: string) => {
    await supabase.from('calendar_events').delete().eq('id', id);
    setEvents(prev => prev.filter(e => e.id !== id));
    setDetailEvent(null);
  };

  const modalTitle = detailEvent
    ? detailEvent.title
    : t.modal.newEventTitle.replace(
        '{{date}}',
        selected ? selected.toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' }) : ''
      );

  const modals = (
    <Modal
      open={modal}
      onClose={() => { setModal(false); setDetailEvent(null); }}
      title={modalTitle}
      size="md"
    >
      {detailEvent ? (
        <div className="flex flex-col gap-4">
          <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full w-fit ${eventTypeStyle(detailEvent.event_type).bg} ${eventTypeStyle(detailEvent.event_type).color}`}>
            {eventTypeLabel(detailEvent.event_type)}
          </div>
          {detailEvent.description && <p className="text-sm text-gray-700">{detailEvent.description}</p>}
          <div className="flex flex-col gap-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-gray-400 shrink-0"/>
              <span>
                {new Date(detailEvent.start_time).toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
                {' · '}
                {new Date(detailEvent.start_time).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
                {detailEvent.end_time && ` — ${new Date(detailEvent.end_time).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            </div>
            {detailEvent.location && (
              <div className="flex items-center gap-2"><MapPin size={14} className="text-gray-400"/>{detailEvent.location}</div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="danger" size="sm" onClick={() => deleteEvent(detailEvent.id)}>{tc.buttons.delete}</Button>
            <Button variant="secondary" size="sm" onClick={() => { setModal(false); setDetailEvent(null); }}>{t.modal.closeBtn}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Input label={t.modal.titleLabel} placeholder={t.modal.titlePlaceholder} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.modal.typeLabel}</label>
            <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
              {EVENT_TYPE_KEYS.map(k => <option key={k} value={k}>{t.eventTypes[k]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label={t.modal.dateLabel} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <Input label={t.modal.timeStartLabel} type="time" value={form.time_start} onChange={e => setForm(f => ({ ...f, time_start: e.target.value }))} />
            <Input label={t.modal.timeEndLabel} type="time" value={form.time_end} onChange={e => setForm(f => ({ ...f, time_end: e.target.value }))} />
          </div>
          <Input label={t.modal.locationLabel} placeholder={t.modal.locationPlaceholder} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} leftIcon={<MapPin size={14}/>} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.modal.clientLabel}</label>
            <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
              <option value="">{t.modal.noClientOption}</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.modal.notesLabel}</label>
            <textarea rows={2} placeholder={t.modal.notesPlaceholder} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"/>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={saveEvent} loading={saving} fullWidth>{t.modal.saveBtn}</Button>
          </div>
        </div>
      )}
    </Modal>
  );

  return (
    <CalendarScreen
      events={screenEvents}
      cursor={cursor}
      onPrevMonth={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
      onNextMonth={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
      onDayPress={openAddModal}
      onEventPress={(ev) => openEvent(ev.id)}
      onNewEvent={() => openAddModal(new Date())}
      modalsSlot={modals}
    />
  );
}
