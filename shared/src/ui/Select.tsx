import { useState } from 'react';
import { View, Text, Pressable, Modal as RNModal, ScrollView, Platform } from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';
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
  containerClassName,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  const displayText = selected?.label ?? placeholder ?? '';

  return (
    <View className={clsx('flex flex-col gap-1.5', containerClassName)}>
      {label ? <Text className="text-sm font-medium text-gray-700">{label}</Text> : null}

      {Platform.OS === 'web' ? (
        // Native HTML select for web accessibility/keyboard support.
        <select
          value={value}
          onChange={(e: any) => onValueChange(e.target.value)}
          className={clsx(
            'w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none',
            error ? 'border-red-300' : 'border-gray-200',
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
            onPress={() => setOpen(true)}
            className={clsx(
              'flex-row items-center justify-between rounded-xl border bg-white px-4 py-2.5',
              error ? 'border-red-300' : 'border-gray-200',
            )}
          >
            <Text
              className={clsx(
                'text-sm flex-1',
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
                className="bg-white rounded-2xl w-full max-w-md max-h-[70%] overflow-hidden"
              >
                {label ? (
                  <View className="px-5 py-4 border-b border-gray-100">
                    <Text className="text-base font-semibold text-gray-900">{label}</Text>
                  </View>
                ) : null}
                <ScrollView>
                  {options.map(o => {
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
