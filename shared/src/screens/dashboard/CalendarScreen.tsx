import { useMemo, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
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

  const eventsForDay = (d: Date) =>
    events.filter(e => sameDay(new Date(e.startTime), d));

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="p-6">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6">
        <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
        <Pressable
          onPress={onNewEvent}
          className="flex-row items-center gap-1.5 bg-primary px-4 py-2.5 rounded-xl active:opacity-80"
        >
          <Plus size={15} color="#FFFFFF" />
          <Text className="text-sm font-semibold text-white">{t.newEvent}</Text>
        </Pressable>
      </View>

      {/* Month nav */}
      <View className="flex-row items-center justify-between mb-4">
        <Pressable onPress={onPrevMonth} className="p-2 rounded-xl active:bg-gray-100">
          <ChevronLeft size={18} color="#4B5563" />
        </Pressable>
        <Text className="text-base font-semibold text-gray-900 capitalize">{monthLabel}</Text>
        <Pressable onPress={onNextMonth} className="p-2 rounded-xl active:bg-gray-100">
          <ChevronRight size={18} color="#4B5563" />
        </Pressable>
      </View>

      {/* Calendar grid */}
      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* Day headers */}
        <View className="flex-row border-b border-gray-100">
          {dayHeaders.map((d, i) => (
            <View key={i} className="flex-1 py-2 items-center">
              <Text className="text-xs font-semibold text-gray-400 capitalize">{d}</Text>
            </View>
          ))}
        </View>
        {/* Cells — 6 rows x 7 cols */}
        {Array.from({ length: cells.length / 7 }, (_, rowIdx) => (
          <View key={rowIdx} className="flex-row">
            {cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((day, colIdx) => {
              const isToday = day ? sameDay(day, today) : false;
              const dayEvents = day ? eventsForDay(day) : [];
              return (
                <Pressable
                  key={colIdx}
                  onPress={() => day && onDayPress(day)}
                  disabled={!day}
                  className={`flex-1 min-h-[80px] p-1.5 border-b border-r border-gray-50 ${
                    !day ? 'bg-gray-50/50' : ''
                  } ${colIdx === 6 ? 'border-r-0' : ''} active:bg-gray-50`}
                >
                  {day ? (
                    <>
                      <View
                        className={`w-6 h-6 rounded-full items-center justify-center mb-1 ${
                          isToday ? 'bg-primary' : ''
                        }`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            isToday ? 'text-white' : 'text-gray-700'
                          }`}
                        >
                          {day.getDate()}
                        </Text>
                      </View>
                      <View className="gap-0.5">
                        {dayEvents.slice(0, 3).map(ev => {
                          const key = eventTypeKey(ev.eventType);
                          return (
                            <Pressable
                              key={ev.id}
                              onPress={() => onEventPress(ev)}
                              className={`px-1.5 py-0.5 rounded-md border ${EVENT_TYPE_BG[key]} ${EVENT_TYPE_BORDER[key]}`}
                            >
                              <Text
                                className={`text-xs font-medium ${EVENT_TYPE_TEXT[key]}`}
                                numberOfLines={1}
                              >
                                {ev.title}
                              </Text>
                            </Pressable>
                          );
                        })}
                        {dayEvents.length > 3 ? (
                          <Text className="text-xs text-gray-400 pl-1">
                            {t.moreCount.replace('{{count}}', String(dayEvents.length - 3))}
                          </Text>
                        ) : null}
                      </View>
                    </>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Legend */}
      <View className="flex-row flex-wrap gap-3 mt-4">
        {EVENT_TYPE_KEYS.map(k => (
          <View key={k} className="flex-row items-center gap-1.5">
            <View className={`w-2.5 h-2.5 rounded-full ${EVENT_TYPE_BG[k]}`} />
            <Text className="text-xs text-gray-500">{t.eventTypes[k]}</Text>
          </View>
        ))}
      </View>

      {modalsSlot}
    </ScrollView>
  );
}
