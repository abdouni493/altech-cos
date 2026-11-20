import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Bell,
  ChevronRight,
  Globe,
  LogOut,
  Menu,
  AlertTriangle,
  CalendarClock,
  CalendarX,
  HardDrive,
  Loader2,
  CircleCheck,
  CircleAlert,
  Keyboard,
} from 'lucide-react'
import { useTranslation } from '@/i18n/useTranslation'
import { useAuthStore } from '@/store/useAuthStore'
import { useProductStore } from '@/store/useProductStore'
import { NAV_ITEMS } from './navConfig'
import { flushDatabase, useDbStatus } from '@/lib/database'
import { initials, expiryInfo, type ExpiryInfo } from '@/utils/helpers'
import type { Product } from '@/types'

interface HeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onShowShortcuts: () => void
}

export const Header = ({ sidebarOpen, onToggleSidebar, onShowShortcuts }: HeaderProps) => {
  const { t, toggleLang, lang } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.currentUser)
  const logout = useAuthStore((s) => s.logout)
  const dbStatus = useDbStatus((s) => s.status)
  const dbBackend = useDbStatus((s) => s.backend)
  const products = useProductStore((s) => s.products)
  const [notifOpen, setNotifOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const lowStock = useMemo(() => products.filter((p) => p.quantity <= p.minQuantity), [products])

  const expiring = useMemo(() => {
    const rows: { product: Product; info: ExpiryInfo }[] = []
    for (const p of products) {
      if (!p.hasExpiration || !p.expirationDate) continue
      const info = expiryInfo(p.expirationDate)
      if (info && info.status !== 'ok') rows.push({ product: p, info })
    }
    return rows.sort((a, b) => a.info.days - b.info.days)
  }, [products])

  const alertCount = lowStock.length + expiring.length

  const current = NAV_ITEMS.find((i) => location.pathname.startsWith(i.path))
  const crumb = current ? t(current.labelKey) : ''

  const handleLogout = async () => {
    await flushDatabase()
    logout()
    navigate('/login')
  }

  /** Forces the pending changes to disk — the status chip also retries on its own. */
  const handleSaveNow = async () => {
    const ok = await flushDatabase()
    if (ok) toast.success(t('dbSaved'))
    else toast.error(t('dbError'))
  }

  const statusLabel =
    dbStatus === 'error' ? t('dbError') : dbStatus === 'saving' ? t('dbSaving') : t('dbSaved')

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-woodborder bg-white/85 px-3 py-2.5 backdrop-blur-md sm:px-5">
      {/* Menu toggle + breadcrumb */}
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <motion.button
          type="button"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            // Close the dropdowns first so they can never overlap the drawer.
            setNotifOpen(false)
            setMenuOpen(false)
            onToggleSidebar()
          }}
          aria-label={sidebarOpen ? t('closeMenu') : t('openMenu')}
          aria-expanded={sidebarOpen}
          title={t('menu')}
          className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-woodborder bg-white px-3 text-wood-dark shadow-wood transition hover:border-wood-warm/40 hover:text-wood-warm"
        >
          <Menu size={18} />
          <span className="hidden text-xs font-semibold sm:inline">{t('menu')}</span>
        </motion.button>

        <Link to="/dashboard" className="hidden truncate font-semibold text-wood-medium hover:text-wood-warm sm:inline">
          {t('appName')}
        </Link>
        {crumb && (
          <>
            <ChevronRight size={14} className="hidden text-wood-medium/40 sm:inline rtl:rotate-180" />
            <span className="truncate font-bold text-wood-dark">{crumb}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Local database status — click to save right away */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleSaveNow}
          title={`${dbBackend === 'browser' ? t('dbBrowserMode') : t('dbServerMode')} — ${statusLabel}`}
          className={`flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${
            dbStatus === 'error'
              ? 'animate-pulse-glow border-terracotta/40 bg-terracotta/10 text-terracotta'
              : 'border-sage/30 bg-sage/10 text-[#067647] hover:bg-sage/15'
          }`}
        >
          {dbStatus === 'saving' ? (
            <Loader2 size={15} className="animate-spin" />
          ) : dbStatus === 'error' ? (
            <CircleAlert size={15} />
          ) : dbStatus === 'saved' ? (
            <CircleCheck size={15} />
          ) : (
            <HardDrive size={15} />
          )}
          <span className="hidden lg:inline">{dbStatus === 'idle' ? t('localDatabase') : statusLabel}</span>
        </motion.button>

        {/* Keyboard shortcuts */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onShowShortcuts}
          title={`${t('keyboardShortcuts')} (F1)`}
          className="hidden h-10 w-10 items-center justify-center rounded-lg border border-woodborder bg-white text-wood-medium shadow-wood transition hover:border-wood-warm/40 hover:text-wood-warm md:flex"
        >
          <Keyboard size={17} />
        </motion.button>

        {/* Language */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleLang}
          className="flex h-10 items-center gap-1.5 rounded-lg border border-woodborder bg-white px-3 text-xs font-bold text-wood-medium shadow-wood transition hover:border-wood-warm/40 hover:text-wood-warm"
        >
          <Globe size={16} />
          {lang === 'fr' ? 'FR' : 'ع'}
        </motion.button>

        {/* Notifications */}
        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setNotifOpen((v) => !v)
              setMenuOpen(false)
            }}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-woodborder bg-white text-wood-medium shadow-wood transition hover:border-wood-warm/40 hover:text-wood-warm"
          >
            <Bell size={18} />
            {alertCount > 0 && (
              <span className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {alertCount}
              </span>
            )}
          </motion.button>
          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                className="card-wood absolute end-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl p-3 shadow-wood-lg"
              >
                {alertCount === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-wood-medium">{t('noData')}</p>
                ) : (
                  <div className="max-h-80 space-y-3 overflow-y-auto">
                    {lowStock.length > 0 && (
                      <div>
                        <p className="mb-1 px-1 text-xs font-bold uppercase tracking-wide text-wood-medium">{t('stockAlerts')}</p>
                        <div className="space-y-1">
                          {lowStock.map((p) => (
                            <Link
                              key={p.id}
                              to="/stock"
                              onClick={() => setNotifOpen(false)}
                              className="flex items-center gap-2 rounded-lg p-2 transition hover:bg-wood-cream"
                            >
                              <AlertTriangle size={16} className="shrink-0 text-terracotta" />
                              <span className="flex-1 truncate text-xs font-medium text-wood-dark">{p.name}</span>
                              <span className="text-xs font-bold text-terracotta">{p.quantity}/{p.minQuantity}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    {expiring.length > 0 && (
                      <div>
                        <p className="mb-1 px-1 text-xs font-bold uppercase tracking-wide text-wood-medium">{t('expirationAlerts')}</p>
                        <div className="space-y-1">
                          {expiring.map(({ product, info }) => {
                            const isExpired = info.status === 'expired'
                            return (
                              <Link
                                key={product.id}
                                to="/stock"
                                onClick={() => setNotifOpen(false)}
                                className="flex items-center gap-2 rounded-lg p-2 transition hover:bg-wood-cream"
                              >
                                {isExpired ? (
                                  <CalendarX size={16} className="shrink-0 text-terracotta" />
                                ) : (
                                  <CalendarClock size={16} className="shrink-0 text-[#B45309]" />
                                )}
                                <span className="flex-1 truncate text-xs font-medium text-wood-dark">{product.name}</span>
                                <span className={`text-xs font-bold ${isExpired ? 'text-terracotta' : 'text-[#B45309]'}`}>
                                  {info.days === 0
                                    ? t('expiresToday')
                                    : isExpired
                                      ? t('expiredSinceDays').replace('{n}', String(Math.abs(info.days)))
                                      : t('expiresInDays').replace('{n}', String(info.days))}
                                </span>
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User */}
        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.02 }}
            onClick={() => {
              setMenuOpen((v) => !v)
              setNotifOpen(false)
            }}
            className="flex h-10 items-center gap-2 rounded-lg border border-woodborder bg-white pe-1 ps-1 shadow-wood transition hover:border-wood-warm/40 sm:pe-3"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-shine text-xs font-bold text-white">
              {initials(currentUser?.fullName ?? 'U')}
            </div>
            <div className="hidden text-start sm:block">
              <p className="text-xs font-bold leading-none text-wood-dark">{currentUser?.fullName}</p>
              <p className="mt-0.5 text-[10px] text-wood-medium">{currentUser?.role}</p>
            </div>
          </motion.button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                className="card-wood absolute end-0 mt-2 w-48 rounded-xl p-2 shadow-wood-lg"
              >
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm text-wood-dark transition hover:bg-wood-cream"
                >
                  {t('myAccount')}
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-terracotta transition hover:bg-terracotta/10"
                >
                  <LogOut size={15} />
                  {t('logout')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
