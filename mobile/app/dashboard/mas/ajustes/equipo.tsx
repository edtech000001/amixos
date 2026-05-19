import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { useLang } from '@/lib/i18n/LangProvider';
import { TeamScreen, type TeamMember, type TeamInvite } from '@amixos/shared/screens/dashboard/TeamScreen';
import type { Role } from '@amixos/shared/lib/permissions';

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  email: string;
  display_name: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  acceptUrl: string;
}

export default function EquipoPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, user, currentRole } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings.team;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!business || !user) return;
    setLoading(true);

    const [membersRes, invitesRes] = await Promise.all([
      supabase.rpc('list_business_members', { b_id: business.id }),
      fetch(`${getApiBaseUrl()}/api/v1/invites?business_id=${business.id}`, {
        headers: { Authorization: `Bearer ${await getJwt()}` },
      }).then(r => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]);

    const ORDER: Record<Role, number> = { owner: 0, admin: 1, manager: 2, office: 3, field: 4, viewer: 5 };
    const ms: TeamMember[] = (((membersRes.data ?? []) as MemberRow[])).map(m => ({
      id: m.id,
      userId: m.user_id,
      email: m.email,
      displayName: m.display_name,
      role: m.role as Role,
      isYou: m.user_id === user.id,
    }));
    ms.sort((a, b) => {
      if (a.isYou !== b.isYou) return a.isYou ? -1 : 1;
      return ORDER[a.role] - ORDER[b.role];
    });

    const inv: TeamInvite[] = ((invitesRes?.data ?? []) as InviteRow[]).map(i => ({
      id: i.id,
      email: i.email,
      role: i.role as Role,
      token: i.token,
      expiresAt: i.expires_at,
      acceptUrl: i.acceptUrl,
    }));

    setMembers(ms);
    setInvites(inv);
    setLoading(false);
  }, [business, user, supabase]);

  useEffect(() => { void load(); }, [load]);

  const onInvite = async (email: string, role: Role) => {
    if (!business) return { ok: false };
    const res = await fetch(`${getApiBaseUrl()}/api/v1/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getJwt()}` },
      body: JSON.stringify({ business_id: business.id, email, role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const codeMap: Record<string, string> = {
        invite_self: t.errorInviteSelf,
        already_member: t.errorAlreadyMember,
        already_invited: t.errorAlreadyInvited,
      };
      return { ok: false, reason: codeMap[body.code] ?? t.inviteFailedToast };
    }
    await load();
    return { ok: true };
  };

  const onRevokeInvite = async (inviteId: string) => {
    const inv = invites.find(i => i.id === inviteId);
    Alert.alert(
      '',
      t.confirmRevoke.replace('{{email}}', inv?.email ?? ''),
      [
        { text: full.common.buttons.cancel, style: 'cancel' },
        {
          text: t.revokeBtn,
          style: 'destructive',
          onPress: async () => {
            await fetch(`${getApiBaseUrl()}/api/v1/invites/${inviteId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${await getJwt()}` },
            });
            await load();
          },
        },
      ],
    );
  };

  const onRemoveMember = async (memberId: string) => {
    const m = members.find(x => x.id === memberId);
    if (!m) return;
    Alert.alert(
      '',
      t.confirmRemove.replace('{{name}}', m.displayName ?? m.email),
      [
        { text: full.common.buttons.cancel, style: 'cancel' },
        {
          text: t.removeBtn,
          style: 'destructive',
          onPress: async () => {
            await supabase.from('business_members').delete().eq('id', memberId);
            await supabase.from('audit_log').insert({
              business_id: business!.id,
              action: 'member.removed',
              entity_type: 'member',
              entity_id: m.userId,
              details: { email: m.email, role: m.role },
            });
            await load();
          },
        },
      ],
    );
  };

  const onChangeRole = async (memberId: string, role: Role) => {
    const m = members.find(x => x.id === memberId);
    if (!m) return;
    await supabase.from('business_members').update({ role }).eq('id', memberId);
    await supabase.from('audit_log').insert({
      business_id: business!.id,
      action: 'member.role_changed',
      entity_type: 'member',
      entity_id: m.userId,
      details: { email: m.email, from: m.role, to: role },
    });
    await load();
  };

  const onCopyInviteLink = async (url: string) => {
    // Mobile: open the system share sheet so the user can send the link via
    // WhatsApp / SMS / email / wherever. Better UX than copy-to-clipboard
    // since the most common case is forwarding to a team member's phone.
    try {
      await Share.share({ message: url, url });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-gray-100"
        >
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <Text className="ml-1 text-lg font-semibold text-gray-900">{t.heading}</Text>
      </View>
      <TeamScreen
        loading={loading}
        members={members}
        invites={invites}
        currentRole={currentRole}
        onInvite={onInvite}
        onRevokeInvite={onRevokeInvite}
        onRemoveMember={onRemoveMember}
        onChangeRole={onChangeRole}
        onCopyInviteLink={onCopyInviteLink}
      />
    </SafeAreaView>
  );
}
