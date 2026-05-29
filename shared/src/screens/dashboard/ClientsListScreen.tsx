import { memo, useMemo, type ReactNode } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import {
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Trash2,
  User,
  Users,
  Upload,
  X,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Input } from '../../ui/Input';
import { clientMatchesSearch, matchingContacts } from '../../lib/clientSearch';

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
}

export interface ClientsListScreenProps {
  loading: boolean;
  clients: ClientListItem[];
  search: string;
  onSearchChange: (text: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onClientPress: (id: string) => void;
  onEditPress: (id: string) => void;
  onDeletePress: (id: string) => void;
  onNewClientPress: () => void;
  onImportPress?: () => void;
  onBulkDeletePress: () => void;
  onClearSelection: () => void;
  bulkDeleting: boolean;
  /** Optional slot rendered at the bottom (e.g. modals on web). */
  bottomSlot?: ReactNode;
}

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
  bottomSlot,
}: ClientsListScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.clients;

  const filtered = useMemo(
    // Matches own fields + contact people; state name ↔ abbr expansion is
    // handled inside (see clientSearch / usStates).
    () => clients.filter(c => clientMatchesSearch(c, search)),
    [clients, search],
  );

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const selectedCountText = (
    selectedIds.size === 1 ? t.selectedCountSingle : t.selectedCountPlural
  ).replace('{{count}}', String(selectedIds.size));

  const showList = !loading && filtered.length > 0;
  const lastFilteredId = filtered.length > 0 ? filtered[filtered.length - 1].id : null;

  // Header content scrolls with the list (title, search, bulk-bar, select-all).
  // FlatList carries a small paddingHorizontal — children render at that
  // inset; no per-child px is needed.
  const header = (
    <View>
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            {search.trim()
              ? t.countFound.replace('{{count}}', String(filtered.length))
              : t.countTotal.replace('{{count}}', String(clients.length))}
          </Text>
        </View>
        <View className="flex-row gap-2">
          {onImportPress ? (
            <Pressable
              onPress={onImportPress}
              className="flex-row items-center gap-1.5 bg-white border border-gray-200 px-4 py-2.5 rounded-xl active:bg-gray-50"
            >
              <Upload size={15} color="#374151" />
              <Text className="text-sm font-semibold text-gray-700">{t.importBtn}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onNewClientPress}
            className="flex-row items-center gap-1.5 bg-primary px-4 py-2.5 rounded-xl active:opacity-80"
          >
            <Plus size={15} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">{t.newClient}</Text>
          </Pressable>
        </View>
      </View>

      <View className="mb-4">
        <Input
          placeholder={t.searchPlaceholder}
          value={search}
          onChangeText={onSearchChange}
          leftIcon={<Search size={16} color="#9CA3AF" />}
          // Search is case-insensitive — turn off iOS smart-capitalize +
          // autocorrect so the input doesn't start each query with a
          // capital letter or try to "correct" partial names.
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {selectedIds.size > 0 ? (
        <View className="flex-row items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 mb-4">
          <Pressable onPress={onClearSelection} className="p-1 rounded">
            <X size={14} className="text-primary" />
          </Pressable>
          <Text className="text-sm font-medium text-primary">{selectedCountText}</Text>
          <View className="flex-1" />
          <Pressable
            onPress={onBulkDeletePress}
            disabled={bulkDeleting}
            className="flex-row items-center gap-1.5 bg-red-500 px-3 py-1.5 rounded-lg active:opacity-80"
          >
            <Trash2 size={14} color="#FFFFFF" />
            <Text className="text-xs font-semibold text-white">{t.bulkDelete}</Text>
          </Pressable>
        </View>
      ) : null}

      {showList ? (
        <View className="bg-white rounded-t-2xl border border-b-0 border-gray-100 overflow-hidden">
          <Pressable
            onPress={onToggleSelectAll}
            className="flex-row items-center gap-3 px-5 py-2 border-b border-gray-200 bg-gray-50/50 active:bg-gray-100"
          >
            <View
              className={`w-4 h-4 rounded border ${
                allSelected ? 'border-primary bg-primary' : 'border-gray-300 bg-white'
              } items-center justify-center`}
            >
              {allSelected ? (
                <Text className="text-white text-[10px] font-bold">✓</Text>
              ) : null}
            </View>
            <Text className="text-xs text-gray-400">{t.selectAll}</Text>
          </Pressable>
        </View>
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
          <User size={40} color="#D1D5DB" />
          <Text className="text-sm text-gray-400 mt-3">
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

  return (
    <View className="flex-1 bg-surface">
      <FlatList
        data={showList ? filtered : []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ClientRow
            client={item}
            search={search}
            isChecked={selectedIds.has(item.id)}
            isLast={item.id === lastFilteredId}
            onToggleSelect={onToggleSelect}
            onClientPress={onClientPress}
          />
        )}
        ListHeaderComponent={header}
        ListFooterComponent={
          <>
            {showList ? (
              <View className="bg-white rounded-b-2xl border border-t-0 border-gray-100 h-2" />
            ) : null}
            {bottomSlot}
          </>
        }
        // 12px inset (down from 24px) so rows are visibly wider than before
        // but the card still has a small breathing margin from the screen
        // edges.
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 24, paddingBottom: 144 }}
        // Tuning for long lists — keep the visible window small, recycle aggressively.
        initialNumToRender={15}
        windowSize={7}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

interface ClientRowProps {
  client: ClientListItem;
  search: string;
  isChecked: boolean;
  isLast: boolean;
  onToggleSelect: (id: string) => void;
  onClientPress: (id: string) => void;
}

const ClientRow = memo(function ClientRow({
  client: c,
  search,
  isChecked,
  isLast,
  onToggleSelect,
  onClientPress,
}: ClientRowProps) {
  const matchedContacts = matchingContacts(c, search);
  return (
    <View
      // Row sits inside the white card; border-x continues the card frame.
      // border-b-gray-200 keeps the divider readable (the original gray-50
      // was nearly invisible against the white card).
      className={`flex-row items-center justify-between px-5 py-4 bg-white border-x ${
        isLast ? '' : 'border-b border-b-gray-200'
      } border-x-gray-100 ${isChecked ? 'bg-primary/5' : ''}`}
    >
      <View className="flex-row items-center gap-3 min-w-0 flex-1">
        <Pressable
          onPress={() => onToggleSelect(c.id)}
          className={`w-4 h-4 rounded border ${
            isChecked ? 'border-primary bg-primary' : 'border-gray-300 bg-white'
          } items-center justify-center`}
        >
          {isChecked ? <Text className="text-white text-[10px] font-bold">✓</Text> : null}
        </Pressable>
        <Pressable
          onPress={() => onClientPress(c.id)}
          className="flex-row items-center gap-3 min-w-0 flex-1 active:opacity-70"
        >
          <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
            <Text className="text-primary text-sm font-bold">
              {c.firstName.charAt(0).toUpperCase()}
              {c.lastName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
              {c.firstName} {c.lastName}
              {c.company ? (
                <Text className="text-gray-400 font-normal"> · {c.company}</Text>
              ) : null}
            </Text>
            <View className="flex-row flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {c.phoneDisplay ? (
                <View className="flex-row items-center gap-1">
                  <Phone size={11} color="#9CA3AF" />
                  <Text className="text-xs text-gray-400">{c.phoneDisplay}</Text>
                </View>
              ) : null}
              {c.emailDisplay ? (
                <View className="flex-row items-center gap-1">
                  <Mail size={11} color="#9CA3AF" />
                  <Text className="text-xs text-gray-400">{c.emailDisplay}</Text>
                </View>
              ) : null}
              {c.city ? (
                <View className="flex-row items-center gap-1">
                  <MapPin size={11} color="#9CA3AF" />
                  <Text className="text-xs text-gray-400">
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
                    <Users size={11} color="#4F46E5" />
                    <Text className="text-xs font-medium text-primary" numberOfLines={1}>
                      {ct.name}
                      {ct.role ? `  ·  ${ct.role}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>
    </View>
  );
});
