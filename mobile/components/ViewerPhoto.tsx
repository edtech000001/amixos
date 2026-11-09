import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { LiveTextImage } from '@/modules/live-text';

/**
 * The photo inside a full-screen viewer. On iPhone it's the native Live Text
 * view (select / copy text in the photo, like Apple's Photos app); elsewhere —
 * Android, or a build made before the module existed — a plain contain-fit Image.
 */
export function ViewerPhoto({ uri, style }: { uri?: string; style: StyleProp<ImageStyle> }) {
  if (LiveTextImage) return <LiveTextImage uri={uri} style={style} />;
  return <Image source={{ uri }} style={style} resizeMode="contain" />;
}
