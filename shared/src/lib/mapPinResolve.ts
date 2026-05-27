// Single source of truth for map-pin rule evaluation. Used by:
//   - mobile MapScreen (resolves each pin's color/icon at render time)
//   - web map module (same)
// Same semantics as the count queries in MapSettingsSheet / MapSettingsPanel
// (they use Supabase SQL operators; this resolves in JS against in-memory
// row data). Keep both in sync when adding new operators.

import type { MapPinIcon } from './mapPinPresets';

export type PinRuleOperator =
  | 'equals' | 'not_equals' | 'has_value' | 'contains'
  | 'gt' | 'gte' | 'lt' | 'lte';

export interface PinResolveRule {
  field_key?: string;
  operator?: PinRuleOperator;
  value: string;
  color: string;        // pin background
  icon: MapPinIcon;
  icon_color?: string;  // icon foreground (defaults to white)
  hide?: boolean;
}

export interface PinResolveLayerConfig {
  default_color: string;
  default_icon: MapPinIcon;
  default_icon_color?: string;
  // Legacy single-field selector — used as implicit field_key for any
  // rule that doesn't carry its own. New rules always set field_key.
  field_key?: string | null;
  rules: PinResolveRule[];
}

export type PinLayer = 'clients' | 'jobs' | 'employees' | 'weather';

// Fallback colors/icons when the business has no map_pin_config yet.
// Match the colors used by the layer toggle pills in the map header.
export const DEFAULT_PIN_STYLE: Record<PinLayer, { color: string; icon: MapPinIcon }> = {
  clients:   { color: '#0EA5E9', icon: 'map-pin' },         // sky
  jobs:      { color: '#10B981', icon: 'map-pin' },         // emerald
  employees: { color: '#F59E0B', icon: 'map-pin' },         // amber
  weather:   { color: '#DC2626', icon: 'cloud-lightning' }, // red
};

// Compare two stringified values per operator. Numeric operators auto-cast
// to number when both sides parse as numbers; otherwise fall back to a
// lowercase string compare.
export function compareValues(
  rowValue: string,
  op: PinRuleOperator,
  ruleValue: string,
): boolean {
  const a = rowValue.trim();
  const b = ruleValue.trim();
  switch (op) {
    case 'equals':     return a.toLowerCase() === b.toLowerCase();
    case 'not_equals': return a.toLowerCase() !== b.toLowerCase();
    case 'has_value':  return a !== '';
    case 'contains':   return a.toLowerCase().includes(b.toLowerCase());
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const numA = Number(a);
      const numB = Number(b);
      const isNum = !Number.isNaN(numA) && !Number.isNaN(numB) && a !== '' && b !== '';
      const cmpA = isNum ? numA : a.toLowerCase();
      const cmpB = isNum ? numB : b.toLowerCase();
      if (op === 'gt')  return cmpA > cmpB;
      if (op === 'gte') return cmpA >= cmpB;
      if (op === 'lt')  return cmpA < cmpB;
      return cmpA <= cmpB;
    }
  }
}

// Read a field value from a row's standard columns or its custom_fields
// JSONB. The rule editor offers both standard + custom keys; we look up
// the same key in both places without caring which.
export function readFieldValue(row: Record<string, unknown>, key: string): unknown {
  if (key in row && row[key] != null) return row[key];
  const cf = row.custom_fields;
  if (cf && typeof cf === 'object' && key in (cf as Record<string, unknown>)) {
    return (cf as Record<string, unknown>)[key];
  }
  return null;
}

// Walk the rules in order; first matching rule wins. Falls back to the
// layer's default style if no rule matches.
//
// Returns `null` when the matched rule has `hide: true` — caller should
// skip rendering the pin entirely. Use `resolveOrDefault(...)` if you
// just want a style (no hide handling).
export function resolvePinStyle(
  layer: PinLayer,
  config: PinResolveLayerConfig | undefined,
  row: Record<string, unknown>,
): { color: string; icon: MapPinIcon; iconColor: string } | null {
  const fallback = DEFAULT_PIN_STYLE[layer];
  const defaultColor = config?.default_color ?? fallback.color;
  const defaultIcon: MapPinIcon = config?.default_icon ?? fallback.icon;
  const defaultIconColor = config?.default_icon_color ?? '#FFFFFF';
  if (!config || !Array.isArray(config.rules) || config.rules.length === 0) {
    return { color: defaultColor, icon: defaultIcon, iconColor: defaultIconColor };
  }
  for (const rule of config.rules) {
    const fieldKey = rule.field_key ?? config.field_key ?? null;
    if (!fieldKey) continue;
    const op = rule.operator ?? 'equals';
    if (op !== 'has_value' && (typeof rule.value !== 'string' || rule.value.trim() === '')) {
      continue;
    }
    const v = readFieldValue(row, fieldKey);
    const sV = v == null ? '' : String(v);
    if (compareValues(sV, op, typeof rule.value === 'string' ? rule.value : '')) {
      if (rule.hide) return null;
      return {
        color: rule.color ?? defaultColor,
        icon: (rule.icon ?? defaultIcon) as MapPinIcon,
        iconColor: rule.icon_color ?? defaultIconColor,
      };
    }
  }
  return { color: defaultColor, icon: defaultIcon, iconColor: defaultIconColor };
}
