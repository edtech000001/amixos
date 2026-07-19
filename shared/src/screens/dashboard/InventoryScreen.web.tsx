'use client';

// Web-only InventoryScreen — plain HTML + Tailwind. Same exported API as
// InventoryScreen.tsx so the web page wrapper is untouched and the bundler
// resolves this .web.tsx variant automatically.

import { useMemo, useState, type ReactNode } from 'react';
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  Pencil,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { useLang } from '../../i18n';
import { usePersistedSearch } from '../../lib/usePersistedSearch';

export interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
  category: string | null;
  lowStockThreshold: number;
}

export interface InventoryScreenProps {
  loading: boolean;
  items: InventoryItem[];
  /** Resolve the localized unit label for a stored DB value. */
  unitLabel: (dbValue: string) => string;
  onAddItem: () => void;
  onEditItem: (id: string) => void;
  onAdjustItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  modalsSlot?: ReactNode;
}

type Filter = 'todos' | 'bajo_stock';

export function InventoryScreen({
  loading,
  items,
  unitLabel,
  onAddItem,
  onEditItem,
  onAdjustItem,
  onDeleteItem,
  modalsSlot,
}: InventoryScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.inventory;

  const [search, setSearch] = usePersistedSearch('search.inventory');
  const [filter, setFilter] = useState<Filter>('todos');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i => {
      const matchSearch = `${i.name} ${i.sku ?? ''} ${i.category ?? ''}`.toLowerCase().includes(q);
      if (filter === 'bajo_stock') return matchSearch && i.quantity <= i.lowStockThreshold;
      return matchSearch;
    });
  }, [items, search, filter]);

  const lowStockCount = items.filter(i => i.quantity <= i.lowStockThreshold).length;
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const valueFormatted = `$${totalValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const summaryText = t.summary
    .replace('{{count}}', String(items.length))
    .replace('{{value}}', valueFormatted);
  const summaryLowStockText = t.summaryLowStock.replace('{{count}}', String(lowStockCount));
  const lowStockBannerText = (lowStockCount > 1
    ? t.lowStockBannerPlural
    : t.lowStockBannerSingle
  ).replace('{{count}}', String(lowStockCount));

  return (
    <div className="px-6 lg:px-8 pt-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
          <p className="text-sm text-muted mt-0.5">
            {summaryText}
            {lowStockCount > 0 ? (
              <span className="text-orange-500 font-medium"> · {summaryLowStockText}</span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddItem}
          className="flex items-center gap-1.5 bg-primary px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          <Plus size={15} className="text-white" />
          {t.addItem}
        </button>
      </div>

      {/* Low stock banner */}
      {lowStockCount > 0 ? (
        <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-200 rounded-2xl px-5 py-3 mb-4">
          <AlertTriangle size={18} className="text-orange-500 shrink-0" />
          <p className="text-sm text-orange-700 flex-1">
            <span className="font-semibold">{lowStockBannerText}</span> {t.lowStockBannerSuffix}
            <button
              type="button"
              onClick={() => setFilter('bajo_stock')}
              className="font-medium text-orange-700 underline ml-1"
            >
              {t.lowStockBannerCta}
            </button>
          </p>
        </div>
      ) : null}

      {/* Filter + Search */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="inline-flex gap-1 bg-border-soft p-1 rounded-xl">
          {(['todos', 'bajo_stock'] as const).map(f => (
            <button
              type="button"
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f ? 'bg-primary/15 text-primary shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {f === 'todos' ? t.filters.all : t.filters.lowStock}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-card pl-10 pr-10 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20">
          <Package size={40} className="text-faint" />
          <p className="text-sm text-faint mt-3">
            {search || filter !== 'todos' ? t.emptyNoMatch : t.emptyAll}
          </p>
          {!search && filter === 'todos' ? (
            <button type="button" onClick={onAddItem} className="text-primary text-sm font-medium mt-1 hover:underline">
              {t.addFirst}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden">
          <div className="flex px-5 py-3 border-b border-border-soft">
            <span className="flex-1 text-xs font-semibold text-faint uppercase">{t.cols.item}</span>
            <span className="w-16 text-xs font-semibold text-faint uppercase text-center">{t.cols.stock}</span>
            <span className="w-16 text-xs font-semibold text-faint uppercase text-center">{t.cols.unit}</span>
            <span className="w-24 text-xs font-semibold text-faint uppercase text-right">{t.cols.unitCost}</span>
            <span className="w-28 text-xs font-semibold text-faint uppercase text-right">{t.cols.actions}</span>
          </div>
          {filtered.map((item, i) => {
            const low = item.quantity <= item.lowStockThreshold;
            return (
              <div
                key={item.id}
                className={`flex items-center px-5 py-3.5 ${i < filtered.length - 1 ? 'border-b border-border-soft' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink truncate">{item.name}</span>
                    {low ? <AlertTriangle size={13} className="text-orange-400 shrink-0" /> : null}
                  </div>
                  <p className="text-xs text-faint mt-0.5 truncate">
                    {item.category ? item.category : ''}
                    {item.sku ? ` · ${t.itemMeta.skuPrefix.replace('{{sku}}', item.sku)}` : ''}
                    {` · ${t.itemMeta.minPrefix.replace('{{min}}', String(item.lowStockThreshold))}`}
                  </p>
                </div>
                <span className={`w-16 text-center text-sm font-bold ${low ? 'text-orange-500' : 'text-ink'}`}>
                  {item.quantity}
                </span>
                <span className="w-16 text-center text-xs text-muted">{unitLabel(item.unit)}</span>
                <span className="w-24 text-right text-sm text-ink">${item.unitCost.toFixed(2)}</span>
                <div className="w-28 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => onAdjustItem(item.id)}
                    className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors"
                  >
                    <TrendingUp size={14} className="text-primary" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditItem(item.id)}
                    className="p-1.5 rounded-lg hover:bg-border-soft transition-colors"
                  >
                    <Pencil size={14} className="text-faint" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteItem(item.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalsSlot}
    </div>
  );
}
