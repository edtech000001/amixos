// Universal TypeScript augmentation: every consumer of the shared workspace
// (web via react-native-web, mobile via NativeWind) needs RN primitives to
// accept className. This single .d.ts is included via tsconfig include in
// both web/ and mobile/ so the augmentation applies in both compilations.
import 'react-native';

declare module 'react-native' {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface ImageProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
    contentContainerClassName?: string;
  }
  interface PressableProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface SwitchProps {
    className?: string;
  }
  interface KeyboardAvoidingViewProps {
    className?: string;
  }
  interface FlatListProps<ItemT> {
    className?: string;
    contentContainerClassName?: string;
  }
  interface SectionListProps<ItemT, SectionT> {
    className?: string;
    contentContainerClassName?: string;
  }
}
