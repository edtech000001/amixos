import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Animated,
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
  Modal as RNModal,
  type ViewToken,
} from 'react-native';
import {
  Search,
  Phone,
  Mail,
  MapPin,
  Trash2,
  User,
  Users,
  Upload,
  X,
  Layers,
  Check,
  ListChecks,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { Input } from '../../ui/Input';
import { Fab } from '../../ui/Fab';
import { clientMatchesSearch, matchingContacts } from '../../lib/clientSearch';
import { groupClients, parseClientGroupKey, CLIENTS_GROUP_KEY, type ClientSection, type ClientGroupKey } from '../../lib/clientSections';
import { usStateName } from '../../lib/usStates';

export interface ClientListItem {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  phoneDisplay: string | null;
  emailDisplay: string | null;
  city: string | null;
  state: string | null;
  /** Contact people for this client — surfaced in search + the matched row. */
  contacts?: { name: string; role: string | null }[];
  /** Custom field values (key → value) — used for "group by custom field". */
  customFields?: Record<string, string> | null;
}

export interface ClientsListScreenProps {
  loading: boolean;
  clients: ClientListItem[];
  search: string;
  onSearchChange: (text: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  /** Shift-click range add — web-only idiom; unused on native. */
  onSelectMany?: (ids: string[]) => void;
  onToggleSelectAll: () => void;
  onClientPress: (id: string) => void;
  onEditPress: (id: string) => void;
  onDeletePress: (id: string) => void;
  onNewClientPress: () => void;
  onImportPress?: () => void;
  onBulkDeletePress: () => void;
  onClearSelection: () => void;
  bulkDeleting: boolean;
  /** Custom-field definitions, for the "group by custom field" menu options. */
  customFieldTemplates?: { field_key: string; field_label: string }[];
  /** Optional slot rendered at the bottom (e.g. modals on web). */
  bottomSlot?: ReactNode;
  /** Active business id — scopes the group-by choice per business. */
  businessId?: string;
}

type Section = ClientSection<ClientListItem>;

// Flattened FlatList rows: a single leading list-header (title/search/bulk
// bar), then a sticky letter header + client rows per section, then a footer.
// Every row carries its `letter` so the active-letter indicator can read it
// straight off the topmost visible item.
type Row =
  | { type: 'listheader'; key: string; letter: '' }
  | { type: 'header'; key: string; letter: string }
  | { type: 'client'; key: string; letter: string; client: ClientListItem; isLast: boolean }
  | { type: 'footer'; key: string; letter: '' };

export function ClientsListScreen({
  loading,
  clients,
  search,
  onSearchChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onClientPress,
  onEditPress,
  onDeletePress,
  onNewClientPress,
  onImportPress,
  onBulkDeletePress,
  onClearSelection,
  bulkDeleting,
  customFieldTemplates = [],
  bottomSlot,
  businessId,
}: ClientsListScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.clients;
  const c = useThemeColors();

  // Group-by control (mirrors the jobs list). 'name' = A–Z (default). The
  // choice persists across navigation + refresh via AsyncStorage.
  const [groupBy, setGroupBy] = useState<ClientGroupKey>('name');
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupHydrated = useRef(false);
  // Scope the group-by per business so it doesn't carry across companies.
  const groupKey = businessId ? `${CLIENTS_GROUP_KEY}.${businessId}` : CLIENTS_GROUP_KEY;
  useEffect(() => {
    let cancelled = false;
    groupHydrated.current = false;
    AsyncStorage.getItem(groupKey)
      .then(raw => { if (!cancelled) setGroupBy(parseClientGroupKey(raw)); })
      .finally(() => { groupHydrated.current = true; });
    return () => { cancelled = true; };
  }, [groupKey]);
  useEffect(() => {
    if (!groupHydrated.current) return;
    void AsyncStorage.setItem(groupKey, groupBy).catch(() => {});
  }, [groupKey, groupBy]);
  const groupOptions = useMemo<{ key: ClientGroupKey; label: string }[]>(() => [
    { key: 'name', label: t.group.name },
    { key: 'company', label: t.group.company },
    { key: 'state', label: t.group.state },
    { key: 'city', label: t.group.city },
    ...customFieldTemplates.map(tpl => ({ key: `custom:${tpl.field_key}` as ClientGroupKey, label: tpl.field_label })),
  ], [t, customFieldTemplates]);
  const emptyLabel =
    groupBy === 'company' ? t.group.noCompany :
    groupBy === 'state' ? t.group.noState :
    groupBy === 'city' ? t.group.noCity :
    t.group.noValue;

  const filtered = useMemo(
    // Matches own fields + contact people; state name ↔ abbr expansion is
    // handled inside (see clientSearch / usStates).
    () => clients.filter(c => clientMatchesSearch(c, search)),
    [clients, search],
  );

  const searching = search.trim().length > 0;
  // Sections by the chosen group key; A–Z by default. Flat while searching.
  const sections = useMemo(
    () => groupClients(filtered, groupBy, searching, { emptyLabel, formatState: s => usStateName(s, locale) }),
    [filtered, groupBy, searching, emptyLabel, locale],
  );
  const letters = useMemo(
    () => sections.map(s => s.title).filter(Boolean),
    [sections],
  );

  // Selection mode: entered via the header Seleccionar button (same pattern
  // as the jobs list) or by long-pressing a row; exited via the ✕ in the bar.
  // No persistent checkboxes.
  const [selectMode, setSelectMode] = useState(false);
  const selectionMode = selectMode || selectedIds.size > 0;
  // Stable identity — passed into the memo'd ClientRow (long-press exit).
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    onClearSelection();
  }, [onClearSelection]);

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const selectedCountText = (
    selectedIds.size === 1 ? t.selectedCountSingle : t.selectedCountPlural
  ).replace('{{count}}', String(selectedIds.size));

  const showList = !loading && filtered.length > 0;
  const lastSection = sections.length > 0 ? sections[sections.length - 1] : null;
  const lastClientId = lastSection ? lastSection.data[lastSection.data.length - 1].id : null;

  // Flatten the sections into a single row list so we can drive a plain
  // FlatList. SectionList's scrollToLocation can't reach unrendered sections
  // and its imperative scroll node is unreliable; a flat list with fixed-height
  // rows lets us supply getItemLayout, so scrollToIndex jumps land exactly.
  // Sticky letter headers come from stickyHeaderIndices.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [{ type: 'listheader', key: '__listheader', letter: '' }];
    if (showList) {
      for (const s of sections) {
        if (s.title) out.push({ type: 'header', key: `__h_${s.title}`, letter: s.title });
        for (const client of s.data) {
          out.push({
            type: 'client',
            key: client.id,
            letter: s.title,
            client,
            isLast: client.id === lastClientId,
          });
        }
      }
    }
    out.push({ type: 'footer', key: '__footer', letter: '' });
    return out;
  }, [sections, showList, lastClientId]);

  const stickyHeaderIndices = useMemo(
    () => rows.reduce<number[]>((acc, r, i) => (r.type === 'header' ? (acc.push(i), acc) : acc), []),
    [rows],
  );
  const headerIndexByLetter = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.type === 'header') m.set(r.letter, i);
    });
    return m;
  }, [rows]);

  // Letter the list is currently scrolled to — highlighted in the scrubber.
  // Functional set bails out when unchanged so scrolling within a section
  // doesn't re-render anything.
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems.find(v => (v.item as Row | undefined)?.letter);
      const letter = (first?.item as Row | undefined)?.letter;
      if (letter) setActiveLetter(prev => (prev === letter ? prev : letter));
    },
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;

  const listRef = useRef<FlatList<Row>>(null);

  // Exact, failure-proof jumps need deterministic offsets. In alphabetical mode
  // every row is a fixed height (CLIENT_ROW_H / LETTER_HEADER_H / CARD_EDGE_H);
  // only the leading list-header varies, so we measure it. With a real
  // getItemLayout, scrollToIndex always lands on the precise section — no
  // estimate drift (which undershot big sections) and no scrollToIndex bailing
  // to the top (which is what made taps jump back to A).
  const [listHeaderH, setListHeaderH] = useState(LIST_HEADER_H);

  const rowHeight = (r: Row) =>
    r.type === 'listheader'
      ? listHeaderH
      : r.type === 'header'
        ? LETTER_HEADER_H
        : r.type === 'footer'
          ? CARD_EDGE_H
          : CLIENT_ROW_H;

  const offsets = useMemo(() => {
    const arr = new Array<number>(rows.length + 1);
    let y = 0;
    for (let i = 0; i < rows.length; i++) {
      arr[i] = y;
      y += rowHeight(rows[i]);
    }
    arr[rows.length] = y;
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, listHeaderH]);

  const getItemLayout = useCallback(
    (_data: ArrayLike<Row> | null | undefined, index: number) => ({
      length: rowHeight(rows[index]),
      offset: offsets[index],
      index,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, offsets, listHeaderH],
  );

  const jumpToLetterIndex = (letterIdx: number) => {
    const target = headerIndexByLetter.get(letters[letterIdx]);
    if (target == null) return;
    listRef.current?.scrollToIndex({ index: target, viewPosition: 0, animated: false });
  };

  // Leading list row — title, search, bulk bar, and the loading / empty
  // states. The top inset lives here (pt-6) rather than on the list's
  // contentContainer, so getItemLayout offsets can start cleanly at 0. The
  // FlatList's paddingHorizontal handles the side inset.
  const header = (
    <View className="pt-6">
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-ink">{t.title}</Text>
          <Text className="text-sm text-muted mt-0.5">
            {search.trim()
              ? t.countFound.replace('{{count}}', String(filtered.length))
              : t.countTotal.replace('{{count}}', String(clients.length))}
          </Text>
        </View>
        <View className="flex-row gap-2">
          {/* Select-mode toggle — same entry point as the jobs list. */}
          <Pressable
            onPress={() => (selectionMode ? exitSelect() : setSelectMode(true))}
            accessibilityLabel={t.selectButton}
            className={`items-center justify-center px-3 py-2.5 rounded-xl border active:opacity-80 ${
              selectionMode ? 'bg-primary/10 border-primary' : 'bg-card border-border'
            }`}
          >
            <ListChecks size={15} color={selectionMode ? c.primary : c.muted} />
          </Pressable>
          {/* Group-by control — highlighted when not the default A–Z. */}
          <Pressable
            onPress={() => setGroupMenuOpen(true)}
            className={`flex-row items-center gap-1.5 px-4 py-2.5 rounded-xl border active:opacity-80 ${
              groupBy !== 'name' ? 'bg-primary/10 border-primary' : 'bg-card border-border'
            }`}
          >
            <Layers size={15} color={groupBy !== 'name' ? c.primary : c.muted} />
            <Text className={`text-sm font-semibold ${groupBy !== 'name' ? 'text-primary' : 'text-ink'}`}>
              {t.group.button}
            </Text>
          </Pressable>
          {onImportPress ? (
            <Pressable
              onPress={onImportPress}
              className="flex-row items-center gap-1.5 bg-card border border-border px-4 py-2.5 rounded-xl active:bg-surface"
            >
              <Upload size={15} color={c.muted} />
              <Text className="text-sm font-semibold text-ink">{t.importBtn}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View className="mb-4">
        <Input
          placeholder={t.searchPlaceholder}
          value={search}
          onChangeText={onSearchChange}
          onClear={() => onSearchChange('')}
          leftIcon={<Search size={16} color={c.faint} />}
          // Search is case-insensitive — turn off iOS smart-capitalize +
          // autocorrect so the input doesn't start each query with a
          // capital letter or try to "correct" partial names.
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {selectionMode ? (
        // gap-2 + shrinkable count text + short "Todos" label: everything has
        // to fit a 375pt screen without pushing Eliminar past the bar's edge.
        <View className="flex-row items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5 mb-4">
          <Pressable onPress={exitSelect} className="p-1 rounded">
            <X size={14} className="text-primary" />
          </Pressable>
          <Text
            className="text-sm font-medium text-primary flex-shrink"
            numberOfLines={1}
          >
            {selectedCountText}
          </Text>
          <View className="flex-1" />
          {!allSelected ? (
            <Pressable onPress={onToggleSelectAll} className="px-2 py-1.5 rounded-lg active:bg-primary/10">
              <Text className="text-xs font-semibold text-primary">{t.selectAllShort}</Text>
            </Pressable>
          ) : null}
          {/* Delete lives in the floating bottom pill (jobs pattern). */}
        </View>
      ) : null}

      {showList ? (
        // Rounded top edge of the white card; section headers + rows continue
        // the frame below it (mirrors the footer strip).
        <View className="bg-card rounded-t-2xl h-3" />
      ) : null}

      {loading ? (
        <View className="items-center py-20">
          <View className="flex-row gap-1">
            {[0, 1, 2].map(i => (
              <View key={i} className="w-2 h-2 rounded-full bg-primary" />
            ))}
          </View>
        </View>
      ) : filtered.length === 0 ? (
        <View className="items-center py-20">
          <User size={40} color={c.faint} />
          <Text className="text-sm text-faint mt-3">
            {search ? t.emptyNoMatch : t.emptyAll}
          </Text>
          {!search ? (
            <Pressable onPress={onNewClientPress} className="mt-1">
              <Text className="text-primary text-sm font-medium">{t.addFirst}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const renderRow = ({ item }: { item: Row; index: number }) => {
    if (item.type === 'listheader') {
      // The only variable-height row — measure it so getItemLayout stays exact.
      return (
        <View onLayout={e => setListHeaderH(Math.max(1, e.nativeEvent.layout.height))}>
          {header}
        </View>
      );
    }
    if (item.type === 'header') {
      return (
        <View
          className="bg-surface px-5 justify-center border-b border-b-border-soft"
          style={{ height: LETTER_HEADER_H }}
        >
          <Text className="text-xs font-bold text-muted">{item.letter}</Text>
        </View>
      );
    }
    if (item.type === 'client') {
      return (
        <ClientRow
          client={item.client}
          search={search}
          selectionMode={selectionMode}
          isChecked={selectedIds.has(item.client.id)}
          isLast={item.isLast}
          // Fixed height in alphabetical mode keeps getItemLayout exact; while
          // searching, rows size to content (matched contacts expand them).
          fixedHeight={searching ? undefined : CLIENT_ROW_H}
          onToggleSelect={onToggleSelect}
          onClientPress={onClientPress}
          onExitSelect={exitSelect}
        />
      );
    }
    return (
      <>
        {showList ? (
          <View className="bg-card rounded-b-2xl h-3" />
        ) : null}
        {bottomSlot}
      </>
    );
  };

  return (
    <View className="flex-1 bg-surface">
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={item => item.key}
        renderItem={renderRow}
        // Letter headers pin to the top as you scroll past them.
        stickyHeaderIndices={stickyHeaderIndices}
        // Exact section offsets — only in alphabetical mode, where rows are a
        // fixed height. While searching, rows size to content, so we let the
        // list measure them normally (no scrubber/jumps then anyway).
        getItemLayout={showList && !searching ? getItemLayout : undefined}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        // 12px side inset so rows are visibly wider but the card still has a
        // small breathing margin from the screen edges. Top inset is on the
        // header row (pt-6) so getItemLayout offsets start at 0.
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: selectMode ? 256 : 144 }}
        // Tuning for long lists — keep the visible window small, recycle
        // aggressively. (No removeClippedSubviews: it glitches sticky headers
        // on Android.)
        initialNumToRender={15}
        windowSize={7}
        maxToRenderPerBatch={10}
        keyboardShouldPersistTaps="handled"
      />

      {/* A–Z index — only meaningful for the alphabetical (name) grouping.
         Hugs the right edge (the Fab sits 20px in, no overlap). */}
      {showList && !searching && groupBy === 'name' && letters.length > 1 ? (
        <AlphabetScrubber
          letters={letters}
          activeLetter={activeLetter}
          onJump={jumpToLetterIndex}
        />
      ) : null}

      {/* New client — floating action, bottom-right thumb reach. Hidden while
         selecting so the delete pill owns the bottom edge (jobs pattern). */}
      {selectionMode ? null : <Fab onPress={onNewClientPress} />}

      {/* Bulk-delete pill — bottom-left, same as the jobs list. */}
      {selectionMode ? (
        <Pressable
          onPress={onBulkDeletePress}
          disabled={selectedIds.size === 0 || bulkDeleting}
          className="absolute bottom-32 left-5 flex-row items-center gap-2 px-5 h-14 rounded-full"
          style={{
            backgroundColor: selectedIds.size === 0 || bulkDeleting ? '#D1D5DB' : '#DC2626',
            elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Trash2 size={20} color="#FFFFFF" />
          <Text className="text-white font-semibold">
            {`${t.bulkDelete}${selectedIds.size > 0 ? ` · ${selectedIds.size}` : ''}`}
          </Text>
        </Pressable>
      ) : null}

      {/* Group-by bottom sheet — pills, mirrors the jobs sort menu. */}
      <RNModal
        visible={groupMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupMenuOpen(false)}
      >
        <Pressable onPress={() => setGroupMenuOpen(false)} className="flex-1 bg-black/40 justify-end">
          <Pressable onPress={() => {}} className="bg-card rounded-t-3xl px-6 pt-3 pb-10">
            <View className="self-center w-10 h-1 rounded-full bg-border mb-4" />
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-bold text-ink">{t.group.title}</Text>
              <Pressable onPress={() => setGroupMenuOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                <X size={22} color={c.faint} />
              </Pressable>
            </View>
            <ScrollView className="max-h-96" keyboardShouldPersistTaps="handled">
              <View className="flex-row flex-wrap gap-2">
                {groupOptions.map(o => {
                  const selected = groupBy === o.key;
                  return (
                    <Pressable
                      key={o.key}
                      onPress={() => { setGroupBy(o.key); setGroupMenuOpen(false); }}
                      className={`flex-row items-center gap-1.5 px-3.5 py-2.5 rounded-full border active:opacity-80 ${
                        selected ? 'bg-primary border-primary' : 'bg-card border-border'
                      }`}
                    >
                      {selected ? <Check size={13} color="#FFFFFF" /> : null}
                      <Text className={`text-[13px] font-semibold ${selected ? 'text-white' : 'text-muted'}`}>
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </RNModal>
    </View>
  );
}

// Nominal slot height per letter; the real value is derived from the measured
// strip height at runtime (the rendered glyph slot isn't exactly this), so the
// dot and drag math stay aligned regardless of font metrics / density.
const LETTER_H = 16;
const DOT_SIZE = 16;

// Fixed row heights for alphabetical mode — make section offsets deterministic
// so scrubber jumps land exactly (see getItemLayout). Client rows clip to this
// height; it fits the common avatar + name + two meta lines.
const CLIENT_ROW_H = 88;
const LETTER_HEADER_H = 28;
const CARD_EDGE_H = 8; // the rounded-bottom card strip (footer row)
const LIST_HEADER_H = 200; // initial estimate for the leading row until measured

/**
 * Vertical letter strip for jumping between sections — drag or tap a letter.
 * Only letters that actually have clients are shown. A primary dot slides to
 * the letter the list is scrolled to; while dragging, a bubble shows the
 * letter under the finger.
 */
function AlphabetScrubber({
  letters,
  activeLetter,
  onJump,
}: {
  letters: string[];
  activeLetter: string | null;
  onJump: (sectionIndex: number) => void;
}) {
  const lastIndex = useRef(-1);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Finger Y within the strip — drives the bubble position so it sits exactly
  // at the touch (no index→pixel mismatch).
  const [dragY, setDragY] = useState(0);
  const stripH = useRef(1);
  // Real per-letter height = measured strip height / letter count. Using this
  // instead of a hardcoded LETTER_H keeps the dot centered on its letter all
  // the way down the alphabet (a fixed guess drifts as the index grows).
  const [letterH, setLetterH] = useState(LETTER_H);
  const bubbleAnim = useRef(new Animated.Value(0)).current;
  const dotY = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef(new Animated.Value(0)).current;

  // While dragging, the finger wins; otherwise follow the scroll position.
  const highlighted = dragIndex != null ? letters[dragIndex] : activeLetter;
  const activeIdx = highlighted ? letters.indexOf(highlighted) : -1;

  useEffect(() => {
    if (activeIdx < 0) {
      Animated.timing(dotOpacity, { toValue: 0, duration: 120, useNativeDriver: true }).start();
      return;
    }
    Animated.parallel([
      Animated.spring(dotY, {
        // Center the dot on the letter: slot top + half a slot − half the dot.
        toValue: activeIdx * letterH + letterH / 2 - DOT_SIZE / 2,
        speed: 24,
        bounciness: 6,
        useNativeDriver: true,
      }),
      Animated.timing(dotOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  }, [activeIdx, letterH, dotY, dotOpacity]);

  const handle = (y: number) => {
    const clamped = Math.min(stripH.current, Math.max(0, y));
    setDragY(clamped);
    const idx = Math.min(letters.length - 1, Math.max(0, Math.floor(clamped / letterH)));
    setDragIndex(prev => (prev === idx ? prev : idx));
    if (idx !== lastIndex.current) {
      lastIndex.current = idx;
      onJump(idx);
    }
  };

  const startDrag = (y: number) => {
    handle(y);
    Animated.spring(bubbleAnim, {
      toValue: 1,
      speed: 30,
      bounciness: 8,
      useNativeDriver: true,
    }).start();
  };

  const endDrag = () => {
    lastIndex.current = -1;
    Animated.timing(bubbleAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(
      () => setDragIndex(null),
    );
  };

  return (
    <View className="absolute right-0 top-0 bottom-32 justify-center" pointerEvents="box-none">
      <View pointerEvents="box-none">
        {/* Drag bubble — floats left of the strip, centered on the finger */}
        {dragIndex != null ? (
          <Animated.View
            pointerEvents="none"
            className="absolute right-9 w-12 h-12 rounded-full bg-primary items-center justify-center"
            style={{
              top: dragY - 24,
              opacity: bubbleAnim,
              transform: [
                { scale: bubbleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ],
              elevation: 4,
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
            }}
          >
            <Text className="text-white text-xl font-bold">{letters[dragIndex]}</Text>
          </Animated.View>
        ) : null}

        <View
          className="px-1"
          hitSlop={{ left: 8, right: 4 }}
          onLayout={e => {
            const h = Math.max(1, e.nativeEvent.layout.height);
            stripH.current = h;
            setLetterH(h / letters.length);
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={e => startDrag(e.nativeEvent.locationY)}
          onResponderMove={e => handle(e.nativeEvent.locationY)}
          onResponderRelease={endDrag}
          onResponderTerminate={endDrag}
        >
          {/* Sliding dot behind the active letter */}
          <Animated.View
            pointerEvents="none"
            className="absolute w-4 h-4 rounded-full bg-primary"
            style={{ left: 4, top: 0, opacity: dotOpacity, transform: [{ translateY: dotY }] }}
          />
          {letters.map(l => (
            <View key={l} className="w-4 h-4 items-center justify-center">
              <Text
                className={`text-[9px] font-bold text-center ${
                  l === highlighted ? 'text-white' : 'text-faint'
                }`}
              >
                {l}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

interface ClientRowProps {
  client: ClientListItem;
  search: string;
  selectionMode: boolean;
  isChecked: boolean;
  isLast: boolean;
  /** Fixed row height for alphabetical mode (keeps getItemLayout exact). */
  fixedHeight?: number;
  onToggleSelect: (id: string) => void;
  onClientPress: (id: string) => void;
  onExitSelect: () => void;
}

const ClientRow = memo(function ClientRow({
  client: c,
  search,
  selectionMode,
  isChecked,
  isLast,
  fixedHeight,
  onToggleSelect,
  onClientPress,
  onExitSelect,
}: ClientRowProps) {
  const tc = useThemeColors();
  const matchedContacts = matchingContacts(c, search);
  return (
    <Pressable
      // Tap opens the client; long-press enters selection mode, and a second
      // long-press anywhere EXITS it (an accidental hold shouldn't force a
      // scroll back to the header toggle). While in selection mode the whole
      // row is the toggle target (no tiny checkbox to aim for).
      onPress={() => (selectionMode ? onToggleSelect(c.id) : onClientPress(c.id))}
      onLongPress={() => (selectionMode ? onExitSelect() : onToggleSelect(c.id))}
      delayLongPress={300}
      // Row sits inside the white card; border-x continues the card frame.
      // border-b-gray-200 keeps the divider readable (the original gray-50
      // was nearly invisible against the white card). With a fixedHeight the
      // content is vertically centered and clipped to keep rows uniform;
      // otherwise py-4 sizes the row to its content (search mode).
      style={fixedHeight ? { height: fixedHeight, overflow: 'hidden' } : undefined}
      className={`flex-row items-center px-5 ${fixedHeight ? '' : 'py-4'} bg-card ${
        isLast ? '' : 'border-b border-b-border-soft'
      } ${isChecked ? 'bg-primary/5' : 'active:bg-surface'}`}
    >
      <View className="flex-row items-center gap-3 min-w-0 flex-1">
        {selectionMode ? (
          <View
            className={`w-5 h-5 rounded-full border ${
              isChecked ? 'border-primary bg-primary' : 'border-border bg-card'
            } items-center justify-center`}
          >
            {isChecked ? <Text className="text-white text-[10px] font-bold">✓</Text> : null}
          </View>
        ) : null}
        <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
          <Text className="text-primary text-sm font-bold">
            {c.firstName.charAt(0).toUpperCase()}
            {c.lastName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
            {c.firstName} {c.lastName}
            {c.company ? (
              <Text className="text-faint font-normal"> · {c.company}</Text>
            ) : null}
          </Text>
          <View className="flex-row flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {c.phoneDisplay ? (
              <View className="flex-row items-center gap-1">
                <Phone size={11} color={tc.faint} />
                <Text className="text-xs text-faint">{c.phoneDisplay}</Text>
              </View>
            ) : null}
            {c.emailDisplay ? (
              // flex-shrink + numberOfLines: a long email truncates in place
              // instead of wrapping the meta line and making rows uneven.
              <View className="flex-row items-center gap-1 flex-shrink min-w-0">
                <Mail size={11} color={tc.faint} />
                <Text className="text-xs text-faint flex-shrink" numberOfLines={1}>
                  {c.emailDisplay}
                </Text>
              </View>
            ) : null}
            {c.city ? (
              <View className="flex-row items-center gap-1">
                <MapPin size={11} color={tc.faint} />
                <Text className="text-xs text-faint">
                  {c.city}
                  {c.state ? `, ${c.state}` : ''}
                </Text>
              </View>
            ) : null}
          </View>
          {matchedContacts.length > 0 ? (
            <View className="mt-1 gap-0.5">
              {matchedContacts.map((ct, i) => (
                <View key={i} className="flex-row items-center gap-1">
                  <Users size={11} color={tc.primary} />
                  <Text className="text-xs font-medium text-primary" numberOfLines={1}>
                    {ct.name}
                    {ct.role ? `  ·  ${ct.role}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});
