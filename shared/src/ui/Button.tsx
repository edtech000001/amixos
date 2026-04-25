import { Pressable, Text, ActivityIndicator, View, type PressableProps } from 'react-native';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
}

const VARIANT_STYLES: Record<Variant, { bg: string; text: string; pressed: string }> = {
  primary:   { bg: 'bg-primary',    text: 'text-white',     pressed: 'active:bg-primary-dark' },
  secondary: { bg: 'bg-gray-100',   text: 'text-gray-900',  pressed: 'active:bg-gray-200' },
  danger:    { bg: 'bg-red-500',    text: 'text-white',     pressed: 'active:bg-red-600' },
  ghost:     { bg: 'bg-transparent', text: 'text-gray-600', pressed: 'active:bg-gray-100' },
};

const SIZE_STYLES: Record<Size, { container: string; text: string }> = {
  sm: { container: 'px-3 py-2',   text: 'text-xs' },
  md: { container: 'px-4 py-2.5', text: 'text-sm' },
  lg: { container: 'px-5 py-3.5', text: 'text-base' },
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      className={clsx(
        'rounded-xl flex-row items-center justify-center',
        v.bg, v.pressed, s.container,
        fullWidth && 'w-full',
        isDisabled && 'opacity-50',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : '#374151'} />
      ) : (
        <View className="flex-row items-center justify-center">
          {typeof children === 'string'
            ? <Text className={clsx('font-semibold', v.text, s.text)}>{children}</Text>
            : children}
        </View>
      )}
    </Pressable>
  );
}
