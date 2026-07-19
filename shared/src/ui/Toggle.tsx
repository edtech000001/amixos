import { View, Text, Pressable } from 'react-native';
import { clsx } from 'clsx';

interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label?: string;
  /** Optional helper text shown beside the toggle (e.g. "Yes/No"). */
  hint?: string;
  disabled?: boolean;
  containerClassName?: string;
}

/**
 * Universal pill toggle. Pressable + statically-positioned thumb (no animation
 * — keeps universal between web and native without depending on Animated API).
 */
export function Toggle({
  value,
  onValueChange,
  label,
  hint,
  disabled,
  containerClassName,
}: ToggleProps) {
  const trigger = (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      className={clsx(
        'relative w-11 h-6 rounded-full',
        value ? 'bg-primary' : 'bg-border',
        disabled && 'opacity-50',
      )}
    >
      <View
        className={clsx(
          'absolute top-1 w-4 h-4 rounded-full bg-card shadow-sm',
          value ? 'left-6' : 'left-1',
        )}
      />
    </Pressable>
  );

  if (!label && !hint) return trigger;

  return (
    <View className={clsx('flex-row items-center gap-3', containerClassName)}>
      {trigger}
      <View className="flex-1">
        {label ? (
          <Text className="text-sm font-medium text-ink">{label}</Text>
        ) : null}
        {hint ? <Text className="text-xs text-muted">{hint}</Text> : null}
      </View>
    </View>
  );
}
