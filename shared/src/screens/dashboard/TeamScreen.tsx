import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal as RNModal, Platform } from 'react-native';
import {
  UserPlus,
  Mail,
  ChevronRight,
  X,
  Trash2,
  Copy,
  Check,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { Input, Button, Fab } from '../../ui';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, INVITABLE_ROLES, type Role } from '../../lib/permissions';

export interface TeamMember {
  id: string;            // business_members.id
  userId: string;
  email: string;
  displayName: string | null;
  role: Role;
  isYou: boolean;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: Role;
  token: string;
  expiresAt: string;     // ISO
  acceptUrl: string;     // full URL ready to share
}

export interface TeamScreenProps {
  loading: boolean;
  members: TeamMember[];
  invites: TeamInvite[];
  // The current user's role in the active business. Determines whether the
  // Invite / Remove / Change-Role controls render.
  currentRole: Role | null;
  onInvite: (email: string, role: Role) => Promise<{ ok: boolean; reason?: string }>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onChangeRole: (memberId: string, role: Role) => Promise<void>;
  // Show a transient "copied" indicator; caller handles actual clipboard write.
  onCopyInviteLink: (acceptUrl: string) => Promise<void> | void;
  // Optional: render the back button (mobile uses it; web sidebar tab does not).
  onBack?: () => void;
}

const ROLE_BADGE_COLORS: Record<Role, string> = {
  owner:   'bg-purple-100 text-purple-700',
  admin:   'bg-blue-100 text-blue-700',
  manager: 'bg-emerald-100 text-emerald-700',
  office:  'bg-amber-100 text-amber-700',
  field:   'bg-border-soft text-muted',
  viewer:  'bg-slate-100 text-slate-600',
};

export function TeamScreen({
  loading,
  members,
  invites,
  currentRole,
  onInvite,
  onRevokeInvite,
  onRemoveMember,
  onChangeRole,
  onCopyInviteLink,
}: TeamScreenProps) {
  const { t: full, locale } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.settings.team;

  const lang = locale === 'es' ? 'es' : 'en';
  const canManage = currentRole === 'owner' || currentRole === 'admin';

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('manager');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [rolePickerFor, setRolePickerFor] = useState<TeamMember | null>(null);

  const submitInvite = async () => {
    setInviteError(null);
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const result = await onInvite(inviteEmail.trim(), inviteRole);
    setInviting(false);
    if (result.ok) {
      setInviteEmail('');
      setInviteRole('manager');
      setInviteOpen(false);
    } else {
      setInviteError(result.reason ?? t.inviteFailedToast);
    }
  };

  const copyLink = async (invite: TeamInvite) => {
    await onCopyInviteLink(invite.acceptUrl);
    setCopiedToken(invite.token);
    setTimeout(() => setCopiedToken(prev => (prev === invite.token ? null : prev)), 2000);
  };

  return (
    <View className="flex-1">
    <ScrollView contentContainerClassName="px-5 pt-5 pb-32">
      {/* Heading */}
      <View className="flex-row items-start justify-between mb-5">
        <View className="flex-1 mr-3">
          <Text className="text-2xl font-bold text-ink">{t.heading}</Text>
          <Text className="text-sm text-muted mt-0.5">{t.subtitle}</Text>
        </View>
      </View>

      {/* Members */}
      <Text className="text-xs font-semibold text-faint uppercase tracking-wide mb-2 ml-1">
        {t.membersHeading}
      </Text>
      <View className="bg-card rounded-2xl border border-border-soft overflow-hidden mb-5">
        {loading ? (
          <View className="px-5 py-8 items-center">
            <View className="flex-row gap-1">
              {[0,1,2].map(i => <View key={i} className="w-2 h-2 rounded-full bg-primary" />)}
            </View>
          </View>
        ) : members.length === 0 ? (
          <View className="px-5 py-8">
            <Text className="text-sm text-faint text-center">{t.noMembersYet}</Text>
          </View>
        ) : (
          members.map((m, i) => {
            const isLast = i === members.length - 1;
            const isOwner = m.role === 'owner';
            return (
              <View
                key={m.id}
                className={`flex-row items-center gap-3 px-4 py-3.5 ${
                  isLast ? '' : 'border-b border-border-soft'
                }`}
              >
                <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                  <Text className="text-primary font-bold text-sm">
                    {(m.displayName ?? m.email).charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                    {m.displayName ?? m.email}
                    {m.isYou ? ` ${t.youSuffix}` : ''}
                  </Text>
                  <Text className="text-xs text-muted" numberOfLines={1}>{m.email}</Text>
                </View>
                <View className={`px-2.5 py-1 rounded-full ${ROLE_BADGE_COLORS[m.role]}`}>
                  <Text className={`text-xs font-semibold ${ROLE_BADGE_COLORS[m.role].split(' ')[1]}`}>
                    {ROLE_LABELS[m.role][lang]}
                  </Text>
                </View>
                {canManage && !isOwner && !m.isYou ? (
                  <View className="flex-row gap-1">
                    <Pressable
                      onPress={() => setRolePickerFor(m)}
                      hitSlop={8}
                      className="p-2 rounded-lg active:bg-border-soft"
                    >
                      <ChevronRight size={16} color={c.muted} />
                    </Pressable>
                    <Pressable
                      onPress={() => onRemoveMember(m.id)}
                      hitSlop={8}
                      className="p-2 rounded-lg active:bg-red-500/10"
                    >
                      <Trash2 size={15} color={c.danger} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      {/* Pending invites */}
      {canManage ? (
        <>
          <Text className="text-xs font-semibold text-faint uppercase tracking-wide mb-2 ml-1">
            {t.invitesHeading}
          </Text>
          <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
            {invites.length === 0 ? (
              <View className="px-5 py-8">
                <Text className="text-sm text-faint text-center">{t.noPendingInvites}</Text>
              </View>
            ) : (
              invites.map((inv, i) => {
                const isLast = i === invites.length - 1;
                const expired = new Date(inv.expiresAt) < new Date();
                const copied = copiedToken === inv.token;
                return (
                  <View
                    key={inv.id}
                    className={`flex-row items-center gap-3 px-4 py-3.5 ${
                      isLast ? '' : 'border-b border-border-soft'
                    }`}
                  >
                    <View className="w-10 h-10 rounded-full bg-border-soft items-center justify-center">
                      <Mail size={16} color={c.muted} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                        {inv.email}
                      </Text>
                      <Text className="text-xs text-muted">
                        {ROLE_LABELS[inv.role][lang]} · {expired ? t.expiredBadge : t.pendingBadge}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => copyLink(inv)}
                      hitSlop={8}
                      className="p-2 rounded-lg active:bg-border-soft"
                    >
                      {copied ? <Check size={16} color={c.success} /> : <Copy size={15} color={c.muted} />}
                    </Pressable>
                    <Pressable
                      onPress={() => onRevokeInvite(inv.id)}
                      hitSlop={8}
                      className="p-2 rounded-lg active:bg-red-500/10"
                    >
                      <X size={16} color={c.danger} />
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        </>
      ) : null}

      {/* Invite modal */}
      <RNModal
        visible={inviteOpen}
        transparent
        animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
        onRequestClose={() => setInviteOpen(false)}
      >
        <Pressable
          onPress={() => setInviteOpen(false)}
          className="flex-1 bg-black/40 items-center justify-end web:justify-center px-6 pb-10"
        >
          <Pressable className="bg-card rounded-2xl w-full max-w-md p-5">
            <Text className="text-lg font-bold text-ink mb-1">{t.inviteModalTitle}</Text>
            <Text className="text-sm text-muted mb-5">{t.subtitle}</Text>

            <View className="mb-3">
              <Text className="text-xs font-semibold text-ink mb-1.5">{t.emailLabel}</Text>
              <Input
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder={t.emailPlaceholder}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <Text className="text-xs font-semibold text-ink mb-1.5">{t.roleLabel}</Text>
            <View className="flex-col gap-1.5 mb-5">
              {INVITABLE_ROLES.map(r => {
                const selected = inviteRole === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setInviteRole(r)}
                    className={`flex-row items-start gap-3 px-3 py-2.5 rounded-xl border ${
                      selected ? 'border-primary bg-primary/5' : 'border-border-soft'
                    }`}
                  >
                    <View className={`w-4 h-4 rounded-full border-2 mt-0.5 ${
                      selected ? 'border-primary bg-primary' : 'border-border'
                    }`}>
                      {selected ? <View className="w-1.5 h-1.5 rounded-full bg-card m-0.5" /> : null}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink">{ROLE_LABELS[r][lang]}</Text>
                      <Text className="text-xs text-muted mt-0.5">{ROLE_DESCRIPTIONS[r][lang]}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {inviteError ? (
              <View className="bg-red-500/10 border border-red-100 rounded-xl px-3 py-2 mb-3">
                <Text className="text-xs text-red-600">{inviteError}</Text>
              </View>
            ) : null}

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button variant="secondary" onPress={() => setInviteOpen(false)} fullWidth>
                  {full.common.buttons.cancel}
                </Button>
              </View>
              <View className="flex-1">
                <Button
                  onPress={submitInvite}
                  loading={inviting}
                  fullWidth
                  disabled={!inviteEmail.trim()}
                >
                  {inviting ? t.sending : t.sendInviteBtn}
                </Button>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </RNModal>

      {/* Role picker (change role) */}
      <RNModal
        visible={!!rolePickerFor}
        transparent
        animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
        onRequestClose={() => setRolePickerFor(null)}
      >
        <Pressable
          onPress={() => setRolePickerFor(null)}
          className="flex-1 bg-black/40 items-center justify-end web:justify-center px-6 pb-10"
        >
          <Pressable className="bg-card rounded-2xl w-full max-w-md p-5">
            <Text className="text-lg font-bold text-ink mb-1">{t.changeRoleBtn}</Text>
            <Text className="text-sm text-muted mb-4">
              {rolePickerFor?.displayName ?? rolePickerFor?.email}
            </Text>
            <View className="flex-col gap-1.5">
              {INVITABLE_ROLES.map(r => {
                const selected = rolePickerFor?.role === r;
                return (
                  <Pressable
                    key={r}
                    onPress={async () => {
                      if (rolePickerFor) {
                        await onChangeRole(rolePickerFor.id, r);
                        setRolePickerFor(null);
                      }
                    }}
                    className={`flex-row items-start gap-3 px-3 py-2.5 rounded-xl border ${
                      selected ? 'border-primary bg-primary/5' : 'border-border-soft'
                    }`}
                  >
                    <View className={`w-4 h-4 rounded-full border-2 mt-0.5 ${
                      selected ? 'border-primary bg-primary' : 'border-border'
                    }`}>
                      {selected ? <View className="w-1.5 h-1.5 rounded-full bg-card m-0.5" /> : null}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink">{ROLE_LABELS[r][lang]}</Text>
                      <Text className="text-xs text-muted mt-0.5">{ROLE_DESCRIPTIONS[r][lang]}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </RNModal>
    </ScrollView>

    {/* Invite member — floating action, bottom-right thumb reach */}
    {canManage ? (
      <Fab
        onPress={() => setInviteOpen(true)}
        icon={<UserPlus size={22} color="#FFFFFF" />}
      />
    ) : null}
    </View>
  );
}
