/** Column count for photo / file grids so tiles stay a sensible size on
 *  iPad and in landscape: `min` on a phone, one more from 700pt, two more
 *  from 1000pt. Feed it `useWindowDimensions().width` so it follows
 *  rotation and Split View resizes. */
export function gridColumns(width: number, min = 2): number {
  if (width >= 1000) return min + 2;
  if (width >= 700) return min + 1;
  return min;
}
