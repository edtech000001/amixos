// Manual TypeScript augmentation for NativeWind v4's className prop on
// React Native primitive components. NativeWind v4's babel jsx transform
// makes className work at runtime, but TS doesn't know about it.
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
}
