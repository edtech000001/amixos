'use client';

// Web-only CalendarScreen — plain HTML + Tailwind. Same exported API as
// CalendarScreen.tsx so the web page wrapper is untouched and the bundler
// resolves this .web.tsx variant automatically.

import { useMemo, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useLang } from '../../i18n';

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // ISO
  eventType: string;
}

type EventTypeKey = 'job' | 'meeting' | 'delivery' | 'follow_up' | 'other';
const EVENT_TYPE_KEYS: EventTypeKey[] = ['job', 'meeting', 'delivery', 'follow_up', 'other'];

const EVENT_TYPE_BG: Record<EventTypeKey, string> = {
  job: 'bg-primary/10',
  meeting: 'bg-blue-50',
  delivery: 'bg-orange-50',
  follow_up: 'bg-violet-50',
  other: 'bg-gray-50',
};
const EVENT_TYPE_BORDER: Record<EventTypeKey, string> = {
  job: 'border-primary/30',
  meeting: 'border-blue-200',
  delivery: 'border-orange-200',
  follow_up: 'border-violet-200',
  other: 'border-gray-200',
};
const EVENT_TYPE_TEXT: Record<EventTypeKey, string> = {
  job: 'text-primary',
  meeting: 'text-blue-600',
  delivery: 'text-orange-600',
  follow_up: 'text-violet-600',
  other: 'text-gray-600',
};
const EVENT_TYPE_DOT: Record<EventTypeKey, string> = {
  job: 'bg-primary/30',
  meeting: 'bg-blue-200',
  delivery: 'bg-orange-200',
  follow_up: 'bg-violet-200',
  other: 'bg-gray-200',
};

function eventTypeKey(key: string): EventTypeKey {
  return (EVENT_TYPE_KEYS as string[]).includes(key) ? (key as EventTypeKey) : 'other';
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export interface CalendarScreenProps {
  events: CalendarEvent[];
  cursor: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onDayPress: (d: Date) => void;
  onEventPress: (e: CalendarEvent) => void;
  onNewEvent: () => void;
  modalsSlot?: ReactNode;
}

export function CalendarScreen({
  events,
  cursor,
  onPrevMonth,
  onNextMonth,
  onDayPress,
  onEventPress,
  onNewEvent,
  modalsSlot,
}: CalendarScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.calendar;
  const dateLocale = full.dashboard.dateLocale;
  const today = useMemo(() => new Date(), []);

  const firstDay = cursor.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      new Date(cursor.getFullYear(), cursor.getMonth(), i + 1),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const dayHeaders = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 7 + i));
    return d.toLocaleDateString(dateLocale, { weekday: 'short', timeZone: 'UTC' });
  });

  const monthLabel = cursor.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });

  const eventsForDay = (d: Date) => events.filter(e => sameDay(new Date(e.startTime), d));

  return (
    <div className="px-6 lg:px-8 pt-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
        <button
          type="button"
          onClick={onNewEvent}
          className="flex items-center gap-1.5 bg-primary px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          <Plus size={15} className="text-white" />
          {t.newEvent}
        </button>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={onPrevMonth} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ChevronLeft size={18} className="text-gray-600" />
        </button>
        <span className="text-base font-semibold text-gray-900 capitalize">{monthLabel}</span>
        <button type="button" onClick={onNextMonth} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ChevronRight size={18} className="text-gray-600" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {dayHeaders.map((d, i) => (
            <div key={i} className="py-2 flex items-center justify-center">
              <span className="text-xs font-semibold text-gray-400 capitalize">{d}</span>
            </div>
          ))}
        </div>
        {/* Cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const isToday = day ? sameDay(day, today) : false;
            const dayEvents = day ? eventsForDay(day) : [];
            const lastCol = idx % 7 === 6;
            return (
              <div
                key={idx}
                onClick={() => day && onDayPress(day)}
                className={`min-h-[88px] p-1.5 border-b border-gray-50 ${lastCol ? '' : 'border-r'} ${
                  day ? 'cursor-pointer hover:bg-gray-50' : 'bg-gray-50/50'
                }`}
              >
                {day ? (
                  <>
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${
                        isToday ? 'bg-primary' : ''
                      }`}
                    >
                      <span className={`text-xs font-semibold ${isToday ? 'text-white' : 'text-gray-700'}`}>
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {dayEvents.slice(0, 3).map(ev => {
                        const key = eventTypeKey(ev.eventType);
                        return (
                          <button
                            type="button"
                            key={ev.id}
                            onClick={e => { e.stopPropagation(); onEventPress(ev); }}
                            className={`px-1.5 py-0.5 rounded-md border text-left ${EVENT_TYPE_BG[key]} ${EVENT_TYPE_BORDER[key]}`}
                          >
                            <span className={`block text-xs font-medium truncate ${EVENT_TYPE_TEXT[key]}`}>
                              {ev.title}
                            </span>
                          </button>
                        );
                      })}
                      {dayEvents.length > 3 ? (
                        <span className="text-xs text-gray-400 pl-1">
                          {t.moreCount.replace('{{count}}', String(dayEvents.length - 3))}
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4">
        {EVENT_TYPE_KEYS.map(k => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${EVENT_TYPE_DOT[k]}`} />
            <span className="text-xs text-gray-500">{t.eventTypes[k]}</span>
          </div>
        ))}
      </div>

      {modalsSlot}
    </div>
  );
}
