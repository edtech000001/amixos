'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Clock, MapPin, User } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

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

const EVENT_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  job:         { label: 'Trabajo',     color: 'text-primary',     bg: 'bg-primary/10 border-primary/30' },
  meeting:     { label: 'Reunión',     color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200' },
  delivery:    { label: 'Entrega',     color: 'text-orange-600',  bg: 'bg-orange-50 border-orange-200' },
  follow_up:   { label: 'Seguimiento', color: 'text-violet-600',  bg: 'bg-violet-50 border-violet-200' },
  other:       { label: 'Otro',        color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200' },
};

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const EMPTY_FORM = {
  title: '', description: '', event_type: 'job', location: '', client_id: '',
  date: '', time_start: '08:00', time_end: '17:00',
};

export default function CalendarioPage() {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [today] = useState(new Date());
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
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

  // Build calendar grid
  const firstDay = cursor.getDay(); // 0=Sun
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsForDay = (d: Date) =>
    events.filter(e => sameDay(new Date(e.start_time), d));

  const openAddModal = (d: Date) => {
    setSelected(d);
    setForm({ ...EMPTY_FORM, date: d.toISOString().split('T')[0] });
    setDetailEvent(null);
    setModal(true);
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

  const prevMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const nextMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calendario</h1>
        <Button size="md" onClick={() => openAddModal(new Date())}>
          <Plus size={15} className="mr-1.5" /> Nuevo evento
        </Button>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ChevronLeft size={18} className="text-gray-600"/>
        </button>
        <h2 className="text-base font-semibold text-gray-900">
          {MONTHS_ES[cursor.getMonth()]} {cursor.getFullYear()}
        </h2>
        <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ChevronRight size={18} className="text-gray-600"/>
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAYS_ES.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400">{d}</div>
          ))}
        </div>
        {/* Cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const isToday = day ? sameDay(day, today) : false;
            const dayEvents = day ? eventsForDay(day) : [];
            return (
              <div
                key={i}
                onClick={() => day && openAddModal(day)}
                className={`min-h-[80px] p-1.5 border-b border-r border-gray-50 cursor-pointer transition-colors ${
                  day ? 'hover:bg-gray-50' : 'bg-gray-50/50'
                } ${i % 7 === 6 ? 'border-r-0' : ''}`}
              >
                {day && (
                  <>
                    <span className={`text-xs font-semibold flex items-center justify-center w-6 h-6 rounded-full mb-1 ${
                      isToday ? 'bg-primary text-white' : 'text-gray-700'
                    }`}>
                      {day.getDate()}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {dayEvents.slice(0, 3).map(ev => {
                        const t = EVENT_TYPES[ev.event_type] ?? EVENT_TYPES.other;
                        return (
                          <button
                            key={ev.id}
                            onClick={e => { e.stopPropagation(); setDetailEvent(ev); setModal(true); }}
                            className={`text-left text-xs px-1.5 py-0.5 rounded-md border truncate font-medium ${t.bg} ${t.color}`}
                          >
                            {ev.title}
                          </button>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <span className="text-xs text-gray-400 pl-1">+{dayEvents.length - 3} más</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Event type legend */}
      <div className="flex flex-wrap gap-3 mt-4">
        {Object.entries(EVENT_TYPES).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${v.bg.split(' ')[0]}`}/>
            <span className="text-xs text-gray-500">{v.label}</span>
          </div>
        ))}
      </div>

      {/* Add / Detail modal */}
      <Modal
        open={modal}
        onClose={() => { setModal(false); setDetailEvent(null); }}
        title={detailEvent ? detailEvent.title : `Nuevo evento — ${selected ? selected.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }) : ''}`}
        size="md"
      >
        {detailEvent ? (
          // Detail view
          <div className="flex flex-col gap-4">
            <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full w-fit ${EVENT_TYPES[detailEvent.event_type]?.bg} ${EVENT_TYPES[detailEvent.event_type]?.color}`}>
              {EVENT_TYPES[detailEvent.event_type]?.label ?? detailEvent.event_type}
            </div>
            {detailEvent.description && <p className="text-sm text-gray-700">{detailEvent.description}</p>}
            <div className="flex flex-col gap-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-gray-400 shrink-0"/>
                <span>
                  {new Date(detailEvent.start_time).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {' · '}
                  {new Date(detailEvent.start_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  {detailEvent.end_time && ` — ${new Date(detailEvent.end_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}
                </span>
              </div>
              {detailEvent.location && (
                <div className="flex items-center gap-2"><MapPin size={14} className="text-gray-400"/>{detailEvent.location}</div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="danger" size="sm" onClick={() => deleteEvent(detailEvent.id)}>Eliminar</Button>
              <Button variant="secondary" size="sm" onClick={() => { setModal(false); setDetailEvent(null); }}>Cerrar</Button>
            </div>
          </div>
        ) : (
          // Add form
          <div className="flex flex-col gap-4">
            <Input label="Título *" placeholder="Instalación de pivote, reunión con cliente..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Tipo</label>
              <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              <Input label="Inicio" type="time" value={form.time_start} onChange={e => setForm(f => ({ ...f, time_start: e.target.value }))} />
              <Input label="Fin" type="time" value={form.time_end} onChange={e => setForm(f => ({ ...f, time_end: e.target.value }))} />
            </div>
            <Input label="Ubicación" placeholder="Dirección o descripción del lugar" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} leftIcon={<MapPin size={14}/>} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Cliente (opcional)</label>
              <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                <option value="">Sin cliente</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Notas</label>
              <textarea rows={2} placeholder="Detalles adicionales..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"/>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => setModal(false)} fullWidth>Cancelar</Button>
              <Button onClick={saveEvent} loading={saving} fullWidth>Guardar evento</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
