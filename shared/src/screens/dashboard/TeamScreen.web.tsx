'use client';

// Web-only TeamScreen — plain HTML + Tailwind. Same exported API as
// TeamScreen.tsx so the web page wrapper is untouched and the bundler resolves
// this .web.tsx variant automatically.

import { useState } from 'react';
import { UserPlus, Mail, ChevronRight, X, Trash2, Copy, Check } from 'lucide-react';
import { useLang } from '../../i18n';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, INVITABLE_ROLES, type Role } from '../../lib/permissions';

export interface TeamMember {
  id: string;
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
  expiresAt: string;
  acceptUrl: string;
}

export interface TeamScreenProps {
  loading: boolean;
  members: TeamMember[];
  invites: TeamInvite[];
  currentRole: Role | null;
  onInvite: (email: string, role: Role) => Promise<{ ok: boolean; reason?: string }>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onChangeRole: (memberId: string, role: Role) => Promise<void>;
  onCopyInviteLink: (acceptUrl: string) => Promise<void> | void;
  onBack?: () => void;
}

const ROLE_BADGE_COLORS: Record<Role, string> = {
  owner:   'bg-purple-100 text-purple-700',
  admin:   'bg-blue-100 text-blue-700',
  manager: 'bg-emerald-100 text-emerald-700',
  office:  'bg-amber-100 text-amber-700',
  field:   'bg-gray-100 text-gray-600',
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
    <div className="px-5 lg:px-6 pt-5 pb-10">
      {/* Heading */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1 mr-3">
          <h1 className="text-2xl font-bold text-gray-900">{t.heading}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t.subtitle}</p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1.5 bg-primary px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            <UserPlus size={14} className="text-white" />
            {t.inviteBtn}
          </button>
        ) : null}
      </div>

      {/* Members */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 ml-1">
        {t.membersHeading}
      </p>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
        {loading ? (
          <div className="px-5 py-8 flex items-center justify-center">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : members.length === 0 ? (
          <div className="px-5 py-8">
            <p className="text-sm text-gray-400 text-center">{t.noMembersYet}</p>
          </div>
        ) : (
          members.map((m, i) => {
            const isLast = i === members.length - 1;
            const isOwner = m.role === 'owner';
            return (
              <div
                key={m.id}
                className={`flex items-center gap-3 px-4 py-3.5 ${isLast ? '' : 'border-b border-gray-50'}`}
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold text-sm">
                    {(m.displayName ?? m.email).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {m.displayName ?? m.email}
                    {m.isYou ? ` ${t.youSuffix}` : ''}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{m.email}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_BADGE_COLORS[m.role]}`}>
                  {ROLE_LABELS[m.role][lang]}
                </span>
                {canManage && !isOwner && !m.isYou ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setRolePickerFor(m)}
                      className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <ChevronRight size={16} className="text-gray-500" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveMember(m.id)}
                      className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={15} className="text-red-500" />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Pending invites */}
      {canManage ? (
        <>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 ml-1">
            {t.invitesHeading}
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {invites.length === 0 ? (
              <div className="px-5 py-8">
                <p className="text-sm text-gray-400 text-center">{t.noPendingInvites}</p>
              </div>
            ) : (
              invites.map((inv, i) => {
                const isLast = i === invites.length - 1;
                const expired = new Date(inv.expiresAt) < new Date();
                const copied = copiedToken === inv.token;
                return (
                  <div
                    key={inv.id}
                    className={`flex items-center gap-3 px-4 py-3.5 ${isLast ? '' : 'border-b border-gray-50'}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <Mail size={16} className="text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{inv.email}</p>
                      <p className="text-xs text-gray-500">
                        {ROLE_LABELS[inv.role][lang]} · {expired ? t.expiredBadge : t.pendingBadge}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyLink(inv)}
                      className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={15} className="text-gray-500" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRevokeInvite(inv.id)}
                      className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <X size={16} className="text-red-500" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}

      {/* Invite modal */}
      {inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setInviteOpen(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-1">{t.inviteModalTitle}</h2>
            <p className="text-sm text-gray-500 mb-5">{t.subtitle}</p>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t.emailLabel}</label>
              <input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder={t.emailPlaceholder}
                type="email"
                autoCapitalize="none"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <p className="text-xs font-semibold text-gray-700 mb-1.5">{t.roleLabel}</p>
            <div className="flex flex-col gap-1.5 mb-5">
              {INVITABLE_ROLES.map(r => {
                const selected = inviteRole === r;
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setInviteRole(r)}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left ${
                      selected ? 'border-primary bg-primary/5' : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
                      selected ? 'border-primary bg-primary' : 'border-gray-300'
                    }`}>
                      {selected ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-gray-900">{ROLE_LABELS[r][lang]}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{ROLE_DESCRIPTIONS[r][lang]}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {inviteError ? (
              <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">
                <p className="text-xs text-red-600">{inviteError}</p>
              </div>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {full.common.buttons.cancel}
              </button>
              <button
                type="button"
                onClick={submitInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="flex-1 py-2.5 rounded-xl bg-primary text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {inviting ? t.sending : t.sendInviteBtn}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Role picker (change role) */}
      {rolePickerFor ? (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRolePickerFor(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-1">{t.changeRoleBtn}</h2>
            <p className="text-sm text-gray-500 mb-4">{rolePickerFor.displayName ?? rolePickerFor.email}</p>
            <div className="flex flex-col gap-1.5">
              {INVITABLE_ROLES.map(r => {
                const selected = rolePickerFor.role === r;
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={async () => {
                      await onChangeRole(rolePickerFor.id, r);
                      setRolePickerFor(null);
                    }}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left ${
                      selected ? 'border-primary bg-primary/5' : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
                      selected ? 'border-primary bg-primary' : 'border-gray-300'
                    }`}>
                      {selected ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-gray-900">{ROLE_LABELS[r][lang]}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{ROLE_DESCRIPTIONS[r][lang]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
