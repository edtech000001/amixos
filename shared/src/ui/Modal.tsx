import { Modal as RNModal, View, Text, Pressable, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';

type Size = 'sm' | 'md' | 'lg';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: Size;
}

const SIZE_STYLES: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
};

// Universal Modal — uses React Native's <Modal> primitive which works on both
// native (full-screen overlay) and web (via react-native-web → fixed div).
export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  return (
    <RNModal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 bg-black/40 items-center justify-center p-4"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className={clsx(
            'w-full bg-white rounded-2xl shadow-xl flex flex-col max-h-[90%]',
            SIZE_STYLES[size],
          )}
        >
          <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-100">
            <Text className="text-base font-semibold text-gray-900">{title}</Text>
            <Pressable
              onPress={onClose}
              className="p-1.5 rounded-lg active:bg-gray-100"
              accessibilityLabel="Close"
            >
              <X size={16} color="#6B7280" />
            </Pressable>
          </View>
          <ScrollView className="px-7 py-6">
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
