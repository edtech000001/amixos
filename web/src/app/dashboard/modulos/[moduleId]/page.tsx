'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { ArrowLeft, Construction } from 'lucide-react';
// Module components register here. `next/dynamic` keeps each module's
// code in its own chunk so it only downloads when visited — initial
// bundle stays small regardless of how many modules ship over time.
//
// ssr: false because react-google-maps and friends touch window/document
// during init.
import type { ComponentType } from 'react';
import { getModuleById } from '@amixos/shared/modules/registry';
import { useLang } from '@/i18n/LangProvider';

const MapModule = nextDynamic(() => import('@/modules/map'), { ssr: false });
const EquipmentModule = nextDynamic(() => import('@/modules/equipment'), { ssr: false });
const InventoryModule = nextDynamic(() => import('@/modules/inventory'), { ssr: false });
const FilesModule = nextDynamic(() => import('@/modules/files'), { ssr: false });
const SmsModule = nextDynamic(() => import('@/modules/sms'), { ssr: false });

const MODULE_COMPONENTS: Record<string, ComponentType> = {
  map: MapModule,
  equipment: EquipmentModule,
  inventory: InventoryModule,
  files: FilesModule,
  messaging: SmsModule,
};

export default function ModulePage({ params }: { params: { moduleId: string } }) {
  const { t: full } = useLang();

  const def = getModuleById(params.moduleId);
  if (!def) {
    return (
      <div className="p-6">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ArrowLeft size={16} />
          {full.common.buttons.back}
        </Link>
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">Module not found.</p>
        </div>
      </div>
    );
  }

  const Cmp = MODULE_COMPONENTS[def.id];
  if (Cmp) return <Cmp />;

  // Coming Soon placeholder. Same UI for every unimplemented module —
  // shows the module's icon + name + a placeholder message pulled from
  // the modules dict.
  const entry = (full.dashboard.modules.list as unknown as Record<string, { name: string; description: string } | undefined>)[def.i18nKey];
  const name = entry?.name ?? def.id;
  const description = entry?.description ?? '';
  const Icon = def.icon;

  return (
    <div className="p-6">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft size={16} />
        {full.common.buttons.back}
      </Link>
      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center max-w-xl mx-auto">
        <div
          className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-5"
          style={{ backgroundColor: `${def.color}15` }}
        >
          <Icon size={32} color={def.color} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{name}</h1>
        {description ? (
          <p className="text-sm text-gray-500 mb-6">{description}</p>
        ) : null}

        <div className="flex flex-col items-center gap-2 mt-6 pt-6 border-t border-gray-100">
          <Construction size={20} className="text-amber-500" />
          <p className="text-sm font-semibold text-gray-900">
            {full.dashboard.modules.placeholder.heading}
          </p>
          <p className="text-xs text-gray-500 max-w-sm">
            {full.dashboard.modules.placeholder.body}
          </p>
        </div>
      </div>
    </div>
  );
}

