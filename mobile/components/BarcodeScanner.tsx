import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { CameraView, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import { useLang } from '@/lib/i18n/LangProvider';

/**
 * Full-screen camera scanner: aiming frame, hint, Cancel at the bottom
 * (thumb reach) and an X top-LEFT — the top-right corner sits under the
 * iPhone Duo's side strip. Fills its parent; callers mount it in an RNModal
 * or as an absolute overlay.
 */
export function BarcodeScanner({ barcodeTypes, onScanned, onClose, hint, wide = false }: {
  barcodeTypes: BarcodeType[];
  onScanned: (res: BarcodeScanningResult) => void;
  onClose: () => void;
  hint: string;
  /** Long, short frame (VIN / 1-D barcodes) instead of a square one (QR). */
  wide?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  // Phones keep the 240 / 288pt frame; wide screens (iPad, Duo open) grow it.
  const { width, height } = useWindowDimensions();
  const usableW = width - insets.left - insets.right;
  const side = Math.round(Math.min(420, Math.max(240, Math.min(usableW, height) * 0.6)));
  const wideW = Math.round(Math.min(600, Math.max(288, usableW * 0.6)));
  return (
    <View style={StyleSheet.absoluteFill} className="bg-black">
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes }}
        onBarcodeScanned={onScanned}
      />
      {/* Inset like the Cancel button so both centre on the visible area. */}
      <View style={[StyleSheet.absoluteFill, { left: insets.left, right: insets.right }]} pointerEvents="none" className="items-center justify-center">
        <View
          className="border-2 border-white/90 rounded-2xl"
          style={wide ? { width: wideW, height: Math.round(wideW * 0.39) } : { width: side, height: side }}
        />
        <Text className="text-white text-sm mt-5 px-10 text-center">{hint}</Text>
      </View>
      <Pressable
        onPress={onClose}
        hitSlop={8}
        accessibilityLabel={t.common.buttons.cancel}
        style={{ top: insets.top + 12, left: insets.left + 16 }}
        className="absolute w-10 h-10 rounded-full bg-black/50 items-center justify-center"
      >
        <X size={22} color="#FFFFFF" />
      </Pressable>
      <View
        style={{ bottom: Math.max(insets.bottom, 16) + 16, left: insets.left, right: insets.right }}
        className="absolute items-center"
      >
        <Pressable onPress={onClose} className="px-8 py-3 rounded-full bg-white/20 active:bg-white/30">
          <Text className="text-white text-base font-semibold">{t.common.buttons.cancel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
