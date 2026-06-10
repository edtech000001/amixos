// Mobile icon renderer for map pins. Maps the shared MapPinIcon keys to
// their lucide-react-native component. The renderer is a tiny function;
// the bulk of this file is the static import map (kept here so MapScreen
// + MapSettingsSheet don't both have to import 190+ icons).

import type { LucideIcon } from 'lucide-react-native';
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
  // Tools & Construction (21)
  Wrench, Hammer, HardHat, PaintBucket, Paintbrush, Ruler, Scissors, Pickaxe,
  Axe, Drill, Cog, Settings, Settings2, Lightbulb, Plug, PlugZap, Cable,
  Key, Lock, Unlock, SprayCan,
  // Vehicles (13)
  Truck, Car, CarFront, Bus, Plane, PlaneTakeoff, PlaneLanding, Bike, Ship,
  ShipWheel, TrainFront, Caravan, Forklift,
  // People (14)
  User, Users, UserCheck, UserCog, UserPlus, UserMinus, UserX, Crown, Briefcase,
  Baby, GraduationCap, Glasses, Smile, Contact,
  // Status & Symbols (24)
  Check,
  CircleCheckBig, TriangleAlert, OctagonAlert, CircleAlert, CircleX, Info,
  Heart, HeartHandshake, Star, Sparkles, Tag, Tags, Bookmark, ThumbsUp,
  ThumbsDown, MessageCircle, Bell, BellRing, Eye, EyeOff, Ban, Shield, ShieldCheck,
  // Commerce (14)
  DollarSign, CreditCard, Wallet, Banknote, ShoppingCart, ShoppingBag, Package,
  PackageOpen, Boxes, Archive, Gift, Receipt, Calculator, Percent,
  // Technology (18)
  Phone, Smartphone, Laptop, Monitor, Printer, Scan, QrCode, Wifi, Signal,
  Battery, Server, Database, Camera, Film, Music, Headphones, Mic, Image,
} from 'lucide-react-native';
import { normalizeIconKey, type MapPinIcon } from '@amixos/shared/lib/mapPinPresets';

const ICON_MAP: Record<string, LucideIcon> = {
  // Location
  'map-pin': MapPin, 'map-pinned': MapPinned, map: MapIcon,
  navigation: Navigation, 'navigation-2': Navigation2,
  flag: Flag, 'flag-triangle-right': FlagTriangleRight,
  anchor: Anchor, compass: Compass, target: Target, crosshair: Crosshair,
  locate: Locate, 'locate-fixed': LocateFixed, route: Route,
  milestone: Milestone, landmark: Landmark,
  // Buildings
  home: Home, building: Building, 'building-2': Building2,
  store: Store, warehouse: Warehouse, factory: Factory, school: School,
  hospital: Hospital, hotel: Hotel, church: Church, castle: Castle,
  tent: Tent, fuel: Fuel, 'land-plot': LandPlot, library: Library, theater: Theater,
  // Agriculture & Nature
  tractor: Tractor, sprout: Sprout, leaf: Leaf, 'leafy-green': LeafyGreen,
  trees: Trees, 'tree-pine': TreePine, 'tree-deciduous': TreeDeciduous, 'tree-palm': TreePalm,
  flower: Flower, 'flower-2': Flower2, cherry: Cherry, wheat: Wheat,
  apple: Apple, citrus: Citrus, carrot: Carrot, grape: Grape, banana: Banana,
  mountain: Mountain, 'mountain-snow': MountainSnow,
  fish: Fish, bird: Bird, 'paw-print': PawPrint, bug: Bug,
  // Weather
  sun: Sun, 'sun-moon': SunMoon, sunrise: Sunrise, sunset: Sunset, moon: Moon,
  cloud: Cloud, 'cloud-drizzle': CloudDrizzle, 'cloud-fog': CloudFog,
  'cloud-hail': CloudHail, 'cloud-lightning': CloudLightning, 'cloud-rain': CloudRain,
  'cloud-snow': CloudSnow, 'cloud-sun': CloudSun, snowflake: Snowflake,
  wind: Wind, tornado: Tornado, zap: Zap, umbrella: Umbrella,
  droplet: Droplet, droplets: Droplets, waves: Waves, rainbow: Rainbow,
  haze: Haze, thermometer: Thermometer,
  // Tools
  wrench: Wrench, hammer: Hammer, 'hard-hat': HardHat, 'paint-bucket': PaintBucket,
  paintbrush: Paintbrush, ruler: Ruler, scissors: Scissors, pickaxe: Pickaxe,
  axe: Axe, drill: Drill, cog: Cog, settings: Settings, 'settings-2': Settings2,
  lightbulb: Lightbulb, plug: Plug, 'plug-zap': PlugZap, cable: Cable,
  key: Key, lock: Lock, unlock: Unlock, 'spray-can': SprayCan,
  // Vehicles
  truck: Truck, car: Car, 'car-front': CarFront, bus: Bus,
  plane: Plane, 'plane-takeoff': PlaneTakeoff, 'plane-landing': PlaneLanding,
  bike: Bike, ship: Ship, 'ship-wheel': ShipWheel,
  'train-front': TrainFront, caravan: Caravan, forklift: Forklift,
  // People
  user: User, users: Users, 'user-check': UserCheck, 'user-cog': UserCog,
  'user-plus': UserPlus, 'user-minus': UserMinus, 'user-x': UserX,
  crown: Crown, briefcase: Briefcase, baby: Baby,
  'graduation-cap': GraduationCap, glasses: Glasses, smile: Smile, contact: Contact,
  // Status
  'circle-check-big': CircleCheckBig, 'triangle-alert': TriangleAlert,
  'octagon-alert': OctagonAlert, 'circle-alert': CircleAlert, 'circle-x': CircleX,
  info: Info, heart: Heart, 'heart-handshake': HeartHandshake,
  star: Star, sparkles: Sparkles, tag: Tag, tags: Tags, bookmark: Bookmark,
  'thumbs-up': ThumbsUp, 'thumbs-down': ThumbsDown, 'message-circle': MessageCircle,
  bell: Bell, 'bell-ring': BellRing, eye: Eye, 'eye-off': EyeOff,
  ban: Ban, shield: Shield, 'shield-check': ShieldCheck,
  // Commerce
  'dollar-sign': DollarSign, 'credit-card': CreditCard, wallet: Wallet,
  banknote: Banknote, 'shopping-cart': ShoppingCart, 'shopping-bag': ShoppingBag,
  package: Package, 'package-open': PackageOpen, boxes: Boxes, archive: Archive,
  gift: Gift, receipt: Receipt, calculator: Calculator, percent: Percent,
  // Technology
  phone: Phone, smartphone: Smartphone, laptop: Laptop, monitor: Monitor,
  printer: Printer, scan: Scan, 'qr-code': QrCode, wifi: Wifi, signal: Signal,
  battery: Battery, server: Server, database: Database,
  camera: Camera, film: Film, music: Music, headphones: Headphones, mic: Mic, image: Image,
};

// Get the lucide component for an icon key. Accepts legacy shape names
// (pin/circle/square/triangle/etc.) and falls back to MapPin if unknown.
export function getPinIconComponent(rawKey: string | null | undefined): LucideIcon {
  const key = normalizeIconKey(rawKey);
  return ICON_MAP[key] ?? MapPin;
}

// Bare icon — picker grid uses this directly so users see the icon shape
// without the pin badge framing. Filled style by default.
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
  return <Icon color={color} fill={color} strokeWidth={1.5} size={size} />;
}

// Map-style pin badge — colored teardrop with a white stroke and the lucide
// icon centered in the round top in white. Used for the actual map marker
// and the preview chips in the settings UI so users see exactly what their
// rule will produce on the map.
//
// Anchored visually at the bottom point: callers using this as a marker
// should treat the bottom-center as the lat/lng anchor.
import Svg, { Path } from 'react-native-svg';
import { View, Text } from 'react-native';

export function PinBadge({
  iconKey,
  color,
  iconColor = '#FFFFFF',
  size,
  countBadge,
  checkBadge,
}: {
  iconKey: string | null | undefined;
  color: string;
  iconColor?: string;  // foreground glyph color; defaults to white
  size: number;
  // Optional "+N" badge in the top-right corner (used by grouped weather
  // pins to show how many other alerts share the same location).
  countBadge?: number;
  // Optional green ✓ badge in the same corner — used by outreach mode to
  // flag clients contacted within the window. Count badge wins if both set.
  checkBadge?: boolean;
}) {
  const Icon = getPinIconComponent(iconKey);
  const w = size;
  const h = size * 1.25; // teardrop is taller than wide
  // Icon sits in the round top half. The round portion of the pin is
  // roughly the top 60% of the height, centered horizontally.
  const iconSize = Math.round(size * 0.5);
  const iconTop = Math.round(h * 0.18);
  // Badge scales with pin so it stays proportional at all pin sizes.
  const badgeSize = Math.max(14, Math.round(size * 0.55));
  const badgeFont = Math.max(8, Math.round(size * 0.34));
  return (
    <View style={{ width: w, height: h, alignItems: 'center' }}>
      {/* viewBox is padded 1.5 units on every side so the white stroke
         (width 2 = 1px on each side of the path) has room to render
         without being clipped by the viewBox edges. Without the padding
         the stroke gets cropped at top/sides/tip and the border looks
         jagged. Round line joins + caps smooth the transitions. */}
      <Svg width={w} height={h} viewBox="-1.5 -1.5 35 43">
        <Path
          d="M16 0 C7.16 0 0 7.16 0 16 C0 26 11 35 15.2 39.4 C15.65 39.85 16.35 39.85 16.8 39.4 C21 35 32 26 32 16 C32 7.16 24.84 0 16 0 Z"
          fill={color}
          stroke="#FFFFFF"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: iconTop,
          width: w,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        pointerEvents="none"
      >
        {/* Lucide icons are stroke-only (fill="none" by default). Passing
           fill={iconColor} fills enclosed regions inside the glyph and
           makes the outline look broken. Only set the stroke color. */}
        <Icon color={iconColor} strokeWidth={2} size={iconSize} />
      </View>
      {countBadge && countBadge > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -badgeSize * 0.15,
            right: -badgeSize * 0.25,
            minWidth: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            paddingHorizontal: 4,
            backgroundColor: '#DC2626',
            borderWidth: 1.5,
            borderColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: badgeFont, fontWeight: '800', lineHeight: badgeFont + 1 }}>
            +{countBadge}
          </Text>
        </View>
      ) : checkBadge ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -badgeSize * 0.15,
            right: -badgeSize * 0.25,
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            backgroundColor: '#16A34A',
            borderWidth: 1.5,
            borderColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check color="#FFFFFF" strokeWidth={3} size={Math.round(badgeSize * 0.62)} />
        </View>
      ) : null}
    </View>
  );
}

// Silence unused-import warning — the type is consumed via PIN_ICON_CATEGORIES.
export type { MapPinIcon };
