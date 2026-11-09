import { useState } from 'react';
import { Image, StyleSheet, View, type ImageProps } from 'react-native';
import { SkeletonBlock } from '@amixos/shared/ui/Skeleton';

/**
 * Image with a pulsing skeleton on top until it loads, so a slow photo reads
 * as "loading" instead of a blank gray box. Sized by the image's own
 * width/height (the wrapper copies them), so it drops in for <Image>.
 * `fallbackUri` is tried when the source fails (a gallery thumbnail that
 * doesn't exist yet → the full photo).
 */
export function SkeletonImage({
  style,
  fallbackUri,
  onLoad,
  onError,
  ...rest
}: ImageProps & { fallbackUri?: string }) {
  const primary = (rest.source as { uri?: string } | undefined)?.uri;
  const [failed, setFailed] = useState<string | undefined>();
  const uri = primary && failed === primary && fallbackUri ? fallbackUri : primary;
  // Keyed to the uri (not a reset effect, which could land AFTER a cached
  // image's load event and leave the skeleton stuck on).
  const [doneUri, setDoneUri] = useState<string | undefined>();
  const loaded = !!uri && doneUri === uri;
  const flat = StyleSheet.flatten(style) ?? {};
  return (
    <View style={{ width: flat.width, height: flat.height, overflow: 'hidden' }}>
      <Image
        {...rest}
        source={uri ? { uri } : rest.source}
        style={style}
        onLoad={e => { setDoneUri(uri); onLoad?.(e); }}
        onError={e => {
          if (primary && uri === primary && fallbackUri && fallbackUri !== primary) setFailed(primary);
          else setDoneUri(uri); // nothing left to try — drop the skeleton
          onError?.(e);
        }}
      />
      {/* Mounted/unmounted (never a className toggle — NativeWind remount rule). */}
      {!loaded && <SkeletonBlock className="absolute inset-0 rounded-none" />}
    </View>
  );
}
