// Shared map-pin presets. Single source of truth for the icon catalog,
// color palette, and standard-field options used by:
//   - mobile + web settings UIs (color/icon pickers)
//   - mobile + web map renderers
//   - server's resolvePinStyle (fallback only — icon string passes through)

// ~190 curated lucide icons grouped into 10 categories. Names match the
// lucide-react / lucide-react-native export names so the renderer can
// look them up directly. Add or remove icons here — both platforms pick
// up the change automatically as long as the import map is updated.
//
// The picker also has a search box (filters by substring of the icon
// key), so categories are just for browsing — power users will type to
// find what they want.
export type MapPinIcon = string;

export interface PinIconCategory {
  // i18n key under settings.iconCategories
  i18nKey:
    | 'location'
    | 'buildings'
    | 'agriculture'
    | 'weather'
    | 'tools'
    | 'vehicles'
    | 'people'
    | 'status'
    | 'commerce'
    | 'tech';
  icons: MapPinIcon[];
}

export const PIN_ICON_CATEGORIES: PinIconCategory[] = [
  {
    i18nKey: 'location',
    icons: [
      'map-pin', 'map-pinned', 'map', 'navigation', 'navigation-2',
      'flag', 'flag-triangle-right', 'anchor', 'compass', 'target',
      'crosshair', 'locate', 'locate-fixed', 'route', 'milestone',
      'landmark',
    ],
  },
  {
    i18nKey: 'buildings',
    icons: [
      'home', 'building', 'building-2', 'store', 'warehouse',
      'factory', 'school', 'hospital', 'hotel', 'church',
      'castle', 'tent', 'fuel', 'land-plot', 'library', 'theater',
    ],
  },
  {
    i18nKey: 'agriculture',
    icons: [
      'tractor', 'sprout', 'leaf', 'leafy-green', 'trees',
      'tree-pine', 'tree-deciduous', 'tree-palm', 'flower', 'flower-2',
      'cherry', 'wheat', 'apple', 'citrus', 'carrot',
      'grape', 'banana', 'mountain', 'mountain-snow',
      'fish', 'bird', 'paw-print', 'bug',
    ],
  },
  {
    i18nKey: 'weather',
    icons: [
      'sun', 'sun-moon', 'sunrise', 'sunset', 'moon',
      'cloud', 'cloud-drizzle', 'cloud-fog', 'cloud-hail', 'cloud-lightning',
      'cloud-rain', 'cloud-snow', 'cloud-sun', 'snowflake', 'wind',
      'tornado', 'zap', 'umbrella', 'droplet', 'droplets',
      'waves', 'rainbow', 'haze', 'thermometer',
    ],
  },
  {
    i18nKey: 'tools',
    icons: [
      'wrench', 'hammer', 'hard-hat', 'paint-bucket', 'paintbrush',
      'ruler', 'scissors', 'pickaxe', 'axe', 'drill',
      'cog', 'settings', 'settings-2', 'lightbulb', 'plug',
      'plug-zap', 'cable', 'key', 'lock', 'unlock',
      'spray-can',
    ],
  },
  {
    i18nKey: 'vehicles',
    icons: [
      'truck', 'car', 'car-front', 'bus', 'plane',
      'plane-takeoff', 'plane-landing', 'bike', 'ship', 'ship-wheel',
      'train-front', 'caravan', 'forklift',
    ],
  },
  {
    i18nKey: 'people',
    icons: [
      'user', 'users', 'user-check', 'user-cog', 'user-plus',
      'user-minus', 'user-x', 'crown', 'briefcase', 'baby',
      'graduation-cap', 'glasses', 'smile', 'contact',
    ],
  },
  {
    i18nKey: 'status',
    icons: [
      'circle-check-big', 'triangle-alert', 'octagon-alert', 'circle-alert',
      'circle-x', 'info', 'heart', 'heart-handshake', 'star',
      'sparkles', 'tag', 'tags', 'bookmark', 'thumbs-up',
      'thumbs-down', 'message-circle', 'bell', 'bell-ring', 'eye',
      'eye-off', 'ban', 'shield', 'shield-check',
    ],
  },
  {
    i18nKey: 'commerce',
    icons: [
      'dollar-sign', 'credit-card', 'wallet', 'banknote', 'shopping-cart',
      'shopping-bag', 'package', 'package-open', 'boxes', 'archive',
      'gift', 'receipt', 'calculator', 'percent',
    ],
  },
  {
    i18nKey: 'tech',
    icons: [
      'phone', 'smartphone', 'laptop', 'monitor', 'printer',
      'scan', 'qr-code', 'wifi', 'signal', 'battery',
      'server', 'database', 'camera', 'film', 'music',
      'headphones', 'mic', 'image',
    ],
  },
];

// Flat list — handy for the search filter (loops every icon once and
// matches against the substring query).
export const ALL_PIN_ICONS: MapPinIcon[] = PIN_ICON_CATEGORIES.flatMap(c => c.icons);

// Map legacy keys to the current lucide names:
//   - migration 035 used basic shapes (pin/circle/square/triangle)
//   - older lucide releases used `alert-triangle`, `check-circle`, etc.
//     before the rename to `triangle-alert`, `circle-check-big`, etc.
// Falls through to the raw key if no remap is needed.
export function normalizeIconKey(raw: string | null | undefined): MapPinIcon {
  if (!raw) return 'map-pin';
  const lookup: Record<string, MapPinIcon> = {
    // Legacy shape keys
    pin: 'map-pin',
    circle: 'map-pin',
    square: 'map-pin',
    triangle: 'map-pin',
    star: 'star',
    // Pre-rename lucide aliases
    'check-circle': 'circle-check-big',
    'check-circle-2': 'circle-check-big',
    'alert-triangle': 'triangle-alert',
    'alert-circle': 'circle-alert',
    'alert-octagon': 'octagon-alert',
    'x-circle': 'circle-x',
  };
  if (raw in lookup) return lookup[raw];
  return raw as MapPinIcon;
}

// Curated tailwind 500-weight palette + neutrals. 18 colors → still fits a
// 6×3 grid on mobile and 9×2 on web.
export const PIN_COLORS: string[] = [
  '#EF4444', // red
  '#F97316', // orange
  '#F59E0B', // amber
  '#EAB308', // yellow
  '#84CC16', // lime
  '#22C55E', // green
  '#10B981', // emerald
  '#14B8A6', // teal
  '#06B6D4', // cyan
  '#0EA5E9', // sky
  '#3B82F6', // blue
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#A855F7', // purple
  '#EC4899', // pink
  '#6B7280', // gray
  '#000000', // black
  '#FFFFFF', // white
];

// Standard (non-custom) fields per layer offered in the rule editor's
// field dropdown. We expose every column the user can read, not just
// enum-like ones — they may want a rule like "Last Name = Ramirez" or
// "City = Omaha". The settings UI appends the business's custom field
// templates after these. Label resolution happens in each platform's
// settings UI via existing i18n keys.
export const STANDARD_FIELDS_BY_LAYER: Record<
  'clients' | 'jobs' | 'employees' | 'weather',
  string[]
> = {
  clients: [
    'first_name', 'last_name', 'company',
    'phone_cell', 'phone_office',
    'email_office', 'email_home',
    'address', 'city', 'state', 'zip_code',
  ],
  jobs: [
    'title', 'description', 'status', 'priority',
    'job_address', 'job_city', 'job_state',
    'scheduled_date',
  ],
  employees: [
    'first_name', 'last_name', 'role',
    'phone', 'email',
    'address', 'city', 'state', 'zip_code',
    'pay_type', 'hire_date',
  ],
  weather: [
    // Fields available on weather_alerts rows. Rules can do things like
    // event = 'Tornado Warning' → red tornado icon, or
    // severity = 'Extreme' → larger / different color.
    'event', 'severity', 'headline', 'area_desc',
    'county', 'state',
  ],
};

// Backward-compat alias for callers still typed against the old MapPinShape.
// New code should use MapPinIcon directly.
export type MapPinShape = MapPinIcon;
