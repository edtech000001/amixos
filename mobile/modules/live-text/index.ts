import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';

export type LiveTextImageProps = ViewProps & {
  uri?: string;
  onLoad?: () => void;
  onError?: (e: { nativeEvent: { message: string } }) => void;
};

/** Native Live Text photo view — null on Android and on builds made before
 *  the module existed (callers fall back to a plain <Image>). */
export const LiveTextImage: ComponentType<LiveTextImageProps> | null =
  requireOptionalNativeModule('LiveText') ? requireNativeView<LiveTextImageProps>('LiveText') : null;
