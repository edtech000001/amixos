// Account + business deletion, mobile (App Store guideline 5.1.1(v): an app
// that offers account creation must let the user delete it from INSIDE the
// app — a link to the website does not satisfy the review).
//
// Mirrors web/src/components/dashboard/AccountDangerZone.tsx:
//   • Delete my account — the API refuses while the caller still owns a
//     business with other members (owner_id cascades and would take their
//     team's data), and names the businesses in the way.
//   • Delete this business — the owner's own call, allowed with members, and
//     the way out of that block.
//
// Both schedule a 30-day window; nothing is destroyed until it closes.
//
// The confirm step is an in-card expansion rather than a second RNModal: this
// card can be reached from screens that already present one, and iOS silently
// refuses to stack them (see CLAUDE.md).

import { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { AlertTriangle, Trash2 } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useApp } from '@/lib/AppContext';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { useAuthStore } from '@/lib/auth/store';
import { formatDateLong } from '@amixos/shared/lib/format';
import {
  fetchAccountStatus,
  requestAccountDeletion,
  requestBusinessDeletion,
  type AccountStatus,
  type DeletionBlocker,
} from '@amixos/shared/lib/accountDeletion';

type Target = { kind: 'account' } | { kind: 'business'; businessId: string; name: string | null };

export function AccountDangerZone() {
  const { business } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.account.danger;
  const c = useThemeColors();
  const dateLoc = locale === 'en' ? 'en-US' : 'es-MX';
  const logout = useAuthStore(s => s.logout);

  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<DeletionBlocker[] | null>(null);

  const ctx = async () => ({ apiBaseUrl: getApiBaseUrl(), jwt: await getJwt() });

  const load = async () => {
    try {
      setStatus(await fetchAccountStatus(await ctx()));
    } catch {
      setStatus(null); // API unreachable — the card still offers the action
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [business?.id]);

  const ownsActive = status?.ownedBusinesses.some(b => b.businessId === business?.id) ?? false;
  const activePending = status?.pendingBusinessDeletions.find(p => p.businessId === business?.id);

  const open = (next: Target) => { setTarget(next); setTyped(''); setError(null); setBlockers(null); };

  const confirm = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      const cx = await ctx();
      if (target.kind === 'account') {
        await requestAccountDeletion(cx);
        // Sign out straight away: signing back in is what offers the restore.
        await logout();
        return;
      }
      await requestBusinessDeletion(cx, target.businessId);
      setTarget(null);
      await load();
    } catch (e) {
      const err = e as Error & { code?: string; blockers?: DeletionBlocker[] };
      if (err.code === 'owns_business_with_members' && err.blockers?.length) setBlockers(err.blockers);
      else setError(t.failed);
    } finally {
      setBusy(false);
    }
  };

  const canConfirm = typed.trim().toUpperCase() === t.confirmWord;
  const previewDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return formatDateLong(d, dateLoc);
  })();

  return (
    <View className="bg-card rounded-2xl border border-red-500/30 p-5 gap-3">
      <Text className="text-base font-bold text-red-600">{t.heading}</Text>

      {ownsActive ? (
        <View className="gap-1">
          <Text className="text-sm font-semibold text-ink">{t.deleteBusiness}</Text>
          <Text className="text-xs text-muted">{t.deleteBusinessBody}</Text>
          {activePending ? (
            <Text className="text-xs font-semibold text-amber-600 mt-1">
              {t.scheduledBusiness.replace('{{date}}', formatDateLong(activePending.purgeAfter, dateLoc))}
            </Text>
          ) : (
            <Pressable
              onPress={() => open({ kind: 'business', businessId: business!.id, name: business!.name })}
              className="mt-2 flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-red-500/30 active:bg-red-500/10"
            >
              <Trash2 size={15} color="#dc2626" />
              <Text className="text-sm font-semibold text-red-600">{t.deleteBusiness}</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <View className={`gap-1 ${ownsActive ? 'pt-3 border-t border-border-soft' : ''}`}>
        <Text className="text-sm font-semibold text-ink">{t.deleteAccount}</Text>
        <Text className="text-xs text-muted">{t.deleteAccountBody}</Text>
        <Pressable
          onPress={() => open({ kind: 'account' })}
          className="mt-2 flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-red-500/30 active:bg-red-500/10"
        >
          <Trash2 size={15} color="#dc2626" />
          <Text className="text-sm font-semibold text-red-600">{t.deleteAccount}</Text>
        </Pressable>
      </View>

      {/* Confirm / blocked — expands in place (no nested RNModal). */}
      {target ? (
        <View className="mt-1 pt-3 border-t border-border-soft gap-3">
          {blockers ? (
            <>
              <Text className="text-sm font-bold text-ink">{t.blockedTitle}</Text>
              <Text className="text-xs text-muted">{t.blockedBody}</Text>
              <View className="gap-2">
                {blockers.map(b => (
                  <View key={b.businessId} className="rounded-xl border border-border px-3 py-2">
                    <Text className="text-sm text-ink">
                      {t.blockedMember.replace('{{name}}', b.name ?? '—').replace('{{count}}', String(b.otherMembers))}
                    </Text>
                  </View>
                ))}
              </View>
              <Pressable onPress={() => setTarget(null)} className="py-3 rounded-2xl items-center border border-border active:bg-surface">
                <Text className="text-sm font-semibold text-muted">{t.cancelBtn}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View className="flex-row items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                <AlertTriangle size={16} color="#dc2626" />
                <Text className="flex-1 text-xs text-ink">
                  {target.kind === 'business'
                    ? t.confirmBusinessBody.replace('{{name}}', target.name ?? '—').replace('{{date}}', previewDate)
                    : t.confirmBody.replace('{{date}}', previewDate)}
                </Text>
              </View>
              <Text className="text-xs font-semibold text-ink">
                {t.typeToConfirm.replace('{{word}}', t.confirmWord)}
              </Text>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholderTextColor={c.faint}
                className="rounded-xl border border-border bg-card px-3 py-2.5 text-base text-ink"
              />
              {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
              <View className="flex-row gap-2">
                <Pressable onPress={() => setTarget(null)} className="flex-1 py-3 rounded-2xl items-center border border-border active:bg-surface">
                  <Text className="text-sm font-semibold text-muted">{t.cancelBtn}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void confirm()}
                  disabled={!canConfirm || busy}
                  className={`flex-1 py-3 rounded-2xl items-center flex-row justify-center gap-2 ${
                    !canConfirm || busy ? 'bg-red-500/40' : 'bg-red-600 active:opacity-90'
                  }`}
                >
                  {busy ? <ActivityIndicator size="small" color="#fff" /> : null}
                  <Text className="text-sm font-semibold text-white">{t.confirmBtn}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}
