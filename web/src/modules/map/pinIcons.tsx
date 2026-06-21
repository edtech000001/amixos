'use client';

// Web icon renderer for map pins. Same key set as the mobile renderer,
// but here we have two consumers:
//   - settings UI: render the icon as a React component (PinIcon)
//   - Google Maps markers: need a data URL string (iconToDataUrl)
//
// renderToString from react-dom/server is available in the browser too
// (just costs a bit of bundle) and is the simplest way to turn a lucide
// React icon into the SVG string Google Maps needs.

import { renderToString } from 'react-dom/server';
import type { LucideIcon } from 'lucide-react';
import {
  // Location (16)
  MapPin, MapPinned, Map as MapIcon, Navigation, Navigation2, Flag, FlagTriangleRight, Anchor,
  Compass, Target, Crosshair, Locate, LocateFixed, Route, Milestone, Landmark,
  // Buildings (16)
  Home, Building, Building2, Store, Warehouse, Factory, School, Hospital,
  Hotel, Church, Castle, Tent, Fuel, LandPlot, Library, Theater,
  // Agriculture & Nature (23)
  Tractor, Sprout, Leaf, LeafyGreen, Trees, TreePine, TreeDeciduous, TreePalm,
  Flower, Flower2, Cherry, Wheat, Apple, Citrus, Carrot, Grape, Banana,
  Mountain, MountainSnow, Fish, Bird, PawPrint, Bug,
  // Weather (24)
  Sun, SunMoon, Sunrise, Sunset, Moon, Cloud, CloudDrizzle, CloudFog, CloudHail,
  CloudLightning, CloudRain, CloudSnow, CloudSun, Snowflake, Wind, Tornado,
  Zap, Umbrella, Droplet, Droplets, Waves, Rainbow, Haze, Thermometer,
  // Tools (21)
  Wrench, Hammer, HardHat, PaintBucket, Paintbrush, Ruler, Scissors, Pickaxe,
  Axe, Drill, Cog, Settings, Settings2, Lightbulb, Plug, PlugZap, Cable,
  Key, Lock, Unlock, SprayCan,
  // Vehicles (13)
  Truck, Car, CarFront, Bus, Plane, PlaneTakeoff, PlaneLanding, Bike, Ship,
  ShipWheel, TrainFront, Caravan, Forklift,
  // People (14)
  User, Users, UserCheck, UserCog, UserPlus, UserMinus, UserX, Crown, Briefcase,
  Baby, GraduationCap, Glasses, Smile, Contact,
  // Status (24)
  CircleCheckBig, TriangleAlert, OctagonAlert, CircleAlert, CircleX, Info,
  Heart, HeartHandshake, Star, Sparkles, Tag, Tags, Bookmark, ThumbsUp,
  ThumbsDown, MessageCircle, Bell, BellRing, Eye, EyeOff, Ban, Shield, ShieldCheck,
  // Commerce (14)
  DollarSign, CreditCard, Wallet, Banknote, ShoppingCart, ShoppingBag, Package,
  PackageOpen, Boxes, Archive, Gift, Receipt, Calculator, Percent,
  // Technology (18)
  Phone, Smartphone, Laptop, Monitor, Printer, Scan, QrCode, Wifi, Signal,
  Battery, Server, Database, Camera, Film, Music, Headphones, Mic, Image,
} from 'lucide-react';
import { normalizeIconKey, type MapPinIcon } from '@amixos/shared/lib/mapPinPresets';

const ICON_MAP: Record<string, LucideIcon> = {
  'map-pin': MapPin, 'map-pinned': MapPinned, map: MapIcon,
  navigation: Navigation, 'navigation-2': Navigation2,
  flag: Flag, 'flag-triangle-right': FlagTriangleRight,
  anchor: Anchor, compass: Compass, target: Target, crosshair: Crosshair,
  locate: Locate, 'locate-fixed': LocateFixed, route: Route,
  milestone: Milestone, landmark: Landmark,
  home: Home, building: Building, 'building-2': Building2,
  store: Store, warehouse: Warehouse, factory: Factory, school: School,
  hospital: Hospital, hotel: Hotel, church: Church, castle: Castle,
  tent: Tent, fuel: Fuel, 'land-plot': LandPlot, library: Library, theater: Theater,
  tractor: Tractor, sprout: Sprout, leaf: Leaf, 'leafy-green': LeafyGreen,
  trees: Trees, 'tree-pine': TreePine, 'tree-deciduous': TreeDeciduous, 'tree-palm': TreePalm,
  flower: Flower, 'flower-2': Flower2, cherry: Cherry, wheat: Wheat,
  apple: Apple, citrus: Citrus, carrot: Carrot, grape: Grape, banana: Banana,
  mountain: Mountain, 'mountain-snow': MountainSnow,
  fish: Fish, bird: Bird, 'paw-print': PawPrint, bug: Bug,
  sun: Sun, 'sun-moon': SunMoon, sunrise: Sunrise, sunset: Sunset, moon: Moon,
  cloud: Cloud, 'cloud-drizzle': CloudDrizzle, 'cloud-fog': CloudFog,
  'cloud-hail': CloudHail, 'cloud-lightning': CloudLightning, 'cloud-rain': CloudRain,
  'cloud-snow': CloudSnow, 'cloud-sun': CloudSun, snowflake: Snowflake,
  wind: Wind, tornado: Tornado, zap: Zap, umbrella: Umbrella,
  droplet: Droplet, droplets: Droplets, waves: Waves, rainbow: Rainbow,
  haze: Haze, thermometer: Thermometer,
  wrench: Wrench, hammer: Hammer, 'hard-hat': HardHat, 'paint-bucket': PaintBucket,
  paintbrush: Paintbrush, ruler: Ruler, scissors: Scissors, pickaxe: Pickaxe,
  axe: Axe, drill: Drill, cog: Cog, settings: Settings, 'settings-2': Settings2,
  lightbulb: Lightbulb, plug: Plug, 'plug-zap': PlugZap, cable: Cable,
  key: Key, lock: Lock, unlock: Unlock, 'spray-can': SprayCan,
  truck: Truck, car: Car, 'car-front': CarFront, bus: Bus,
  plane: Plane, 'plane-takeoff': PlaneTakeoff, 'plane-landing': PlaneLanding,
  bike: Bike, ship: Ship, 'ship-wheel': ShipWheel,
  'train-front': TrainFront, caravan: Caravan, forklift: Forklift,
  user: User, users: Users, 'user-check': UserCheck, 'user-cog': UserCog,
  'user-plus': UserPlus, 'user-minus': UserMinus, 'user-x': UserX,
  crown: Crown, briefcase: Briefcase, baby: Baby,
  'graduation-cap': GraduationCap, glasses: Glasses, smile: Smile, contact: Contact,
  'circle-check-big': CircleCheckBig, 'triangle-alert': TriangleAlert,
  'octagon-alert': OctagonAlert, 'circle-alert': CircleAlert, 'circle-x': CircleX,
  info: Info, heart: Heart, 'heart-handshake': HeartHandshake,
  star: Star, sparkles: Sparkles, tag: Tag, tags: Tags, bookmark: Bookmark,
  'thumbs-up': ThumbsUp, 'thumbs-down': ThumbsDown, 'message-circle': MessageCircle,
  bell: Bell, 'bell-ring': BellRing, eye: Eye, 'eye-off': EyeOff,
  ban: Ban, shield: Shield, 'shield-check': ShieldCheck,
  'dollar-sign': DollarSign, 'credit-card': CreditCard, wallet: Wallet,
  banknote: Banknote, 'shopping-cart': ShoppingCart, 'shopping-bag': ShoppingBag,
  package: Package, 'package-open': PackageOpen, boxes: Boxes, archive: Archive,
  gift: Gift, receipt: Receipt, calculator: Calculator, percent: Percent,
  phone: Phone, smartphone: Smartphone, laptop: Laptop, monitor: Monitor,
  printer: Printer, scan: Scan, 'qr-code': QrCode, wifi: Wifi, signal: Signal,
  battery: Battery, server: Server, database: Database,
  camera: Camera, film: Film, music: Music, headphones: Headphones, mic: Mic, image: Image,
};

export function getPinIconComponent(rawKey: string | null | undefined): LucideIcon {
  const key = normalizeIconKey(rawKey);
  return ICON_MAP[key] ?? MapPin;
}

// React-renderable icon — used in settings UI (picker grid, rule rows, etc.).
export function PinIcon({
  iconKey,
  color,
  size,
}: {
  iconKey: string | null | undefined;
  color: string;
  size: number;
}) {
  const Icon = getPinIconComponent(iconKey);
  // Stroke-only render — see PinBadge bug fix note below.
  return <Icon color={color} strokeWidth={1.5} size={size} />;
}

// Memoize outputs — same (icon, color, iconColor, size) is computed many
// times per render (every marker). renderToString isn't super cheap per call.
// Key now includes iconColor so the cache stays correct when foreground
// color is customized per rule.
const iconInnerCache = new Map<string, string>();

function getIconInner(rawKey: string | null | undefined, iconColor: string): string {
  const key = normalizeIconKey(rawKey);
  const cacheKey = `${key}|${iconColor}`;
  const cached = iconInnerCache.get(cacheKey);
  if (cached) return cached;
  const Icon = ICON_MAP[key] ?? MapPin;
  // Lucide icons are stroke-only (fill="none" by default). Passing
  // fill={iconColor} fills enclosed regions inside the glyph and breaks
  // the outline rendering. Only set the stroke color via `color`.
  const svg = renderToString(
    <Icon color={iconColor} strokeWidth={2.25} />,
  );
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  iconInnerCache.set(cacheKey, inner);
  return inner;
}

// Geometry + data URL for a Google Maps marker icon. Mirrors mobile's
// PinBadge (mobile/lib/mapPinIcons.tsx) so pins look identical on both
// platforms: icon at 50% of pin width sitting 18% from the top, and
// count/check badges that scale with the pin (with a 14px readability
// floor) and overflow the pin's top-right corner like a notification dot.
export interface PinMarkerIcon {
  url: string;
  /** Rendered size for google.maps.Size — includes badge overflow. */
  width: number;
  height: number;
  /** Teardrop tip position for google.maps.Point. */
  anchorX: number;
  anchorY: number;
}

const pinMarkerIconCache = new Map<string, PinMarkerIcon>();

export function buildPinMarkerIcon(
  rawKey: string | null | undefined,
  color: string,
  widthPx: number,
  iconColor: string = '#ffffff',
  // Optional "+N" badge in the top-right corner (used by grouped weather
  // pins to show how many other alerts share the same location).
  countBadge?: number,
  // Optional green ✓ badge in the same top-right corner — used by outreach
  // mode to flag clients contacted within the configured window. The count
  // badge wins if both are set (it never is in practice).
  checkBadge?: boolean,
): PinMarkerIcon {
  const cacheKey = `${normalizeIconKey(rawKey)}|${color}|${iconColor}|${widthPx}|${countBadge ?? 0}|${checkBadge ? 1 : 0}`;
  const cached = pinMarkerIconCache.get(cacheKey);
  if (cached) return cached;
  const iconInner = getIconInner(rawKey, iconColor);

  // The teardrop body spans viewBox x 0..32, y 0..40 (tip at y≈39.4); the
  // base viewBox is padded 1.5 units so the white stroke isn't clipped.
  // `f` converts viewBox units → pixels (pin body box = widthPx wide).
  const f = widthPx / 35;

  // Icon: 50% of pin width, top edge 18% down — same as mobile.
  // Lucide inner content is a 24-unit viewBox; 50% of the 35-unit box
  // is 17.5 units.
  const iconScale = 17.5 / 24;
  const iconX = 16 - 17.5 / 2;
  const iconY = 6.24;

  const hasBadge = (countBadge != null && countBadge > 0) || !!checkBadge;
  // Mobile: badge = max(14px, 55% of pin size), overhanging top-right.
  const badgePx = Math.max(14, Math.round(widthPx * 0.55));
  const bUnits = (badgePx / widthPx) * 35;
  const r = bUnits / 2;
  const badgeCx = 33.5 + 0.25 * bUnits - r;
  const badgeCy = -1.5 - 0.15 * bUnits + r;

  // Expand the canvas so the overflowing badge isn't clipped.
  const xMin = -1.5;
  const yMin = hasBadge ? Math.min(-1.5, badgeCy - r - 1) : -1.5;
  const xMax = hasBadge ? Math.max(33.5, badgeCx + r + 1) : 33.5;
  const vbW = xMax - xMin;
  const vbH = 41.5 - yMin;

  let badge = '';
  if (countBadge != null && countBadge > 0) {
    const label = countBadge > 9 ? '9+' : `+${countBadge}`;
    const fontUnits = (Math.max(8, Math.round(widthPx * 0.34)) / widthPx) * 35 * (label.length > 2 ? 0.85 : 1);
    badge =
      `<g>` +
        `<circle cx="${badgeCx}" cy="${badgeCy}" r="${r}" fill="#DC2626" stroke="#ffffff" stroke-width="1.5"/>` +
        `<text x="${badgeCx}" y="${badgeCy + fontUnits * 0.36}" text-anchor="middle" font-family="Arial, sans-serif" ` +
          `font-size="${fontUnits}" font-weight="800" fill="#ffffff">${label}</text>` +
      `</g>`;
  } else if (checkBadge) {
    const sw = 0.3 * r;
    badge =
      `<g>` +
        `<circle cx="${badgeCx}" cy="${badgeCy}" r="${r}" fill="#16A34A" stroke="#ffffff" stroke-width="1.5"/>` +
        `<path d="M ${badgeCx - 0.45 * r} ${badgeCy + 0.05 * r} l ${0.32 * r} ${0.32 * r} l ${0.55 * r} ${-0.62 * r}" fill="none" stroke="#ffffff" ` +
          `stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</g>`;
  }

  const width = Math.round(vbW * f);
  const height = Math.round(vbH * f);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${xMin} ${yMin} ${vbW} ${vbH}">` +
      `<path d="M16 0 C7.16 0 0 7.16 0 16 C0 26 11 35 15.2 39.4 C15.65 39.85 16.35 39.85 16.8 39.4 C21 35 32 26 32 16 C32 7.16 24.84 0 16 0 Z" ` +
        `fill="${color}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
      // Lucide glyph paths are stroke-only and inherit these from their parent
      // <svg>. We stripped that <svg> in getIconInner, so the stroke/fill MUST
      // be re-declared here or the paths render with the SVG defaults
      // (fill black, stroke none) — i.e. an invisible glyph + a solid pin.
      `<g transform="translate(${iconX} ${iconY}) scale(${iconScale})" ` +
        `fill="none" stroke="${iconColor}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">` +
        `${iconInner}</g>` +
      badge +
    `</svg>`;
  const icon: PinMarkerIcon = {
    url: `data:image/svg+xml;base64,${btoa(svg)}`,
    width,
    height,
    anchorX: (16 - xMin) * f,
    anchorY: (41.5 - yMin) * f,
  };
  pinMarkerIconCache.set(cacheKey, icon);
  return icon;
}

// Build a colored teardrop pin SVG with the lucide icon embedded in the
// round top, return as base64 data URL. Kept for the settings previews
// (PinBadge below) — markers should use buildPinMarkerIcon for correct
// badge overflow geometry.
export function pinBadgeToDataUrl(
  rawKey: string | null | undefined,
  color: string,
  widthPx: number,
  iconColor: string = '#ffffff',
  countBadge?: number,
  checkBadge?: boolean,
): string {
  return buildPinMarkerIcon(rawKey, color, widthPx, iconColor, countBadge, checkBadge).url;
}

export function PinBadge({
  iconKey,
  color,
  iconColor = '#FFFFFF',
  size,
}: {
  iconKey: string | null | undefined;
  color: string;
  iconColor?: string;
  size: number;
}) {
  const url = pinBadgeToDataUrl(iconKey, color, size, iconColor);
  return <img src={url} width={size} height={size * 1.25} alt="" />;
}
