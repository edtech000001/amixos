'use client';

export const dynamic = 'force-dynamic';

// Role editor — Ajustes → Equipo (Settings → Team). A resource×action grid per
// role, persisted to business_roles (migration 084). Owner is locked (always
// full control). Saving a grid that matches the default removes the override.

import { useEffect, useMemo, useState } from 'react';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, Lock, Plus, Pencil, Trash2 } from 'lucide-react';
import { SettingsNav } from '@/components/dashboard/SettingsNav';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';
import { useLang } from '@/i18n/LangProvider';
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

export default function RolesSettingsPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, currentRole, roleOverrides, reloadPermissions, loading: appLoading, locations } = useApp();
  // Equipment is a module-gated resource — only show its toggle when the
  // equipment module is active for this business.
  const { modules: enabledModules } = useEnabledModules(supabase, business?.id ?? null);
  const equipmentActive = enabledModules.some(m => m.id === 'equipment');
  const rentalsActive = enabledModules.some(m => m.id === 'rentals');
  const resourceKeys = RESOURCE_KEYS.filter(
    r => (r !== 'equipment' || equipmentActive) && (r !== 'rentals' || rentalsActive),
  );
  const multiLocation = (locations?.length ?? 0) > 1;
  const { t: full, locale } = useLang();
  const t = full.dashboard.roles;

  useEffect(() => {
    if (!appLoading && currentRole && !can.manageMembers(currentRole)) router.replace('/dashboard/ajustes');
  }, [appLoading, currentRole, router]);

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

  // Create/rename modal state.
  const [modalMode, setModalMode] = useState<'create' | 'rename' | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalBase, setModalBase] = useState<Role>('field');
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState(false);

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

  const reset = async () => {
    if (!business || busy) return;
    setBusy(true); setError(false);
    const ok = await resetRoleOverride(supabase, business.id, selected);
    if (ok) { await reloadPermissions(); setDraft(clonePermissions(DEFAULT_ROLE_PERMISSIONS[selected])); setSaved(true); }
    else setError(true);
    setBusy(false);
  };

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

  const openCreate = () => { setModalName(''); setModalBase('field'); setModalError(false); setModalMode('create'); };
  const openRename = () => { setModalName(roleLabel(selected, locale)); setModalError(false); setModalMode('rename'); };

  const modalSubmit = async () => {
    if (!business || modalBusy || !modalName.trim()) return;
    setModalBusy(true); setModalError(false);
    if (modalMode === 'create') {
      const key = await createCustomRole(supabase, business.id, modalName, modalBase);
      if (key) {
        await reloadPermissions();
        setSelected(key as Role);
        setModalMode(null);
      } else setModalError(true);
    } else {
      const ok = await renameCustomRole(supabase, business.id, selected, modalName);
      if (ok) { await reloadPermissions(); setModalMode(null); } else setModalError(true);
    }
    setModalBusy(false);
  };

  const SCOPE_LABEL: Record<ViewScope, string> = { none: t.scopeNone, assigned: t.scopeAssigned, all: t.scopeAll };

  const Cell = ({ supported, checked, onChange }: { supported: boolean; checked: boolean; onChange: (v: boolean) => void }) =>
    supported ? (
      <button
        type="button"
        disabled={!editable}
        onClick={() => onChange(!checked)}
        className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
          checked ? 'bg-primary border-primary' : 'bg-surface border-2 border-muted/40'
        } ${editable ? 'hover:border-primary' : 'opacity-60 cursor-not-allowed'}`}
      >
        {checked ? <Check size={15} className="text-white" /> : null}
      </button>
    ) : (
      <span className="text-faint">—</span>
    );

  return (
    <div className="md:flex md:min-h-screen">
      <SettingsNav />
      <div className="flex-1 min-w-0 p-6 max-w-4xl">
        <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
        <p className="text-sm text-muted mt-1 mb-6">{t.subtitle}</p>

        {/* Role selector — built-ins, then custom roles, then "+ new role" */}
        <div className="flex flex-wrap gap-2 mb-6">
          {ALL_ROLES.map(r => (
            <button
              key={r}
              onClick={() => setSelected(r)}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                selected === r ? 'bg-primary text-white border-primary' : 'bg-card text-ink border-border hover:border-primary'
              }`}
            >
              {ROLE_LABELS[r][locale]}
              {roleOverrides[r] ? <span className={`ml-1.5 text-[10px] ${selected === r ? 'text-white/80' : 'text-primary'}`}>•</span> : null}
            </button>
          ))}
          {customRoles.map(cr => (
            <button
              key={cr.key}
              onClick={() => setSelected(cr.key as Role)}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                selected === cr.key ? 'bg-primary text-white border-primary' : 'bg-card text-ink border-border hover:border-primary'
              }`}
            >
              {cr.name}
            </button>
          ))}
          <button
            onClick={openCreate}
            className="px-3.5 py-2 rounded-xl text-sm font-semibold border border-dashed border-border bg-card text-primary hover:border-primary transition-colors inline-flex items-center gap-1"
          >
            <Plus size={14} /> {t.newRole}
          </button>
        </div>

        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-ink truncate">{roleLabel(selected, locale)}</h2>
                {custom ? (
                  <button type="button" onClick={openRename} className="text-muted hover:text-ink" title={t.renameRole}>
                    <Pencil size={14} />
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-muted mt-0.5">{custom ? t.customRoleDesc : roleDescription(selected, locale)}</p>
            </div>
            {custom ? (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">{t.customRoleBadge}</span>
            ) : customized && editable ? (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">{t.customized}</span>
            ) : null}
          </div>

          {!editable ? (
            <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-surface border border-border-soft text-sm text-muted">
              <Lock size={15} /> {t.ownerLocked}
            </div>
          ) : null}

          {/* Data access grid */}
          <h3 className="text-xs font-semibold text-faint uppercase tracking-wide mt-6 mb-2">{t.sectionData}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="text-left font-medium pb-2"></th>
                  <th className="font-medium pb-2 px-2">{t.colView}</th>
                  <th className="font-medium pb-2 px-2">{t.colCreate}</th>
                  <th className="font-medium pb-2 px-2">{t.colEdit}</th>
                  <th className="font-medium pb-2 px-2">{t.colDelete}</th>
                </tr>
              </thead>
              <tbody>
                {resourceKeys.map(r => {
                  const meta = RESOURCE_ACTIONS[r];
                  const rp = draft.resources[r];
                  return (
                    <tr key={r} className="border-t border-border-soft">
                      <td className="py-2.5 pr-2 font-medium text-ink">{t.resourceNames[r]}</td>
                      <td className="py-2.5 px-2">
                        {meta.assignedView ? (
                          <div className="inline-flex rounded-lg border border-border overflow-hidden">
                            {(['none', 'assigned', 'all'] as ViewScope[]).map(s => (
                              <button
                                key={s}
                                type="button"
                                disabled={!editable}
                                onClick={() => setView(r, s)}
                                className={`px-2.5 py-1 text-xs font-semibold ${rp.view === s ? 'bg-primary text-white' : 'bg-card text-muted'} ${editable ? '' : 'opacity-60 cursor-not-allowed'}`}
                              >
                                {SCOPE_LABEL[s]}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="flex justify-center">
                            <Cell supported checked={rp.view === 'all'} onChange={v => setView(r, v ? 'all' : 'none')} />
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2"><div className="flex justify-center"><Cell supported={meta.create} checked={rp.create} onChange={v => setAction(r, 'create', v)} /></div></td>
                      <td className="py-2.5 px-2"><div className="flex justify-center"><Cell supported={meta.edit} checked={rp.edit} onChange={v => setAction(r, 'edit', v)} /></div></td>
                      <td className="py-2.5 px-2"><div className="flex justify-center"><Cell supported={meta.delete} checked={rp.delete} onChange={v => setAction(r, 'delete', v)} /></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* System section */}
          <h3 className="text-xs font-semibold text-faint uppercase tracking-wide mt-6 mb-2">{t.sectionSystem}</h3>
          <div className="flex flex-col gap-1">
            {EDITABLE_CAPS.filter(key => capAppliesToRole(key, selected) && (key !== 'switchLocations' || multiLocation)).map(key => (
              <label key={key} className={`flex items-center justify-between py-2 ${editable ? 'cursor-pointer' : ''}`}>
                <span className="text-sm text-ink">{t.capNames[key]}</span>
                <Cell supported checked={draft.caps[key]} onChange={v => setCap(key, v)} />
              </label>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mb-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-100 text-sm text-red-600">{errorText ?? t.saveError}</div>
        ) : null}
        {saved && !dirty ? (
          <div className="mb-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-100 text-sm text-emerald-700">{t.saved}</div>
        ) : null}

        {editable ? (
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={!dirty || busy}
              className="flex items-center gap-1.5 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40"
            >
              <Check size={16} /> {full.common.buttons.save}
            </button>
            {custom ? (
              <button
                onClick={() => { void confirm({ message: t.deleteRoleConfirm, destructive: true }).then(ok => { if (ok) void doDelete(); }); }}
                disabled={busy}
                className="flex items-center gap-1.5 bg-red-500/10 text-red-600 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-500/20 disabled:opacity-40"
              >
                <Trash2 size={15} /> {t.deleteRole}
              </button>
            ) : customized ? (
              <button
                onClick={() => { void confirm({ message: t.resetConfirm, destructive: true }).then(ok => { if (ok) void reset(); }); }}
                disabled={busy}
                className="flex items-center gap-1.5 bg-card border border-border text-ink px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface disabled:opacity-40"
              >
                <RotateCcw size={15} /> {t.reset}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Create / rename custom role modal */}
        {modalMode !== null ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalMode(null)} />
            <div className="relative bg-card rounded-2xl border border-border-soft shadow-xl p-6 w-full max-w-sm">
              <h2 className="text-base font-bold text-ink mb-4">
                {modalMode === 'rename' ? t.renameRoleTitle : t.newRoleTitle}
              </h2>
              <label className="block text-sm font-medium text-ink mb-1.5">{t.roleNameLabel}</label>
              <input
                autoFocus
                type="text"
                value={modalName}
                onChange={e => setModalName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void modalSubmit(); }}
                placeholder={t.roleNamePlaceholder}
                className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {modalMode === 'create' ? (
                <>
                  <label className="block text-sm font-medium text-ink mt-4 mb-1.5">{t.baseRoleLabel}</label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_ROLES.map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setModalBase(r)}
                        className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors ${
                          modalBase === r ? 'bg-primary text-white border-primary' : 'bg-surface text-ink border-border hover:border-primary'
                        }`}
                      >
                        {ROLE_LABELS[r][locale]}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              {modalError ? (
                <p className="text-sm text-red-600 mt-3">{t.createError}</p>
              ) : null}
              <div className="flex justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-muted hover:text-ink"
                >
                  {full.common.buttons.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void modalSubmit()}
                  disabled={modalBusy || !modalName.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:opacity-90 disabled:opacity-40"
                >
                  {modalMode === 'rename' ? full.common.buttons.save : t.createBtn}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
