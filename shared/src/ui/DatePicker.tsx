import { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal as RNModal, Platform } from 'react-native';
import { Calendar, Clock } from 'lucide-react-native';
import { clsx } from 'clsx';
import { useLang } from '../i18n/context';
import { formatTime12h } from '../lib/format';

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
  /**
   * 'ghost' renders the trigger as plain tappable text (no border/box), for
   * inline use like the operating-hours rows. Default keeps the bordered input.
   */
  variant?: 'default' | 'ghost';
  /** Latest selectable date, ISO YYYY-MM-DD (date mode). e.g. today, so a
   *  timesheet can't be logged in the future. */
  max?: string;
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
  variant = 'default',
  max,
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
          max={max}
          onChange={(e: any) => onChange(e.target.value)}
          className={clsx(
            'w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary',
            error ? 'border-red-300' : 'border-gray-200',
          )}
        />
      ) : (
        <NativePicker value={value} onChange={onChange} mode={mode} label={label} placeholder={placeholder} error={error} variant={variant} max={max} />
      )}

      {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
    </View>
  );
}

function NativePicker({
  value,
  onChange,
  mode,
  label,
  placeholder,
  error,
  variant = 'default',
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  mode: Mode;
  label?: string;
  placeholder?: string;
  error?: string;
  variant?: 'default' | 'ghost';
  max?: string;
}) {
  const maximumDate = max ? parseValueToDate(max, 'date') : undefined;
  // Dynamic import keeps the native module out of the web bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const DateTimePickerModule = require('@react-native-community/datetimepicker');
  const DateTimePicker = DateTimePickerModule.default;
  const DateTimePickerAndroid = DateTimePickerModule.DateTimePickerAndroid;

  const { t, locale } = useLang();
  const tc = t.common.buttons;

  const [iosOpen, setIosOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<Date | null>(null);

  const displayText = useMemo(() => formatForDisplay(value, mode, locale), [value, mode, locale]);

  const open = () => {
    const current = parseValueToDate(value, mode);
    if (Platform.OS === 'android') {
      const androidMode = mode === 'time' ? 'time' : 'date';
      DateTimePickerAndroid.open({
        value: current,
        mode: androidMode,
        is24Hour: false,
        maximumDate,
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

  // iOS picker style: inline calendar for dates, scroll-wheel spinner for times.
  // Inline needs ~340px of vertical space; spinner is fine at ~220px.
  const iosDisplay = mode === 'time' ? 'spinner' : 'inline';
  const iosPickerHeight = mode === 'time' ? 220 : 360;

  return (
    <>
      <Pressable
        onPress={open}
        className={clsx(
          'flex-row items-center',
          variant === 'ghost'
            ? 'active:opacity-60'
            : clsx('rounded-xl border bg-white px-4 py-2.5', error ? 'border-red-300' : 'border-gray-200'),
        )}
      >
        <Text
          className={clsx(
            'text-sm',
            variant === 'ghost' ? 'font-semibold' : 'flex-1',
            displayText ? 'text-gray-900' : 'text-gray-400',
          )}
        >
          {displayText || placeholder || (mode === 'time' ? '--:--' : '--/--/----')}
        </Text>
        {variant === 'ghost' ? null : <Icon size={16} color="#9CA3AF" />}
      </Pressable>

      {Platform.OS === 'ios' ? (
        <RNModal
          visible={iosOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIosOpen(false)}
        >
          <View className="flex-1 justify-end">
            <Pressable
              onPress={() => setIosOpen(false)}
              className="absolute inset-0 bg-black/40"
            />
            <View className="bg-white rounded-t-3xl pt-3">
              {/* Drag-handle */}
              <View className="items-center mb-1">
                <View className="w-10 h-1 bg-gray-200 rounded-full" />
              </View>
              {/* Header: title on left, Clear next to it, Done on right */}
              <View className="flex-row items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100">
                <View className="flex-row items-center gap-3 flex-1">
                  <Text className="text-2xl font-extrabold text-gray-900">
                    {label || (mode === 'time' ? 'Hora' : 'Fecha')}
                  </Text>
                  {value ? (
                    <Pressable
                      onPress={() => {
                        onChange('');
                        setIosOpen(false);
                      }}
                      hitSlop={8}
                    >
                      <Text className="text-base text-gray-400">{tc.clear}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => {
                    if (iosDraft) onChange(formatDateToValue(iosDraft, mode));
                    setIosOpen(false);
                  }}
                  hitSlop={8}
                >
                  <Text className="text-base font-semibold text-primary">{tc.done}</Text>
                </Pressable>
              </View>
              <View style={{ paddingHorizontal: 8 }}>
                <DateTimePicker
                  value={iosDraft ?? new Date()}
                  mode={mode === 'datetime-local' ? 'datetime' : mode}
                  display={iosDisplay}
                  maximumDate={maximumDate}
                  accentColor="#4F46E5"
                  themeVariant="light"
                  // Force English locale on the time wheel so AM/PM renders
                  // uppercase ("AM"/"PM") instead of Spanish "a. m." / "p. m.".
                  // Date mode keeps the system locale so the inline calendar
                  // still shows Spanish month/day names when the OS is in ES.
                  locale={mode === 'time' ? 'en-US' : undefined}
                  onChange={(_e: unknown, d?: Date) => {
                    if (d) setIosDraft(d);
                  }}
                  style={{ height: iosPickerHeight }}
                />
              </View>
              <View style={{ height: 24 }} />
            </View>
          </View>
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

// Full month names so the displayed locale is unambiguous. Spanish
// abbreviations like "May" / "Jun" / "Jul" collide with English, which
// made the field look like it wasn't translated.
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatForDisplay(value: string, mode: Mode, locale?: string): string {
  if (!value) return '';
  const d = parseValueToDate(value, mode);

  if (mode === 'time') return formatTime12h(d);

  // Always "Month Day, Year" in both languages — Spanish swaps in Spanish
  // month names (e.g. "May 29, 2026" → "Mayo 29, 2026").
  const isEs = (locale ?? '').toLowerCase().startsWith('es');
  const months = isEs ? MONTHS_ES : MONTHS_EN;
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
