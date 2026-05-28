import { Pressable, ScrollView, Text, View, type TextInputProps } from 'react-native';
import { useState, useRef } from 'react';
import { Input } from './Input';

interface AutocompleteInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  maxSuggestions?: number;
}

/**
 * Free-text input with a dropdown of previously-used values. On focus
 * the dropdown shows every suggestion (up to maxSuggestions); typing
 * filters to case-insensitive substring matches. Tapping a suggestion
 * fills the field. Empty `suggestions` makes this behave exactly like
 * a plain Input — no dropdown rendered at all.
 *
 * The blur handler uses a short setTimeout so an active "tap on
 * suggestion" lands BEFORE the dropdown hides. Without that, the tap
 * misses because blur fires first and unmounts the dropdown.
 */
export function AutocompleteInput({
  label,
  value,
  onChangeText,
  suggestions,
  placeholder,
  maxSuggestions = 6,
  ...rest
}: AutocompleteInputProps) {
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const norm = (s: string) => s.toLowerCase().trim();
  const filtered = (() => {
    if (suggestions.length === 0) return [];
    const q = norm(value);
    if (!q) return suggestions.slice(0, maxSuggestions);
    return suggestions
      .filter(s => norm(s) !== q && norm(s).includes(q))
      .slice(0, maxSuggestions);
  })();

  const showDropdown = focused && filtered.length > 0;

  return (
    <View>
      <Input
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        onFocus={() => {
          if (blurTimer.current) {
            clearTimeout(blurTimer.current);
            blurTimer.current = null;
          }
          setFocused(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setFocused(false), 150);
        }}
        {...rest}
      />
      {showDropdown ? (
        <View
          className="mt-1 rounded-xl border border-gray-200 bg-white overflow-hidden"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 4,
          }}
        >
          <ScrollView keyboardShouldPersistTaps="always" style={{ maxHeight: 200 }}>
            {filtered.map((s, i) => (
              <Pressable
                key={s}
                onPress={() => {
                  onChangeText(s);
                  if (blurTimer.current) {
                    clearTimeout(blurTimer.current);
                    blurTimer.current = null;
                  }
                  setFocused(false);
                }}
                className={`px-4 py-2.5 active:bg-gray-50 ${
                  i < filtered.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <Text className="text-sm text-gray-900">{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
