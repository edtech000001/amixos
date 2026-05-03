import { TextInput, Text, View, type TextInputProps, type NativeSyntheticEvent, type TextInputFocusEventData } from 'react-native';
import { clsx } from 'clsx';
import { forwardRef, useState, type ReactNode } from 'react';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, leftIcon, containerClassName, className, editable = true, onFocus, onBlur, ...rest },
  ref,
) {
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
        <Text className="text-sm font-semibold text-gray-700">{label}</Text>
      )}
      <View
        className={clsx(
          'flex-row items-center rounded-2xl border bg-white px-4',
          error
            ? 'border-red-300'
            : focused
              ? 'border-primary'
              : 'border-gray-200',
          !editable && 'bg-gray-50',
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
          placeholderTextColor="#9CA3AF"
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={clsx(
            'flex-1 py-3.5 text-base text-gray-900',
            className,
          )}
          {...rest}
        />
      </View>
      {error && <Text className="text-xs font-medium text-red-500">{error}</Text>}
    </View>
  );
});
