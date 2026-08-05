import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator, Modal as RNModal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check, RotateCcw, Lock, Plus, Pencil, Trash2 } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';
import { useLang } from '@/lib/i18n/LangProvider';
import {
  DEFAULT_ROLE_PERMISSIONS,
  RESOURCE_KEYS,
  RESOURCE_ACTIONS,
  ROLE_LABELS,
  roleLabel,
  roleDescription,
  getActiveCustomRoles,
  isCustomRole,
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
  createCustomRole,
  renameCustomRole,
  deleteCustomRole,
} from '@amixos/shared/lib/roleEditor';

// Owner is deliberately absent: it always has full control and can't be
// edited, so a tab for it only invites confusion.
const ALL_ROLES: Role[] = ['admin', 'manager', 'office', 'field', 'viewer'];

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
  const { business, currentRole, roleOverrides, reloadPermissions, locations } = useApp();
  // Equipment is a module-gated resource — only show its toggle when the
  // equipment module is active for this business.
  const { modules: enabledModules } = useEnabledModules(supabase, business?.id ?? null);
  const equipmentActive = enabledModules.some(m => m.id === 'equipment');
  const resourceKeys = useMemo(
    () => RESOURCE_KEYS.filter(r => r !== 'equipment' || equipmentActive),
    [equipmentActive],
  );
  const multiLocation = (locations?.length ?? 0) > 1;
  const { t: full, locale } = useLang();
  const t = full.dashboard.roles;
  const tc = full.common;
  const c = useThemeColors();

  useEffect(() => {
    if (currentRole && !can.manageMembers(currentRole)) router.back();
  }, [currentRole]);

  const [selected, setSelected] = useState<Role>('admin');
  // Custom roles registered by the overrides loader; re-read whenever
  // roleOverrides changes (they're loaded together).
  const customRoles = useMemo(() => getActiveCustomRoles(), [roleOverrides]);
  const custom = isCustomRole(selected);
  const effective = useMemo(
    // Custom roles always have an override row; the viewer fallback only
    // covers the moment right after deleting the selected custom role.
    () => roleOverrides[selected] ?? DEFAULT_ROLE_PERMISSIONS[selected] ?? DEFAULT_ROLE_PERMISSIONS.viewer,
    [roleOverrides, selected],
  );
  const [draft, setDraft] = useState(() => clonePermissions(effective));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Create/rename bottom sheet state.
  const [sheetMode, setSheetMode] = useState<'create' | 'rename' | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [sheetBase, setSheetBase] = useState<Role>('field');
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState(false);

  useEffect(() => { setDraft(clonePermissions(effective)); setSaved(false); setError(false); setErrorText(null); }, [effective]);

  const editable = isRoleEditable(selected);
  const dirty = editable && JSON.stringify(draft) !== JSON.stringify(effective);
  const customized = !custom && (!equalsDefault(selected, draft) || !!roleOverrides[selected]);

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

  const doDelete = async () => {
    if (!business || busy) return;
    setBusy(true); setError(false); setErrorText(null);
    const r = await deleteCustomRole(supabase, business.id, selected);
    if (r.ok) {
      await reloadPermissions();
      setSelected('admin');
    } else {
      setError(true);
      setErrorText(r.inUse ? t.deleteRoleInUse : t.deleteRoleError);
    }
    setBusy(false);
  };
  const confirmDelete = () =>
    Alert.alert('', t.deleteRoleConfirm, [
      { text: tc.buttons.cancel, style: 'cancel' },
      { text: t.deleteRole, style: 'destructive', onPress: () => void doDelete() },
    ]);

  const openCreate = () => { setSheetName(''); setSheetBase('field'); setSheetError(false); setSheetMode('create'); };
  const openRename = () => { setSheetName(roleLabel(selected, locale)); setSheetError(false); setSheetMode('rename'); };

  const sheetSubmit = async () => {
    if (!business || sheetBusy || !sheetName.trim()) return;
    setSheetBusy(true); setSheetError(false);
    if (sheetMode === 'create') {
      const key = await createCustomRole(supabase, business.id, sheetName, sheetBase);
      if (key) {
        await reloadPermissions();
        setSelected(key as Role);
        setSheetMode(null);
      } else setSheetError(true);
    } else {
      const ok = await renameCustomRole(supabase, business.id, selected, sheetName);
      if (ok) { await reloadPermissions(); setSheetMode(null); } else setSheetError(true);
    }
    setSheetBusy(false);
  };

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

        {/* Role selector — built-ins, then custom roles, then "+ new role" */}
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
            {customRoles.map(cr => (
              <Pressable
                key={cr.key}
                onPress={() => setSelected(cr.key as Role)}
                className={`px-3.5 py-2 rounded-xl border ${selected === cr.key ? 'bg-primary border-primary' : 'bg-card border-border'}`}
              >
                <Text className={`text-sm font-semibold ${selected === cr.key ? 'text-white' : 'text-ink'}`}>
                  {cr.name}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={openCreate}
              className="px-3.5 py-2 rounded-xl border border-dashed border-border bg-card flex-row items-center gap-1"
            >
              <Plus size={14} color={c.primary} />
              <Text className="text-sm font-semibold text-primary">{t.newRole}</Text>
            </Pressable>
          </View>
        </ScrollView>

        <View className="bg-card rounded-2xl border border-border-soft p-5">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 flex-row items-center gap-2">
              <Text className="text-base font-bold text-ink" numberOfLines={1}>{roleLabel(selected, locale)}</Text>
              {custom ? (
                <Pressable onPress={openRename} hitSlop={8}>
                  <Pencil size={14} color={c.muted} />
                </Pressable>
              ) : null}
            </View>
            {custom ? (
              <View className="bg-primary/10 px-2 py-0.5 rounded-full">
                <Text className="text-[11px] font-semibold text-primary">{t.customRoleBadge}</Text>
              </View>
            ) : customized && editable ? (
              <View className="bg-primary/10 px-2 py-0.5 rounded-full">
                <Text className="text-[11px] font-semibold text-primary">{t.customized}</Text>
              </View>
            ) : null}
          </View>
          <Text className="text-xs text-muted mt-0.5">{custom ? t.customRoleDesc : roleDescription(selected, locale)}</Text>

          {!editable ? (
            <View className="mt-4 flex-row items-center gap-2 px-4 py-3 rounded-xl bg-surface border border-border-soft">
              <Lock size={15} color={c.muted} />
              <Text className="text-sm text-muted flex-1">{t.ownerLocked}</Text>
            </View>
          ) : null}

          {/* Data access */}
          <Text className="text-xs font-semibold text-faint uppercase mt-6 mb-1">{t.sectionData}</Text>
          {resourceKeys.map(r => {
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
          {EDITABLE_CAPS.filter(key => capAppliesToRole(key, selected) && (key !== 'switchLocations' || multiLocation)).map(key => (
            <View key={key} className="flex-row items-center justify-between py-2.5 border-t border-border-soft">
              <Text className="text-sm text-ink flex-1 mr-3">{t.capNames[key]}</Text>
              <CheckBox checked={draft.caps[key]} disabled={!editable} onPress={() => setCap(key, !draft.caps[key])} />
            </View>
          ))}
        </View>

        {error ? (
          <View className="mt-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-100">
            <Text className="text-sm text-red-600">{errorText ?? t.saveError}</Text>
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
            {custom ? (
              <Pressable onPress={confirmDelete} disabled={busy} className="flex-row items-center gap-1.5 px-4 py-3.5 rounded-2xl bg-red-500/10 active:bg-red-500/20">
                <Trash2 size={15} color="#dc2626" />
                <Text className="text-base font-semibold text-red-600">{t.deleteRole}</Text>
              </Pressable>
            ) : customized ? (
              <Pressable onPress={confirmReset} disabled={busy} className="flex-row items-center gap-1.5 px-4 py-3.5 rounded-2xl bg-border-soft active:bg-border">
                <RotateCcw size={15} color={c.muted} />
                <Text className="text-base font-semibold text-ink">{t.reset}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* Create / rename custom role — bottom sheet (backdrop Pressable as
         absolute first child; card as plain sibling so its inputs work). */}
      <RNModal visible={sheetMode !== null} transparent animationType="slide" onRequestClose={() => setSheetMode(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
          <Pressable onPress={() => setSheetMode(null)} className="absolute inset-0 bg-black/40" />
          <View className="bg-card rounded-t-3xl px-5 pt-5 pb-8">
            <Text className="text-base font-bold text-ink mb-4">
              {sheetMode === 'rename' ? t.renameRoleTitle : t.newRoleTitle}
            </Text>
            <Text className="text-sm font-semibold text-ink mb-2">{t.roleNameLabel}</Text>
            <TextInput
              value={sheetName}
              onChangeText={setSheetName}
              placeholder={t.roleNamePlaceholder}
              placeholderTextColor={c.faint}
              autoFocus
              className="rounded-2xl border border-border bg-surface px-4 py-3.5 text-base text-ink"
            />
            {sheetMode === 'create' ? (
              <>
                <Text className="text-sm font-semibold text-ink mt-4 mb-2">{t.baseRoleLabel}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {ALL_ROLES.map(r => (
                    <Pressable
                      key={r}
                      onPress={() => setSheetBase(r)}
                      className={`px-3 py-2 rounded-xl border ${sheetBase === r ? 'bg-primary border-primary' : 'bg-surface border-border'}`}
                    >
                      <Text className={`text-sm font-semibold ${sheetBase === r ? 'text-white' : 'text-ink'}`}>
                        {ROLE_LABELS[r][locale]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {sheetError ? (
              <Text className="text-sm text-red-600 mt-3">{t.createError}</Text>
            ) : null}
            <Pressable
              onPress={sheetSubmit}
              disabled={sheetBusy || !sheetName.trim()}
              className={`mt-5 flex-row items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-primary ${(sheetBusy || !sheetName.trim()) ? 'opacity-40' : 'active:opacity-90'}`}
            >
              {sheetBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <Text className="text-base font-semibold text-white">
                  {sheetMode === 'rename' ? tc.buttons.save : t.createBtn}
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </RNModal>
    </SafeAreaView>
  );
}
