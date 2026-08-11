// HEIC/HEIF → JPEG conversion for web uploads.
//
// iPhones shoot HEIC by default. Mobile is safe (expo-image-picker re-encodes
// to JPEG because every picker sets `quality`), but a web file input accepts a
// raw .heic and the upload "succeeds" — then renders as a broken image in
// Chrome/Firefox/Edge and on Android, which can't display HEIC. Every web
// upload point funnels files through here so what's stored is always JPEG.
//
// heic2any is loaded lazily (dynamic import) — it's ~300KB of wasm-ish decoder
// that only HEIC uploaders ever pay for.

export async function normalizeImageFile(file: File): Promise<File> {
  const isHeic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!isHeic) return file;
  try {
    const heic2any = (await import('heic2any')).default;
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
    const blob = Array.isArray(out) ? out[0] : out;
    const name = file.name.replace(/\.hei[cf]$/i, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    // Conversion failed (corrupt file, unsupported variant) — upload the
    // original rather than losing it; Safari can still display it.
    return file;
  }
}

export function normalizeImageFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map(normalizeImageFile));
}
