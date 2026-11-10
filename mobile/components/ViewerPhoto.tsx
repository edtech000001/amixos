import { useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { LiveTextImage } from '@/modules/live-text';

/**
 * The photo inside a full-screen viewer.
 *
 * - The grid's thumbnail (already downloaded) shows immediately underneath,
 *   so opening a photo is never a black screen while the full-size file
 *   downloads — the grids only load thumbnails, so the full photo isn't
 *   cached yet when the viewer opens.
 * - On iPhone the full photo is the native Live Text view (select / copy text,
 *   like Apple's Photos); elsewhere — Android, a build without the module, or
 *   if the native view reports a load error — a plain contain-fit Image.
 */
export function ViewerPhoto({ uri, thumbUri, style }: {
  uri?: string;
  thumbUri?: string;
  style: StyleProp<ImageStyle>;
}) {
  const [nativeFailed, setNativeFailed] = useState(false);
  const useLiveText = !!LiveTextImage && !nativeFailed;
  return (
    <View style={style}>
      {thumbUri && thumbUri !== uri ? (
        <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      ) : null}
      {useLiveText && LiveTextImage ? (
        <LiveTextImage uri={uri} style={StyleSheet.absoluteFill} onError={() => setNativeFailed(true)} />
      ) : (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      )}
    </View>
  );
}
