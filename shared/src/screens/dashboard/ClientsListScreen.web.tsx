'use client';

// Web-only ClientsListScreen — plain HTML + Tailwind (see auth/LoginScreen.web
// for the rationale: shared RN screens render unstyled on web). Same exported
// API as ClientsListScreen.tsx so the web page wrapper is untouched and the
// bundler resolves this .web.tsx variant automatically.

import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { Plus, Search, Upload, Trash2, Phone, Mail, MapPin, Pencil, User, Users } from 'lucide-react';
import { useLang } from '../../i18n';
import { clientMatchesSearch, matchingContacts } from '../../lib/clientSearch';
import { groupClientsByLetter } from '../../lib/clientSections';

export interface ClientListItem {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  phoneDisplay: string | null;
  emailDisplay: string | null;
  city: string | null;
  state: string | null;
  /** Contact people for this client — surfaced in search + the matched row. */
  contacts?: { name: string; role: string | null }[];
}

export interface ClientsListScreenProps {
  loading: boolean;
  clients: ClientListItem[];
  search: string;
  onSearchChange: (text: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onClientPress: (id: string) => void;
  onEditPress: (id: string) => void;
  onDeletePress: (id: string) => void;
  onNewClientPress: () => void;
  onImportPress?: () => void;
  onBulkDeletePress: () => void;
  onClearSelection: () => void;
  bulkDeleting: boolean;
  bottomSlot?: ReactNode;
}

export function ClientsListScreen({
  loading,
  clients,
  search,
  onSearchChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onClientPress,
  onEditPress,
  onDeletePress,
  onNewClientPress,
  onImportPress,
  onBulkDeletePress,
  onClearSelection,
  bulkDeleting,
  bottomSlot,
}: ClientsListScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.clients;

  const filtered = useMemo(
    // Matches own fields + contact people; state name ↔ abbr expansion is
    // handled inside (see clientSearch / usStates).
    () => clients.filter((c) => clientMatchesSearch(c, search)),
    [clients, search],
  );

  const searching = search.trim().length > 0;
  // Alphabetical sections (A–Z + trailing '#'); flat while searching.
  const sections = useMemo(
    () => groupClientsByLetter(filtered, searching),
    [filtered, searching],
  );

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const selectedCountText = (selectedIds.size === 1 ? t.selectedCountSingle : t.selectedCountPlural)
    .replace('{{count}}', String(selectedIds.size));
  const showList = !loading && filtered.length > 0;

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {search.trim()
              ? t.countFound.replace('{{count}}', String(filtered.length))
              : t.countTotal.replace('{{count}}', String(clients.length))}
          </p>
        </div>
        <div className="flex gap-2">
          {onImportPress ? (
            <button onClick={onImportPress} className="flex items-center gap-1.5 bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">
              <Upload size={15} /> {t.importBtn}
            </button>
          ) : null}
          <button onClick={onNewClientPress} className="flex items-center gap-1.5 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90">
            <Plus size={15} /> {t.newClient}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t.searchPlaceholder}
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full rounded-2xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Bulk-delete bar */}
      {selectedIds.size > 0 ? (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 mb-4">
          <button onClick={onClearSelection} className="p-1 rounded text-primary hover:bg-primary/10">✕</button>
          <span className="text-sm font-medium text-primary">{selectedCountText}</span>
          <div className="flex-1" />
          <button
            onClick={onBulkDeletePress}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-60"
          >
            <Trash2 size={14} /> {t.bulkDelete}
          </button>
        </div>
      ) : null}

      {/* List card */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex gap-1">{[0, 1, 2].map((i) => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20">
          <User size={40} className="text-gray-300" />
          <p className="text-sm text-gray-400 mt-3">{search ? t.emptyNoMatch : t.emptyAll}</p>
          {!search ? (
            <button onClick={onNewClientPress} className="text-primary text-sm font-medium mt-1 hover:underline">{t.addFirst}</button>
          ) : null}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Select-all */}
          <button
            onClick={onToggleSelectAll}
            className="w-full flex items-center gap-3 px-5 py-2 border-b border-gray-200 bg-gray-50 hover:bg-gray-100 text-left"
          >
            <span className={`w-4 h-4 rounded border flex items-center justify-center ${allSelected ? 'border-primary bg-primary' : 'border-gray-300 bg-white'}`}>
              {allSelected ? <span className="text-white text-[10px] font-bold">✓</span> : null}
            </span>
            <span className="text-xs text-gray-500">{t.selectAll}</span>
          </button>
          {sections.map((s) => (
            <Fragment key={s.title || 'results'}>
              {s.title ? (
                // top-14 clears the fixed mobile top bar; desktop sticks at 0.
                <div className="sticky top-14 md:top-0 z-10 bg-gray-50 px-5 py-1 border-b border-gray-200 text-xs font-bold text-gray-500">
                  {s.title}
                </div>
              ) : null}
              {s.data.map((c) => (
                <ClientRow
                  key={c.id}
                  client={c}
                  search={search}
                  isChecked={selectedIds.has(c.id)}
                  onToggleSelect={onToggleSelect}
                  onClientPress={onClientPress}
                  onEditPress={onEditPress}
                  onDeletePress={onDeletePress}
                />
              ))}
            </Fragment>
          ))}
        </div>
      )}

      {showList ? <div className="h-2" /> : null}
      {bottomSlot}
    </div>
  );
}

const ClientRow = memo(function ClientRow({
  client: c,
  search,
  isChecked,
  onToggleSelect,
  onClientPress,
  onEditPress,
  onDeletePress,
}: {
  client: ClientListItem;
  search: string;
  isChecked: boolean;
  onToggleSelect: (id: string) => void;
  onClientPress: (id: string) => void;
  onEditPress: (id: string) => void;
  onDeletePress: (id: string) => void;
}) {
  const matchedContacts = matchingContacts(c, search);
  return (
    <div className={`group flex items-center gap-3 px-5 py-4 border-b border-b-gray-100 last:border-b-0 ${isChecked ? 'bg-primary/5' : 'hover:bg-gray-50'}`}>
      <button
        onClick={() => onToggleSelect(c.id)}
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isChecked ? 'border-primary bg-primary' : 'border-gray-300 bg-white'}`}
        aria-label="Select"
      >
        {isChecked ? <span className="text-white text-[10px] font-bold">✓</span> : null}
      </button>
      <button onClick={() => onClientPress(c.id)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
        <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-primary text-sm font-bold">
            {c.firstName.charAt(0).toUpperCase()}{c.lastName.charAt(0).toUpperCase()}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900 truncate">
            {c.firstName} {c.lastName}
            {c.company ? <span className="text-gray-400 font-normal"> · {c.company}</span> : null}
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {c.phoneDisplay ? <span className="flex items-center gap-1 text-xs text-gray-400"><Phone size={11} /> {c.phoneDisplay}</span> : null}
            {c.emailDisplay ? (
              // min-w-0 + truncate: a long email truncates in place instead of
              // wrapping the meta line and making rows uneven.
              <span className="flex items-center gap-1 text-xs text-gray-400 min-w-0">
                <Mail size={11} className="shrink-0" /> <span className="truncate">{c.emailDisplay}</span>
              </span>
            ) : null}
            {c.city ? <span className="flex items-center gap-1 text-xs text-gray-400"><MapPin size={11} /> {c.city}{c.state ? `, ${c.state}` : ''}</span> : null}
          </span>
          {matchedContacts.length > 0 ? (
            <span className="flex flex-col gap-0.5 mt-1">
              {matchedContacts.map((ct, i) => (
                <span key={i} className="flex items-center gap-1 text-xs font-medium text-primary">
                  <Users size={11} /> {ct.name}{ct.role ? `  ·  ${ct.role}` : ''}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </button>
      {/* Hover actions — web idiom */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onEditPress(c.id)} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label="Edit">
          <Pencil size={15} />
        </button>
        <button onClick={() => onDeletePress(c.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label="Delete">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
});
