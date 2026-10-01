import { useState } from 'react';
import { View, Text, Pressable, Modal as RNModal, ActivityIndicator } from 'react-native';
import { Sparkles, Check } from 'lucide-react-native';
import { SHEET_BACKDROP } from '@amixos/shared/ui/sheetBackdrop';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useLang } from '@/lib/i18n/LangProvider';

/**
 * Explicit permission before Ami shares anything with third-party AI
 * (App Store 5.1.2(i)). Shown the first time someone opens Ami; nothing is
 * sent until they tap Allow. Withdrawable in Ajustes → Cuenta.
 * Canonical sheet structure: absolute backdrop first, card as a sibling.
 */
export function AiConsentSheet({
  open,
  onAllow,
  onClose,
}: {
  open: boolean;
  /** Persist consent; resolve true on success. */
  onAllow: () => Promise<boolean>;
  onClose: () => void;
}) {
  const c = useThemeColors();
  const { t: full } = useLang();
  const t = full.dashboard.assistant.consent;
  const [saving, setSaving] = useState(false);

  const allow = async () => {
    setSaving(true);
    const ok = await onAllow();
    setSaving(false);
    if (!ok) return;
  };

  const point = (text: string) => (
    <View className="flex-row gap-2.5">
      <View className="mt-0.5"><Check size={15} color={c.primary} /></View>
      <Text className="flex-1 text-sm text-ink leading-5">{text}</Text>
    </View>
  );

  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable onPress={saving ? undefined : onClose} style={SHEET_BACKDROP} />
        <View className="bg-card rounded-t-3xl px-5 pt-3 pb-10">
          <View className="items-center mb-4"><View className="w-10 h-1 bg-border rounded-full" /></View>
          <View className="flex-row items-center gap-3 mb-3">
            <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
              <Sparkles size={20} color={c.primary} />
            </View>
            <Text className="text-lg font-bold text-ink flex-1">{t.title}</Text>
          </View>
          <Text className="text-sm text-muted mb-4 leading-5">{t.intro}</Text>
          <View className="gap-3 mb-4">
            {point(t.sends)}
            {point(t.providers)}
            {point(t.notTraining)}
          </View>
          <Text className="text-xs text-faint mb-5">{t.changeLater}</Text>
          <Pressable
            onPress={() => void allow()}
            disabled={saving}
            className={`py-3.5 rounded-2xl items-center ${saving ? 'bg-primary/60' : 'bg-primary active:opacity-90'}`}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-semibold text-white">{t.allow}</Text>}
          </Pressable>
          <Pressable onPress={onClose} disabled={saving} className="mt-2 py-3 items-center active:opacity-60">
            <Text className="text-sm font-semibold text-muted">{t.decline}</Text>
          </Pressable>
        </View>
      </View>
    </RNModal>
  );
}
