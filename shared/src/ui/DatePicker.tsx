import { View, Text, TextInput, Platform } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { clsx } from 'clsx';

interface DatePickerProps {
  /** ISO date string (YYYY-MM-DD) or empty. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  /** "date" | "time" | "datetime-local" — passed through to the HTML input on web. */
  mode?: 'date' | 'time' | 'datetime-local';
  containerClassName?: string;
}

/**
 * Universal date input.
 *
 * - **Web**: native `<input type="date">` — full OS-level date picker, locale-aware,
 *   keyboard accessible. Avoids re-implementing a calendar.
 * - **Native**: TextInput with `YYYY-MM-DD` format (or `HH:MM` / `YYYY-MM-DDTHH:MM`).
 *   Lightweight: no native dependency, no EAS rebuild required. Can be upgraded later
 *   to `@react-native-community/datetimepicker` without changing callers.
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
  const placeholderHint = placeholder ?? (
    mode === 'time' ? 'HH:MM'
    : mode === 'datetime-local' ? 'YYYY-MM-DD HH:MM'
    : 'YYYY-MM-DD'
  );

  return (
    <View className={clsx('flex flex-col gap-1.5', containerClassName)}>
      {label ? <Text className="text-sm font-medium text-gray-700">{label}</Text> : null}

      {Platform.OS === 'web' ? (
        // Native HTML input → OS date picker on web.
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
        <View
          className={clsx(
            'flex-row items-center rounded-xl border bg-white px-4',
            error ? 'border-red-300' : 'border-gray-200',
          )}
        >
          <Calendar size={16} color="#9CA3AF" />
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={placeholderHint}
            placeholderTextColor="#9CA3AF"
            keyboardType={mode === 'time' ? 'numbers-and-punctuation' : 'default'}
            autoCapitalize="none"
            className="flex-1 py-2.5 pl-2 text-sm text-gray-900"
          />
        </View>
      )}

      {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
    </View>
  );
}
