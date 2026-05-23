import { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal as RNModal, Platform } from 'react-native';
import { Calendar, Clock } from 'lucide-react-native';
import { clsx } from 'clsx';

type Mode = 'date' | 'time' | 'datetime-local';

interface DatePickerProps {
  /** ISO date string (YYYY-MM-DD), time (HH:MM), or YYYY-MM-DDTHH:MM, depending on mode. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  mode?: Mode;
  containerClassName?: string;
}

/**
 * Universal date/time input.
 *
 * - **Web**: native `<input type="date|time|datetime-local">` — full OS picker.
 * - **iOS**: Pressable that opens an RN Modal with @react-native-community/datetimepicker
 *   in `spinner` style (scroll wheel) + Confirm/Cancel.
 * - **Android**: Pressable that opens the native dialog via `DateTimePickerAndroid.open`.
 */
export function DatePicker({
  value,
  onChange,
  label,
  placeholder,
  error,
  mode = 'date',
  containerClassName,
}: DatePickerProps) {
  return (
    <View className={clsx('flex flex-col gap-1.5', containerClassName)}>
      {label ? <Text className="text-sm font-medium text-gray-700">{label}</Text> : null}

      {Platform.OS === 'web' ? (
        // Native HTML input → OS date picker on web.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <input
          type={mode}
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          className={clsx(
            'w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary',
            error ? 'border-red-300' : 'border-gray-200',
          )}
        />
      ) : (
        <NativePicker value={value} onChange={onChange} mode={mode} placeholder={placeholder} error={error} />
      )}

      {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
    </View>
  );
}

function NativePicker({
  value,
  onChange,
  mode,
  placeholder,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  mode: Mode;
  placeholder?: string;
  error?: string;
}) {
  // Dynamic import keeps the native module out of the web bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const DateTimePickerModule = require('@react-native-community/datetimepicker');
  const DateTimePicker = DateTimePickerModule.default;
  const DateTimePickerAndroid = DateTimePickerModule.DateTimePickerAndroid;

  const [iosOpen, setIosOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<Date | null>(null);

  const displayText = useMemo(() => formatForDisplay(value, mode), [value, mode]);

  const open = () => {
    const current = parseValueToDate(value, mode);
    if (Platform.OS === 'android') {
      const androidMode = mode === 'time' ? 'time' : 'date';
      DateTimePickerAndroid.open({
        value: current,
        mode: androidMode,
        is24Hour: false,
        onChange: (event: { type: string }, selectedDate?: Date) => {
          if (event.type === 'set' && selectedDate) {
            // If the field is datetime-local, chain a time picker after the date picker.
            if (mode === 'datetime-local') {
              DateTimePickerAndroid.open({
                value: selectedDate,
                mode: 'time',
                is24Hour: false,
                onChange: (e2: { type: string }, d2?: Date) => {
                  if (e2.type === 'set' && d2) {
                    const merged = new Date(selectedDate);
                    merged.setHours(d2.getHours(), d2.getMinutes(), 0, 0);
                    onChange(formatDateToValue(merged, mode));
                  }
                },
              });
            } else {
              onChange(formatDateToValue(selectedDate, mode));
            }
          }
        },
      });
    } else {
      setIosDraft(current);
      setIosOpen(true);
    }
  };

  const Icon = mode === 'time' ? Clock : Calendar;

  return (
    <>
      <Pressable
        onPress={open}
        className={clsx(
          'flex-row items-center rounded-xl border bg-white px-4 py-2.5',
          error ? 'border-red-300' : 'border-gray-200',
        )}
      >
        <Icon size={16} color="#9CA3AF" />
        <Text
          className={clsx(
            'flex-1 pl-2 text-sm',
            displayText ? 'text-gray-900' : 'text-gray-400',
          )}
        >
          {displayText || placeholder || (mode === 'time' ? 'Hora' : 'Fecha')}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' ? (
        <RNModal
          visible={iosOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIosOpen(false)}
        >
          <Pressable
            onPress={() => setIosOpen(false)}
            className="flex-1 bg-black/40 justify-end"
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl"
            >
              <View className="flex-row justify-between items-center px-5 pt-4 pb-1">
                <Pressable onPress={() => setIosOpen(false)} hitSlop={8}>
                  <Text className="text-base text-gray-500">Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (iosDraft) onChange(formatDateToValue(iosDraft, mode));
                    setIosOpen(false);
                  }}
                  hitSlop={8}
                >
                  <Text className="text-base font-semibold text-primary">Listo</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={iosDraft ?? new Date()}
                mode={mode === 'datetime-local' ? 'datetime' : mode}
                display="spinner"
                onChange={(_e: unknown, d?: Date) => {
                  if (d) setIosDraft(d);
                }}
                style={{ height: 220 }}
              />
              <View style={{ height: 24 }} />
            </Pressable>
          </Pressable>
        </RNModal>
      ) : null}
    </>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

function parseValueToDate(value: string, mode: Mode): Date {
  if (!value) return new Date();
  if (mode === 'time') {
    const [h, m] = value.split(':').map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  }
  if (mode === 'datetime-local') {
    // Local-time interpretation
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  // mode === 'date' — interpret as local date (avoid UTC off-by-one)
  const [y, mo, d] = value.split('-').map(Number);
  if (y && mo && d) return new Date(y, mo - 1, d);
  return new Date();
}

function formatDateToValue(date: Date, mode: Mode): string {
  if (mode === 'time') return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  if (mode === 'date') return `${y}-${mo}-${d}`;
  return `${y}-${mo}-${d}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatForDisplay(value: string, mode: Mode): string {
  if (!value) return '';
  const d = parseValueToDate(value, mode);
  if (mode === 'time') {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
