import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

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
  return (
    <View style={style}>
      {thumbUri && thumbUri !== uri ? (
        <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      ) : null}
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
    </View>
  );
}
