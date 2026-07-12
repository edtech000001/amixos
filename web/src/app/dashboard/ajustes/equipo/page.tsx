'use client';

export const dynamic = 'force-dynamic';

// Role editor — Ajustes → Equipo (Settings → Team). A resource×action grid per
// role, persisted to business_roles (migration 084). Owner is locked (always
// full control). Saving a grid that matches the default removes the override.

import { useEffect, useMemo, useState } from 'react';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, Lock } from 'lucide-react';
import { SettingsNav } from '@/components/dashboard/SettingsNav';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
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

export default function RolesSettingsPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, currentRole, roleOverrides, reloadPermissions, loading: appLoading } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.roles;

  useEffect(() => {
    if (!appLoading && currentRole && !can.manageMembers(currentRole)) router.replace('/dashboard/ajustes');
  }, [appLoading, currentRole, router]);

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

  const reset = async () => {
    if (!business || busy) return;
    setBusy(true); setError(false);
    const ok = await resetRoleOverride(supabase, business.id, selected);
    if (ok) { await reloadPermissions(); setDraft(clonePermissions(DEFAULT_ROLE_PERMISSIONS[selected])); setSaved(true); }
    else setError(true);
    setBusy(false);
  };

  const SCOPE_LABEL: Record<ViewScope, string> = { none: t.scopeNone, assigned: t.scopeAssigned, all: t.scopeAll };

  const Cell = ({ supported, checked, onChange }: { supported: boolean; checked: boolean; onChange: (v: boolean) => void }) =>
    supported ? (
      <button
        type="button"
        disabled={!editable}
        onClick={() => onChange(!checked)}
        className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
          checked ? 'bg-primary border-primary' : 'bg-white border-gray-300'
        } ${editable ? 'hover:border-primary' : 'opacity-60 cursor-not-allowed'}`}
      >
        {checked ? <Check size={15} className="text-white" /> : null}
      </button>
    ) : (
      <span className="text-gray-300">—</span>
    );

  return (
    <div className="md:flex md:min-h-screen">
      <SettingsNav />
      <div className="flex-1 min-w-0 p-6 max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">{t.subtitle}</p>

        {/* Role selector */}
        <div className="flex flex-wrap gap-2 mb-6">
          {ALL_ROLES.map(r => (
            <button
              key={r}
              onClick={() => setSelected(r)}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                selected === r ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200 hover:border-primary'
              }`}
            >
              {ROLE_LABELS[r][locale]}
              {roleOverrides[r] ? <span className={`ml-1.5 text-[10px] ${selected === r ? 'text-white/80' : 'text-primary'}`}>•</span> : null}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">{ROLE_LABELS[selected][locale]}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{ROLE_DESCRIPTIONS[selected][locale]}</p>
            </div>
            {customized && editable ? (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">{t.customized}</span>
            ) : null}
          </div>

          {!editable ? (
            <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100 text-sm text-gray-500">
              <Lock size={15} /> {t.ownerLocked}
            </div>
          ) : null}

          {/* Data access grid */}
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-6 mb-2">{t.sectionData}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left font-medium pb-2"></th>
                  <th className="font-medium pb-2 px-2">{t.colView}</th>
                  <th className="font-medium pb-2 px-2">{t.colCreate}</th>
                  <th className="font-medium pb-2 px-2">{t.colEdit}</th>
                  <th className="font-medium pb-2 px-2">{t.colDelete}</th>
                </tr>
              </thead>
              <tbody>
                {RESOURCE_KEYS.map(r => {
                  const meta = RESOURCE_ACTIONS[r];
                  const rp = draft.resources[r];
                  return (
                    <tr key={r} className="border-t border-gray-50">
                      <td className="py-2.5 pr-2 font-medium text-gray-800">{t.resourceNames[r]}</td>
                      <td className="py-2.5 px-2">
                        {meta.assignedView ? (
                          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                            {(['none', 'assigned', 'all'] as ViewScope[]).map(s => (
                              <button
                                key={s}
                                type="button"
                                disabled={!editable}
                                onClick={() => setView(r, s)}
                                className={`px-2.5 py-1 text-xs font-semibold ${rp.view === s ? 'bg-primary text-white' : 'bg-white text-gray-600'} ${editable ? '' : 'opacity-60 cursor-not-allowed'}`}
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
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-6 mb-2">{t.sectionSystem}</h3>
          <div className="flex flex-col gap-1">
            {EDITABLE_CAPS.filter(key => capAppliesToRole(key, selected)).map(key => (
              <label key={key} className={`flex items-center justify-between py-2 ${editable ? 'cursor-pointer' : ''}`}>
                <span className="text-sm text-gray-800">{t.capNames[key]}</span>
                <Cell supported checked={draft.caps[key]} onChange={v => setCap(key, v)} />
              </label>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mb-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">{t.saveError}</div>
        ) : null}
        {saved && !dirty ? (
          <div className="mb-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">{t.saved}</div>
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
            {customized ? (
              <button
                onClick={() => { void confirm({ message: t.resetConfirm, destructive: true }).then(ok => { if (ok) void reset(); }); }}
                disabled={busy}
                className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-40"
              >
                <RotateCcw size={15} /> {t.reset}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
