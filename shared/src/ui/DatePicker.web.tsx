// Web-only DatePicker — uses the native HTML date/time input + skips the
// entire @react-native-community/datetimepicker import path so webpack
// doesn't try to bundle that package's Flow-typed RN sources.
//
// Resolved BEFORE DatePicker.tsx on web thanks to the `.web.tsx` extension
// priority in web/next.config.js. Mobile (Expo / Metro) ignores .web.* files
// and uses DatePicker.tsx instead.

import { useMemo } from 'react';
import { clsx } from 'clsx';

type Mode = 'date' | 'time' | 'datetime-local';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  mode?: Mode;
  containerClassName?: string;
  /** 'ghost' = borderless inline input (matches the native ghost variant). */
  variant?: 'default' | 'ghost';
}

export function DatePicker({
  value,
  onChange,
  label,
  placeholder,
  error,
  mode = 'date',
  containerClassName,
  variant = 'default',
}: DatePickerProps) {
  // Placeholder hint when value is empty — wrapped in a hidden span purely
  // so the API matches the native version (avoids "unused var" warnings).
  const placeholderHint = useMemo(() => placeholder ?? '', [placeholder]);
  return (
    <div className={clsx('flex flex-col gap-1.5', containerClassName)}>
      {label ? <label className="text-sm font-medium text-gray-700">{label}</label> : null}
      <input
        type={mode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={placeholderHint}
        className={clsx(
          'text-sm text-gray-900 focus:outline-none',
          variant === 'ghost'
            ? 'bg-transparent border-0 p-0 font-semibold focus:ring-0'
            : clsx(
                'w-full rounded-xl border bg-white px-4 py-2.5 focus:ring-2 focus:ring-primary',
                error ? 'border-red-300' : 'border-gray-200',
              ),
        )}
      />
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </div>
  );
}
