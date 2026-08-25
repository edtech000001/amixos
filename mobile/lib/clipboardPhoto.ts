// Paste-a-photo support. A crew member texts you a picture; today you have to
// save it to the gallery first, then pick it. Copying it in Messages/WhatsApp
// and pasting straight into Amixos skips that round trip.
//
// Both entry points are lazy-required and fail soft: `expo-clipboard` and
// `expo-file-system` are NATIVE modules, and a dev client built before they
// were added would otherwise crash the screen on import. A build without them
// simply never shows the Paste row.

/** Where an added photo comes from. 'paste' reads the OS clipboard. */
export type PhotoSource = 'camera' | 'library' | 'paste';

/** True when the OS clipboard currently holds an image.
 *
 *  Safe to call on sheet-open: iOS answers from `UIPasteboard.hasImages`, which
 *  does NOT raise the system paste prompt — only the actual read does. */
export async function hasClipboardImage(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
    return await Clipboard.hasImageAsync();
  } catch {
    return false; // module not in this native build — hide the Paste option
  }
}

/**
 * Read the clipboard image and land it in a durable JPEG file, returning its
 * `file://` uri — the same shape the image picker hands back, so callers reuse
 * their existing upload path (including the offline outbox, which needs a file
 * that survives an app restart).
 *
 * Returns null when the clipboard has no image or the modules are missing.
 * On iOS this is the call that shows the system "Allow Paste?" prompt.
 */
export async function readClipboardImageToFile(): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');

    // Match the picker's quality 0.6 so a pasted photo isn't heavier than a
    // picked one.
    const img = await Clipboard.getImageAsync({ format: 'jpeg', jpegQuality: 0.6 });
    if (!img?.data) return null;

    // `data` arrives as a full data URI ("data:image/jpeg;base64,…") — strip
    // the prefix before writing, or the file is corrupt.
    const base64 = img.data.includes(',') ? img.data.slice(img.data.indexOf(',') + 1) : img.data;
    if (!base64) return null;

    const uri = `${FileSystem.documentDirectory}pasted_photo_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}.jpg`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  } catch {
    return null;
  }
}
