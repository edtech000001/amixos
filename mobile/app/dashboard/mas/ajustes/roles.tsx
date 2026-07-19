import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check, RotateCcw, Lock } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import {
  DEFAULT_ROLE_PERMISSIONS,
  RESOURCE_KEYS,
  RESOURCE_ACTIONS,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  can,
  type Role,
  type ResourceKey,
  type ViewScope,
} from '@amixos/shared/lib/permissions';
import { useThemeColors } from '@/lib/ThemeProvider';
import {
  EDITABLE_CAPS,
  capAppliesToRole,
  isRoleEditable,
  clonePermissions,
  equalsDefault,
  saveRoleOverride,
  resetRoleOverride,
} from '@amixos/shared/lib/roleEditor';

const ALL_ROLES: Role[] = ['owner', 'admin', 'manager', 'office', 'field', 'viewer'];

function CheckBox({ checked, disabled, onPress }: { checked: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      className={`w-6 h-6 rounded-md border items-center justify-center ${
        checked ? 'bg-primary border-primary' : 'bg-card border-border'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {checked ? <Check size={15} color="#FFFFFF" /> : null}
    </Pressable>
  );
}

export default function RolesScreen() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, currentRole, roleOverrides, reloadPermissions } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.roles;
  const tc = full.common;
  const c = useThemeColors();

  useEffect(() => {
    if (currentRole && !can.manageMembers(currentRole)) router.back();
  }, [currentRole]);

  const [selected, setSelected] = useState<Role>('admin');
  const effective = useMemo(
    () => roleOverrides[selected] ?? DEFAULT_ROLE_PERMISSIONS[selected],
    [roleOverrides, selected],
  );
  const [draft, setDraft] = useState(() => clonePermissions(effective));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => { setDraft(clonePermissions(effective)); setSaved(false); setError(false); }, [effective]);

  const editable = isRoleEditable(selected);
  const dirty = editable && JSON.stringify(draft) !== JSON.stringify(effective);
  const customized = !equalsDefault(selected, draft) || !!roleOverrides[selected];

  const setView = (r: ResourceKey, view: ViewScope) =>
    setDraft(d => ({ ...d, resources: { ...d.resources, [r]: { ...d.resources[r], view } } }));
  const setAction = (r: ResourceKey, action: 'create' | 'edit' | 'delete', value: boolean) =>
    setDraft(d => ({ ...d, resources: { ...d.resources, [r]: { ...d.resources[r], [action]: value } } }));
  const setCap = (key: typeof EDITABLE_CAPS[number], value: boolean) =>
    setDraft(d => ({ ...d, caps: { ...d.caps, [key]: value } }));

  const save = async () => {
    if (!business || busy) return;
    setBusy(true); setError(false);
    const ok = await saveRoleOverride(supabase, business.id, selected, draft);
    if (ok) { await reloadPermissions(); setSaved(true); } else setError(true);
    setBusy(false);
  };

  const doReset = async () => {
    if (!business || busy) return;
    setBusy(true); setError(false);
    const ok = await resetRoleOverride(supabase, business.id, selected);
    if (ok) { await reloadPermissions(); setDraft(clonePermissions(DEFAULT_ROLE_PERMISSIONS[selected])); setSaved(true); }
    else setError(true);
    setBusy(false);
  };
  const confirmReset = () =>
    Alert.alert('', t.resetConfirm, [
      { text: tc.buttons.cancel, style: 'cancel' },
      { text: t.reset, style: 'destructive', onPress: () => void doReset() },
    ]);

  const SCOPE_LABEL: Record<ViewScope, string> = { none: t.scopeNone, assigned: t.scopeAssigned, all: t.scopeAll };

  const Segmented = ({ value, onChange }: { value: ViewScope; onChange: (v: ViewScope) => void }) => (
    <View className="flex-row rounded-lg border border-border overflow-hidden">
      {(['none', 'assigned', 'all'] as ViewScope[]).map(s => (
        <Pressable
          key={s}
          onPress={editable ? () => onChange(s) : undefined}
          className={`px-2.5 py-1 ${value === s ? 'bg-primary' : 'bg-card'} ${editable ? '' : 'opacity-60'}`}
        >
          <Text className={`text-xs font-semibold ${value === s ? 'text-white' : 'text-muted'}`}>{SCOPE_LABEL[s]}</Text>
        </Pressable>
      ))}
    </View>
  );

  const ActionChip = ({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) => (
    <Pressable onPress={editable ? onToggle : undefined} className="flex-row items-center gap-1.5">
      <CheckBox checked={checked} disabled={!editable} onPress={onToggle} />
      <Text className="text-xs text-muted">{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-1">
        <Pressable onPress={() => router.back()} hitSlop={8} className="p-2 -ml-2">
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <Text className="text-base font-semibold text-ink ml-1">{t.title}</Text>
      </View>

      <ScrollView contentContainerClassName="px-5 pb-40 pt-2">
        <Text className="text-sm text-muted mb-4">{t.subtitle}</Text>

        {/* Role selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          <View className="flex-row gap-2">
            {ALL_ROLES.map(r => (
              <Pressable
                key={r}
                onPress={() => setSelected(r)}
                className={`px-3.5 py-2 rounded-xl border ${selected === r ? 'bg-primary border-primary' : 'bg-card border-border'}`}
              >
                <Text className={`text-sm font-semibold ${selected === r ? 'text-white' : 'text-ink'}`}>
                  {ROLE_LABELS[r][locale]}{roleOverrides[r] ? ' •' : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <View className="bg-card rounded-2xl border border-border-soft p-5">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-base font-bold text-ink">{ROLE_LABELS[selected][locale]}</Text>
              <Text className="text-xs text-muted mt-0.5">{ROLE_DESCRIPTIONS[selected][locale]}</Text>
            </View>
            {customized && editable ? (
              <View className="bg-primary/10 px-2 py-0.5 rounded-full">
                <Text className="text-[11px] font-semibold text-primary">{t.customized}</Text>
              </View>
            ) : null}
          </View>

          {!editable ? (
            <View className="mt-4 flex-row items-center gap-2 px-4 py-3 rounded-xl bg-surface border border-border-soft">
              <Lock size={15} color={c.muted} />
              <Text className="text-sm text-muted flex-1">{t.ownerLocked}</Text>
            </View>
          ) : null}

          {/* Data access */}
          <Text className="text-xs font-semibold text-faint uppercase mt-6 mb-1">{t.sectionData}</Text>
          {RESOURCE_KEYS.map(r => {
            const meta = RESOURCE_ACTIONS[r];
            const rp = draft.resources[r];
            return (
              <View key={r} className="border-t border-border-soft py-3">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-medium text-ink">{t.resourceNames[r]}</Text>
                  {meta.assignedView ? (
                    <Segmented value={rp.view} onChange={v => setView(r, v)} />
                  ) : (
                    <ActionChip label={t.colView} checked={rp.view === 'all'} onToggle={() => setView(r, rp.view === 'all' ? 'none' : 'all')} />
                  )}
                </View>
                {(meta.create || meta.edit || meta.delete) ? (
                  <View className="flex-row flex-wrap gap-x-5 gap-y-2">
                    {meta.create ? <ActionChip label={t.colCreate} checked={rp.create} onToggle={() => setAction(r, 'create', !rp.create)} /> : null}
                    {meta.edit ? <ActionChip label={t.colEdit} checked={rp.edit} onToggle={() => setAction(r, 'edit', !rp.edit)} /> : null}
                    {meta.delete ? <ActionChip label={t.colDelete} checked={rp.delete} onToggle={() => setAction(r, 'delete', !rp.delete)} /> : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          {/* System */}
          <Text className="text-xs font-semibold text-faint uppercase mt-6 mb-1">{t.sectionSystem}</Text>
          {EDITABLE_CAPS.filter(key => capAppliesToRole(key, selected)).map(key => (
            <View key={key} className="flex-row items-center justify-between py-2.5 border-t border-border-soft">
              <Text className="text-sm text-ink flex-1 mr-3">{t.capNames[key]}</Text>
              <CheckBox checked={draft.caps[key]} disabled={!editable} onPress={() => setCap(key, !draft.caps[key])} />
            </View>
          ))}
        </View>

        {error ? (
          <View className="mt-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-100">
            <Text className="text-sm text-red-600">{t.saveError}</Text>
          </View>
        ) : null}
        {saved && !dirty ? (
          <View className="mt-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-100">
            <Text className="text-sm text-emerald-700">{t.saved}</Text>
          </View>
        ) : null}

        {editable ? (
          <View className="flex-row gap-2 mt-4">
            <Pressable
              onPress={save}
              disabled={!dirty || busy}
              className={`flex-1 flex-row items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-primary ${(!dirty || busy) ? 'opacity-40' : 'active:opacity-90'}`}
            >
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <>
                  <Check size={16} color="#FFFFFF" />
                  <Text className="text-base font-semibold text-white">{tc.buttons.save}</Text>
                </>
              )}
            </Pressable>
            {customized ? (
              <Pressable onPress={confirmReset} disabled={busy} className="flex-row items-center gap-1.5 px-4 py-3.5 rounded-2xl bg-border-soft active:bg-border">
                <RotateCcw size={15} color={c.muted} />
                <Text className="text-base font-semibold text-ink">{t.reset}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
