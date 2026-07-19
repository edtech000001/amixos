import { TextInput, Text, View, Pressable, type TextInputProps, type NativeSyntheticEvent, type TextInputFocusEventData } from 'react-native';
import { X } from 'lucide-react-native';
import { clsx } from 'clsx';
import { useThemeColors } from '../theme';
import { forwardRef, useState, type ReactNode } from 'react';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  // Small grey helper note under the field (e.g. "leave blank if…").
  hint?: string;
  leftIcon?: ReactNode;
  // Interactive slot on the right (e.g. a password-reveal eye toggle).
  rightIcon?: ReactNode;
  // When set, a clear (✕) button appears on the right while the field has
  // text — tapping it calls onClear. Used for search bars.
  onClear?: () => void;
  containerClassName?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, leftIcon, rightIcon, onClear, containerClassName, className, editable = true, onFocus, onBlur, ...rest },
  ref,
) {
  const c = useThemeColors();
  const showClear = !!onClear && typeof rest.value === 'string' && rest.value.length > 0;
  const [focused, setFocused] = useState(false);

  const handleFocus = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(false);
    onBlur?.(e);
  };

  return (
    <View className={clsx('flex flex-col gap-2', containerClassName)}>
      {label && (
        <Text className="text-sm font-semibold text-ink">{label}</Text>
      )}
      <View
        className={clsx(
          'flex-row items-center rounded-2xl border bg-card px-4',
          error
            ? 'border-red-300'
            : focused
              ? 'border-primary'
              : 'border-border',
          !editable && 'bg-surface',
        )}
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 1,
        }}
      >
        {leftIcon && <View className="mr-3">{leftIcon}</View>}
        <TextInput
          ref={ref}
          editable={editable}
          placeholderTextColor={c.faint}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={clsx(
            'flex-1 py-3.5 text-base text-ink',
            className,
          )}
          {...rest}
        />
        {showClear ? (
          <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Clear" className="ml-2">
            <X size={16} color={c.faint} />
          </Pressable>
        ) : rightIcon ? (
          <View className="ml-2">{rightIcon}</View>
        ) : null}
      </View>
      {error && <Text className="text-xs font-medium text-red-500">{error}</Text>}
      {hint && !error ? <Text className="text-xs text-faint">{hint}</Text> : null}
    </View>
  );
});
