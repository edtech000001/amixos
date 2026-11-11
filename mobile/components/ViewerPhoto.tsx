import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { expoImage, imageCacheKey } from '@/lib/cachedImage';

/**
 * The photo inside a full-screen viewer. The grid's thumbnail (already
 * downloaded) shows immediately underneath while the full-size photo loads,
 * since the grids only fetch thumbnails.
 */
export function ViewerPhoto({ uri, thumbUri, style }: {
  uri?: string;
  thumbUri?: string;
  style: StyleProp<ImageStyle>;
}) {
  const thumb = thumbUri && thumbUri !== uri ? thumbUri : undefined;
  const X = expoImage();
  if (X) {
    // Disk-cached by storage path, so a photo opened before shows instantly
    // even after its signed URL was re-minted.
    return (
      <View style={style}>
        <X.Image
          source={uri ? { uri, cacheKey: imageCacheKey(uri) } : null}
          placeholder={thumb ? { uri: thumb, cacheKey: imageCacheKey(thumb) } : undefined}
          placeholderContentFit="contain"
          contentFit="contain"
          transition={150}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }
  return (
    <View style={style}>
      {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
    </View>
  );
}
