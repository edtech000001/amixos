import { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, Modal as RNModal, ScrollView, Platform } from 'react-native';
import { ChevronDown, Check, Search, X } from 'lucide-react-native';
import { clsx } from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  // Soft amber-tinted border — used for "needs your attention" states
  // (e.g. CSV import field that didn't auto-match). Ignored if `error`
  // is set, since red error wins over amber attention.
  highlight?: boolean;
  // Adds a filter box at the top of the native picker — useful for long
  // lists (e.g. US states). Matches the option label or value. No effect on
  // web, where the native <select> already has built-in type-ahead.
  searchable?: boolean;
  searchPlaceholder?: string;
  searchEmptyText?: string;
  containerClassName?: string;
}

/**
 * Universal Select. On web (react-native-web), renders a native HTML <select>
 * for keyboard accessibility. On native, renders a Pressable that opens a
 * modal-based picker (works on iOS + Android without extra deps).
 */
export function Select({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  error,
  highlight,
  searchable,
  searchPlaceholder,
  searchEmptyText,
  containerClassName,
}: SelectProps) {
  const borderClass = error
    ? 'border-red-300'
    : highlight
      ? 'border-amber-400 bg-amber-50'
      : 'border-gray-200';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find(o => o.value === value);
  const displayText = selected?.label ?? placeholder ?? '';

  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [searchable, query, options]);

  return (
    <View className={clsx('flex flex-col gap-2', containerClassName)}>
      {label ? <Text className="text-sm font-semibold text-gray-700">{label}</Text> : null}

      {Platform.OS === 'web' ? (
        // Native HTML select for web accessibility/keyboard support.
        <select
          value={value}
          onChange={(e: any) => onValueChange(e.target.value)}
          className={clsx(
            'w-full rounded-2xl border px-4 py-3.5 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none',
            borderClass,
            !highlight && !error && 'bg-white',
          )}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <>
          <Pressable
            onPress={() => { setQuery(''); setOpen(true); }}
            className={clsx(
              'flex-row items-center justify-between rounded-2xl border px-4 py-3.5',
              borderClass,
              !highlight && !error && 'bg-white',
            )}
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 1,
            }}
          >
            <Text
              className={clsx(
                'text-base flex-1',
                selected ? 'text-gray-900' : 'text-gray-400',
              )}
            >
              {displayText}
            </Text>
            <ChevronDown size={16} color="#9CA3AF" />
          </Pressable>

          <RNModal
            visible={open}
            transparent
            animationType="fade"
            onRequestClose={() => setOpen(false)}
          >
            <Pressable
              onPress={() => setOpen(false)}
              className="flex-1 bg-black/40 items-center justify-center px-6"
            >
              <Pressable
                onPress={(e: any) => e.stopPropagation?.()}
                className={clsx(
                  'bg-white rounded-2xl w-full max-w-md overflow-hidden',
                  // Fixed height when searchable so the modal doesn't shrink /
                  // jump as results are filtered; otherwise size to content.
                  searchable ? 'h-[70%]' : 'max-h-[70%]',
                )}
              >
                {label ? (
                  <View className="px-5 py-4 border-b border-gray-100">
                    <Text className="text-base font-semibold text-gray-900">{label}</Text>
                  </View>
                ) : null}
                {searchable ? (
                  <View className="px-4 py-3 border-b border-gray-100 flex-row items-center gap-2">
                    <Search size={16} color="#9CA3AF" />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder={searchPlaceholder ?? 'Buscar…'}
                      placeholderTextColor="#9CA3AF"
                      autoFocus
                      autoCorrect={false}
                      autoCapitalize="none"
                      className="flex-1 text-base text-gray-900 py-1"
                    />
                    {query.length > 0 ? (
                      <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear">
                        <X size={16} color="#9CA3AF" />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
                  {filteredOptions.length === 0 ? (
                    <Text className="text-sm text-gray-400 px-5 py-4">
                      {searchEmptyText ?? 'Sin resultados.'}
                    </Text>
                  ) : null}
                  {filteredOptions.map(o => {
                    const isSelected = o.value === value;
                    return (
                      <Pressable
                        key={o.value}
                        onPress={() => {
                          onValueChange(o.value);
                          setOpen(false);
                        }}
                        className={clsx(
                          'flex-row items-center justify-between px-5 py-3.5 active:bg-gray-50',
                          isSelected && 'bg-primary/5',
                        )}
                      >
                        <Text
                          className={clsx(
                            'text-sm flex-1',
                            isSelected ? 'text-primary font-semibold' : 'text-gray-900',
                          )}
                        >
                          {o.label}
                        </Text>
                        {isSelected ? <Check size={16} className="text-primary" /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Pressable>
            </Pressable>
          </RNModal>
        </>
      )}

      {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
    </View>
  );
}
