'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { TeamScreen, type TeamMember, type TeamInvite } from '@amixos/shared/screens/dashboard/TeamScreen';
import type { Role } from '@amixos/shared/lib/permissions';
import { useLang } from '@/i18n/LangProvider';

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  email: string;
  display_name: string | null;
  joined_at: string;
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

    const [{ data: rawMembers }, invitesRes] = await Promise.all([
      // SECURITY DEFINER RPC joins business_members with auth.users to give us
      // email + display name. Membership is enforced inside the function.
      supabase.rpc('list_business_members', { b_id: business.id }),
      // Pending invites — pulled from our authenticated API to get the
      // acceptUrl assembled on the server.
      fetch(`${getApiBaseUrl()}/api/v1/invites?business_id=${business.id}`, {
        headers: { Authorization: `Bearer ${await getJwt()}` },
      }).then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
    ]);

    const ms: TeamMember[] = ((rawMembers as unknown as MemberRow[]) ?? []).map(m => ({
      id: m.id,
      userId: m.user_id,
      email: m.email,
      displayName: m.display_name,
      role: m.role as Role,
      isYou: m.user_id === user.id,
    }));
    // Sort: you first, then owner, then admin/manager/office, then field/viewer
    const ORDER: Record<Role, number> = { owner: 0, admin: 1, manager: 2, office: 3, field: 4, viewer: 5 };
    ms.sort((a, b) => {
      if (a.isYou !== b.isYou) return a.isYou ? -1 : 1;
      return ORDER[a.role] - ORDER[b.role];
    });

    const inviteRows = (invitesRes?.data ?? []) as InviteRow[];
    const inv: TeamInvite[] = inviteRows.map(i => ({
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

  useEffect(() => { load(); }, [load]);

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
    if (!confirm(t.confirmRevoke.replace('{{email}}', ''))) return;
    await fetch(`${getApiBaseUrl()}/api/v1/invites/${inviteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await getJwt()}` },
    });
    await load();
  };

  const onRemoveMember = async (memberId: string) => {
    const m = members.find(x => x.id === memberId);
    if (!m) return;
    if (!confirm(t.confirmRemove.replace('{{name}}', m.displayName ?? m.email))) return;
    await supabase.from('business_members').delete().eq('id', memberId);
    await supabase.from('audit_log').insert({
      business_id: business!.id,
      action: 'member.removed',
      entity_type: 'member',
      entity_id: m.userId,
      details: { email: m.email, role: m.role },
    });
    await load();
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
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  // Non-admins still see the team list but with no controls.
  const screen = useMemo(() => (
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
  ), [loading, members, invites, currentRole]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Link href="/dashboard/ajustes" className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={18} className="text-gray-600" />
        </Link>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100">
        {screen}
      </div>
    </div>
  );
}
