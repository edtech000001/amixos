import { useMemo, useState } from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Check, X, Search } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import type { FieldClient } from '@amixos/shared/lib/fieldHome';

// Field-crew quick-log bottom sheet. Records a completed job (title + optional
// client + notes); date is "today" and status is completed (set by the parent
// via logFieldJob). One-handed: bottom sheet, not a centered dialog.
export interface LogJobSheetProps {
  visible: boolean;
  onClose: () => void;
  clients: FieldClient[];
  clientsLoading: boolean;
  onSubmit: (input: { title: string; clientId: string | null; description: string | null }) => Promise<boolean>;
}

export function LogJobSheet({ visible, onClose, clients, clientsLoading, onSubmit }: LogJobSheetProps) {
  const { t: full } = useLang();
  const f = full.dashboard.fieldHome;
  const tc = full.common;

  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle(''); setClientId(null); setNotes(''); setSearch(''); setError(null); setBusy(false);
  };
  const close = () => { reset(); onClose(); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c => c.name.toLowerCase().includes(q));
  }, [clients, search]);

  const submit = async () => {
    if (busy) return;
    if (!title.trim()) { setError(f.titleRequired); return; }
    setBusy(true);
    setError(null);
    const ok = await onSubmit({ title: title.trim(), clientId, description: notes.trim() || null });
    setBusy(false);
    if (ok) close();
    else setError(f.saveError2);
  };

  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable onPress={close} className="flex-1 bg-black/40 justify-end">
        <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-5 pb-10 pt-4 max-h-[88%]">
          <View className="items-center mb-3">
            <View className="w-10 h-1 bg-gray-200 rounded-full" />
          </View>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-bold text-gray-900">{f.logTitle}</Text>
            <Pressable onPress={close} hitSlop={8} className="p-1">
              <X size={20} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Title */}
            <Text className="text-sm font-medium text-gray-700 mb-1.5">{f.jobTitleLabel}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={f.jobTitlePlaceholder}
              placeholderTextColor="#9CA3AF"
              className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-4"
            />

            {/* Client */}
            <Text className="text-sm font-medium text-gray-700 mb-1.5">{f.clientLabel}</Text>
            <View className="flex-row items-center border border-gray-200 rounded-xl px-3 mb-2">
              <Search size={16} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={f.clientSearch}
                placeholderTextColor="#9CA3AF"
                className="flex-1 px-2 py-3 text-base text-gray-900"
              />
            </View>
            <View className="border border-gray-100 rounded-xl overflow-hidden mb-4 max-h-56">
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                <Pressable
                  onPress={() => setClientId(null)}
                  className="flex-row items-center justify-between px-4 py-3 active:bg-gray-50 border-b border-gray-50"
                >
                  <Text className={`text-sm ${clientId === null ? 'text-primary font-semibold' : 'text-gray-600'}`}>
                    {f.noClientOption}
                  </Text>
                  {clientId === null ? <Check size={16} color="#4F46E5" /> : null}
                </Pressable>
                {clientsLoading ? (
                  <View className="py-6 items-center"><ActivityIndicator size="small" color="#4F46E5" /></View>
                ) : filtered.length === 0 ? (
                  <Text className="text-sm text-gray-400 text-center py-6">{f.noResults}</Text>
                ) : (
                  filtered.map(c => (
                    <Pressable
                      key={c.id}
                      onPress={() => setClientId(c.id)}
                      className="flex-row items-center justify-between px-4 py-3 active:bg-gray-50 border-b border-gray-50"
                    >
                      <Text className={`text-sm flex-1 ${clientId === c.id ? 'text-primary font-semibold' : 'text-gray-800'}`} numberOfLines={1}>
                        {c.name}
                      </Text>
                      {clientId === c.id ? <Check size={16} color="#4F46E5" /> : null}
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>

            {/* Notes */}
            <Text className="text-sm font-medium text-gray-700 mb-1.5">{f.notesLabel}</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-4 min-h-[72px]"
              style={{ textAlignVertical: 'top' }}
            />

            {error ? (
              <View className="mb-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
                <Text className="text-sm text-red-600">{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View className="gap-2.5 mt-1">
            <Pressable
              onPress={submit}
              disabled={busy}
              className={`py-3.5 rounded-2xl items-center bg-primary active:opacity-90 ${busy ? 'opacity-50' : ''}`}
            >
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <Text className="text-base font-semibold text-white">{tc.buttons.save}</Text>
              )}
            </Pressable>
            <Pressable onPress={close} className="py-3.5 rounded-2xl bg-gray-100 items-center active:bg-gray-200">
              <Text className="text-base font-semibold text-gray-700">{tc.buttons.cancel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
