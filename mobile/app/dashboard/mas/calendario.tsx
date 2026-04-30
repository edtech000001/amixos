import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
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

export default function CalendarioRoute() {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [cursor, setCursor] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalEvent[]>([]);

  useEffect(() => {
    if (!business) return;
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString();
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59).toISOString();
    supabase
      .from('calendar_events')
      .select('*')
      .eq('business_id', business.id)
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time')
      .then(({ data }) => setEvents(data ?? []));
  }, [business, cursor]);

  const screenEvents: ScreenEvent[] = events.map(e => ({
    id: e.id,
    title: e.title,
    startTime: e.start_time,
    eventType: e.event_type,
  }));

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <CalendarScreen
        events={screenEvents}
        cursor={cursor}
        onPrevMonth={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        onNextMonth={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
        onDayPress={() => Alert.alert('Coming soon', 'Add event from mobile not yet built')}
        onEventPress={(ev) => Alert.alert(ev.title, 'Event detail not yet built on mobile')}
        onNewEvent={() => Alert.alert('Coming soon', 'Add event from mobile not yet built')}
      />
    </SafeAreaView>
  );
}
