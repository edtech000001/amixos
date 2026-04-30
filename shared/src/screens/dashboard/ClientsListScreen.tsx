import { useMemo, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import {
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Pencil,
  Trash2,
  User,
  Upload,
  X,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Input } from '../../ui/Input';

export interface ClientListItem {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  phoneDisplay: string | null;
  emailDisplay: string | null;
  city: string | null;
  state: string | null;
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients.filter(c =>
      [
        c.firstName,
        c.lastName,
        c.company,
        c.phoneDisplay,
        c.emailDisplay,
        c.city,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [clients, search]);

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const selectedCountText = (
    selectedIds.size === 1 ? t.selectedCountSingle : t.selectedCountPlural
  ).replace('{{count}}', String(selectedIds.size));

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="p-6">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            {t.countTotal.replace('{{count}}', String(clients.length))}
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

      {/* Search */}
      <View className="mb-4">
        <Input
          placeholder={t.searchPlaceholder}
          value={search}
          onChangeText={onSearchChange}
          leftIcon={<Search size={16} color="#9CA3AF" />}
        />
      </View>

      {/* Bulk action bar */}
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

      {/* List */}
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
      ) : (
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* Select all bar */}
          <Pressable
            onPress={onToggleSelectAll}
            className="flex-row items-center gap-3 px-5 py-2 border-b border-gray-100 bg-gray-50/50 active:bg-gray-100"
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

          {filtered.map((c, i) => {
            const isChecked = selectedIds.has(c.id);
            return (
              <View
                key={c.id}
                className={`flex-row items-center justify-between px-5 py-4 ${
                  i < filtered.length - 1 ? 'border-b border-gray-50' : ''
                } ${isChecked ? 'bg-primary/5' : ''}`}
              >
                <View className="flex-row items-center gap-3 min-w-0 flex-1">
                  <Pressable
                    onPress={() => onToggleSelect(c.id)}
                    className={`w-4 h-4 rounded border ${
                      isChecked ? 'border-primary bg-primary' : 'border-gray-300 bg-white'
                    } items-center justify-center`}
                  >
                    {isChecked ? (
                      <Text className="text-white text-[10px] font-bold">✓</Text>
                    ) : null}
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
                    </View>
                  </Pressable>
                </View>
                <View className="flex-row items-center gap-1">
                  <Pressable
                    onPress={() => onEditPress(c.id)}
                    className="p-2 rounded-lg active:bg-gray-100"
                  >
                    <Pencil size={14} color="#9CA3AF" />
                  </Pressable>
                  <Pressable
                    onPress={() => onDeletePress(c.id)}
                    className="p-2 rounded-lg active:bg-red-50"
                  >
                    <Trash2 size={14} color="#F87171" />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {bottomSlot}
    </ScrollView>
  );
}
