import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import Animated, { useAnimatedRef, type AnimatedRef } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useLang } from '@/lib/i18n/LangProvider';

interface SettingsPageProps {
  title: string;
  children: ReactNode;
}

/**
 * Save action surfaced by a section to the wrapper header. When `dirty` is
 * true a "Guardar" pill shows in the top-right; tapping it calls onSave.
 * On back navigation a dirty section triggers a "Discard changes?" confirm.
 */
interface SaveState {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  // When true, the dirty/back-guard still works but no top-right "Guardar" pill
  // shows — the section renders its own Save button (e.g. at the bottom).
  hideHeaderButton?: boolean;
}

const SettingsPageContext = createContext<{
  registerSaveState: (state: SaveState | null) => void;
  // The page's scroll container — passed to SortableList so react-native-sortables
  // can auto-scroll while dragging (and so drag/scroll don't fight each other).
  scrollRef: AnimatedRef<Animated.ScrollView> | null;
}>({ registerSaveState: () => {}, scrollRef: null });

/** Section-side hook: the page scroll ref, for SortableList auto-scroll. */
export function useSettingsScrollRef() {
  return useContext(SettingsPageContext).scrollRef;
}

/**
 * Section-side hook: register your save state with the wrapper. Stash the
 * latest onSave in a ref so we don't re-register on every render. The pill
 * auto-appears when dirty=true.
 */
export function useSettingsSaveAction(state: SaveState | null) {
  const { registerSaveState } = useContext(SettingsPageContext);
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    // Always pass the latest snapshot via the ref so the wrapper can
    // call the current onSave even if the section memoized it differently
    // between renders.
    if (state) {
      registerSaveState({
        dirty: state.dirty,
        saving: state.saving,
        onSave: () => ref.current?.onSave(),
        hideHeaderButton: state.hideHeaderButton,
      });
    } else {
      registerSaveState(null);
    }
    return () => registerSaveState(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.dirty, state?.saving, state?.hideHeaderButton]);
}

/**
 * Shared shell for individual settings sub-pages. Header with a back arrow
 * (returns to the settings list), title, and a scrollable content area with
 * dock clearance padding. Sections can register a save action via
 * useSettingsSaveAction — it renders as a pill in the top-right and the
 * back arrow asks to confirm when there are unsaved changes.
 */
export function SettingsPageWrapper({ title, children }: SettingsPageProps) {
  const router = useRouter();
  const { t } = useLang();
  const tc = t.common.buttons;
  const ts = t.dashboard.settings;
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const registerSaveState = useCallback((s: SaveState | null) => setSaveState(s), []);

  const goBack = () => {
    if (saveState?.dirty) {
      Alert.alert(ts.unsavedChangesTitle, ts.unsavedChangesMessage, [
        { text: tc.cancel, style: 'cancel' },
        {
          text: ts.discardBtn,
          style: 'destructive',
          onPress: () => router.back(),
        },
      ]);
      return;
    }
    router.back();
  };

  return (
    <SettingsPageContext.Provider value={{ registerSaveState, scrollRef }}>
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft">
          <Pressable
            onPress={goBack}
            hitSlop={12}
            className="p-2 -ml-2 rounded-lg active:bg-border-soft"
          >
            <ChevronLeft size={22} color="#111827" />
          </Pressable>
          <Text className="ml-1 flex-1 text-lg font-semibold text-ink">{title}</Text>

          {saveState && saveState.dirty && !saveState.hideHeaderButton ? (
            <Pressable
              onPress={saveState.onSave}
              disabled={saveState.saving}
              hitSlop={8}
              className={`px-3.5 py-1.5 rounded-full ${
                saveState.saving ? 'bg-primary/50' : 'bg-primary active:opacity-80'
              }`}
            >
              <Text className="text-sm font-semibold text-white">
                {saveState.saving ? '…' : tc.save}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {/* A plain Animated.ScrollView. SortableList (react-native-sortables)
           drags only after a long-press, so a normal swipe scrolls the page;
           the scrollRef lets the list auto-scroll while you drag near an edge. */}
        <Animated.ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 144 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </Animated.ScrollView>
      </SafeAreaView>
    </SettingsPageContext.Provider>
  );
}
