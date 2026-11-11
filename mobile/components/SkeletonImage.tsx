import { useState } from 'react';
import { Image, StyleSheet, View, type ImageProps } from 'react-native';
import { SkeletonBlock } from '@amixos/shared/ui/Skeleton';
import { expoImage, imageCacheKey } from '@/lib/cachedImage';

/**
 * Image with a pulsing skeleton on top until it loads, so a slow photo reads
 * as "loading" instead of a blank gray box. Sized by the image's own
 * width/height (the wrapper copies them), so it drops in for <Image>.
 * `fallbackUri` is tried when the source fails (a gallery thumbnail that
 * doesn't exist yet → the full photo); `onFallback` fires when the full photo
 * ends up shown in the thumbnail slot (caller can then build the thumbnail).
 * Disk-cached via expo-image when the build has it (see lib/cachedImage).
 */
export function SkeletonImage({
  style,
  fallbackUri,
  onFallback,
  onLoad,
  onError,
  ...rest
}: ImageProps & { fallbackUri?: string; onFallback?: () => void }) {
  const primary = (rest.source as { uri?: string } | undefined)?.uri;
  const [failed, setFailed] = useState<string | undefined>();
  const uri = primary && failed === primary && fallbackUri ? fallbackUri : primary;
  // Keyed to the uri (not a reset effect, which could land AFTER a cached
  // image's load event and leave the skeleton stuck on).
  const [doneUri, setDoneUri] = useState<string | undefined>();
  const loaded = !!uri && doneUri === uri;
  const flat = StyleSheet.flatten(style) ?? {};
  const loadedOk = () => {
    setDoneUri(uri);
    if (fallbackUri && uri === fallbackUri) onFallback?.();
  };
  const failedLoad = () => {
    if (primary && uri === primary && fallbackUri && fallbackUri !== primary) setFailed(primary);
    else setDoneUri(uri); // nothing left to try — drop the skeleton
  };
  const X = expoImage();
  return (
    <View style={{ width: flat.width, height: flat.height, overflow: 'hidden' }}>
      {X && uri ? (
        <X.Image
          source={{ uri, cacheKey: imageCacheKey(uri) }}
          contentFit={rest.resizeMode === 'contain' ? 'contain' : 'cover'}
          style={style as never}
          onLoad={loadedOk}
          onError={failedLoad}
        />
      ) : (
        <Image
          {...rest}
          source={uri ? { uri } : rest.source}
          style={style}
          onLoad={e => { loadedOk(); onLoad?.(e); }}
          onError={e => { failedLoad(); onError?.(e); }}
        />
      )}
      {/* Mounted/unmounted (never a className toggle — NativeWind remount rule). */}
      {!loaded && <SkeletonBlock className="absolute inset-0 rounded-none" />}
    </View>
  );
}
