import { TextInput, Text, View, type TextInputProps } from 'react-native';
import { clsx } from 'clsx';
import { forwardRef, type ReactNode } from 'react';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, leftIcon, containerClassName, className, editable = true, ...rest },
  ref,
) {
  return (
    <View className={clsx('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <Text className="text-sm font-medium text-gray-700">{label}</Text>
      )}
      <View
        className={clsx(
          'flex-row items-center rounded-xl border bg-white px-4',
          error ? 'border-red-300' : 'border-gray-200',
          !editable && 'bg-gray-50',
        )}
      >
        {leftIcon && <View className="mr-2">{leftIcon}</View>}
        <TextInput
          ref={ref}
          editable={editable}
          placeholderTextColor="#9CA3AF"
          className={clsx(
            'flex-1 py-2.5 text-sm text-gray-900',
            className,
          )}
          {...rest}
        />
      </View>
      {error && <Text className="text-xs text-red-500">{error}</Text>}
    </View>
  );
});
