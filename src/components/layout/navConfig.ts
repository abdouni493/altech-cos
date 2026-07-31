import {
  LayoutDashboard,
  SprayCan,
  ShoppingBag,
  FlaskConical,
  Store,
  Receipt,
  Heart,
  Truck,
  UserCog,
  Wallet,
  Banknote,
  PieChart,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { ModuleKey } from '@/types'
import type { TranslationKey } from '@/i18n/translations'

export interface NavItem {
  key: ModuleKey
  path: string
  labelKey: TranslationKey
  icon: LucideIcon
  color: string
}

// Icons & accent colours tuned for a cosmetics boutique (violet · fuchsia · pink · lilac).
export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', path: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard, color: '#F5C2F1' },
  { key: 'stock', path: '/stock', labelKey: 'stock', icon: SprayCan, color: '#E879F9' },
  { key: 'purchase', path: '/purchase', labelKey: 'purchase', icon: ShoppingBag, color: '#C4B5FD' },
  { key: 'production', path: '/production', labelKey: 'production', icon: FlaskConical, color: '#A78BFA' },
  { key: 'pos', path: '/pos', labelKey: 'pos', icon: Store, color: '#F0ABFC' },
  { key: 'sales', path: '/sales', labelKey: 'sales', icon: Receipt, color: '#F9A8D4' },
  { key: 'clients', path: '/clients', labelKey: 'clients', icon: Heart, color: '#F472B6' },
  { key: 'suppliers', path: '/suppliers', labelKey: 'suppliers', icon: Truck, color: '#D8B4FE' },
  { key: 'workers', path: '/workers', labelKey: 'workers', icon: UserCog, color: '#F0B6D8' },
  { key: 'expenses', path: '/expenses', labelKey: 'expenses', icon: Wallet, color: '#FBA6CB' },
  { key: 'caisse', path: '/caisse', labelKey: 'caisse', icon: Banknote, color: '#C4B5FD' },
  { key: 'reports', path: '/reports', labelKey: 'reports', icon: PieChart, color: '#F5C2F1' },
  { key: 'settings', path: '/settings', labelKey: 'settings', icon: Settings, color: '#E879F9' },
]
