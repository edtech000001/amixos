import { Pressable, ScrollView, Text, View, type TextInput, type TextInputProps } from 'react-native';
import { useState, useRef } from 'react';
import { Check, ChevronDown } from 'lucide-react-native';
import { Input } from './Input';
import { useThemeColors } from '../theme';

interface AutocompleteInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  maxSuggestions?: number;
  /** Dropdown mode: a chevron marks the field as pickable, focusing lists
   *  EVERY suggestion (the current value checked) until the user types —
   *  then it filters. Free text is still accepted. */
  browse?: boolean;
  hint?: string;
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
  maxSuggestions,
  browse = false,
  hint,
  ...rest
}: AutocompleteInputProps) {
  const c = useThemeColors();
  const [focused, setFocused] = useState(false);
  // Browse mode: false until the user types after focusing — until then the
  // full list shows, so an already-filled field still offers every option.
  const [typed, setTyped] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const limit = maxSuggestions ?? (browse ? Infinity : 6);

  const norm = (s: string) => s.toLowerCase().trim();
  const q = norm(value);
  const filtered = (() => {
    if (suggestions.length === 0) return [];
    if (!q || (browse && !typed)) return suggestions.slice(0, limit);
    return suggestions
      .filter(s => norm(s) !== q && norm(s).includes(q))
      .slice(0, limit);
  })();

  const showDropdown = focused && filtered.length > 0;

  return (
    <View>
      <Input
        ref={inputRef}
        label={label}
        hint={showDropdown ? undefined : hint}
        value={value}
        onChangeText={v => {
          setTyped(true);
          onChangeText(v);
        }}
        placeholder={placeholder}
        rightIcon={
          browse && suggestions.length > 0 ? (
            <Pressable
              hitSlop={10}
              onPress={() => (focused ? inputRef.current?.blur() : inputRef.current?.focus())}
              accessibilityRole="button"
            >
              <ChevronDown size={18} color={c.faint} />
            </Pressable>
          ) : undefined
        }
        onFocus={() => {
          if (blurTimer.current) {
            clearTimeout(blurTimer.current);
            blurTimer.current = null;
          }
          setTyped(false);
          setFocused(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setFocused(false), 150);
        }}
        {...rest}
      />
      {showDropdown ? (
        <View
          className="mt-1 rounded-xl border border-border bg-card overflow-hidden"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 4,
          }}
        >
          <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled style={{ maxHeight: 200 }}>
            {filtered.map((s, i) => {
              const selected = browse && norm(s) === q;
              return (
                <Pressable
                  key={s}
                  onPress={() => {
                    onChangeText(s);
                    if (blurTimer.current) {
                      clearTimeout(blurTimer.current);
                      blurTimer.current = null;
                    }
                    setFocused(false);
                    if (browse) inputRef.current?.blur();
                  }}
                  className={`flex-row items-center px-4 py-2.5 active:bg-surface ${
                    i < filtered.length - 1 ? 'border-b border-border-soft' : ''
                  }`}
                >
                  <Text className={`flex-1 text-sm ${selected ? 'font-semibold text-primary' : 'text-ink'}`}>{s}</Text>
                  {selected ? <Check size={16} color={c.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
