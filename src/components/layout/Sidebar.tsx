import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { NavLink, useNavigate } from 'react-router-dom'
import { Keyboard, LogOut, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { NAV_ITEMS } from './navConfig'
import { useTranslation } from '@/i18n/useTranslation'
import { useAuthStore } from '@/store/useAuthStore'
import { initials, moduleEnabled } from '@/utils/helpers'
import { clsx } from '@/utils/clsx'
import { flushDatabase } from '@/lib/database'

interface SidebarNavProps {
  /** Icon-only rail instead of the full list. */
  collapsed?: boolean
  /** Called after a link is followed (closes the phone drawer). */
  onNavigate?: () => void
  /** Desktop: collapse / expand button. Phone: close button. */
  onToggle?: () => void
  /** Phone drawer → the toggle closes it (X) instead of collapsing. */
  isDrawer?: boolean
  onShowShortcuts?: () => void
}

/**
 * Navigation content, shared by the permanent desktop sidebar (expanded by
 * default, can be collapsed to an icon rail) and the phone drawer.
 */
export const SidebarNav = ({ collapsed = false, onNavigate, onToggle, isDrawer = false, onShowShortcuts }: SidebarNavProps) => {
  const { t, isRTL } = useTranslation()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.currentUser)
  const logout = useAuthStore((s) => s.logout)
  const items = NAV_ITEMS.filter((item) => moduleEnabled(currentUser?.permissions, item.key))

  const handleLogout = async () => {
    onNavigate?.()
    await flushDatabase()
    logout()
    navigate('/login')
  }

  const ToggleIcon = isDrawer ? X : collapsed !== isRTL ? PanelLeftOpen : PanelLeftClose

  return (
    <div className="relative z-10 flex h-full flex-col">
      {/* Brand + collapse / close */}
      <div className={clsx('flex items-center border-b border-white/10', collapsed ? 'flex-col gap-2 px-2 py-3' : 'gap-3 px-4 py-4')}>
        <BrandMark size={collapsed ? 40 : 42} className="shrink-0" />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <h1 className="text-display truncate text-lg font-bold leading-tight text-white">{t('appName')}</h1>
            <p className="mt-0.5 truncate text-[11px] font-medium text-white/50">{t('appTagline')}</p>
          </div>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            title={isDrawer ? t('closeMenu') : `${collapsed ? t('openMenu') : t('closeMenu')} (Alt+M)`}
            aria-label={isDrawer || !collapsed ? t('closeMenu') : t('openMenu')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
          >
            <ToggleIcon size={16} />
          </button>
        )}
      </div>

      {/* Links */}
      <nav className={clsx('flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden py-3', collapsed ? 'px-2' : 'px-3')}>
        {items.map((item) => (
          <NavLink key={item.key} to={item.path} onClick={onNavigate} className="group relative block">
            {({ isActive }) => (
              <motion.div
                whileHover={collapsed ? undefined : { x: isRTL ? -4 : 4 }}
                className={clsx(
                  'relative flex rounded-lg transition-colors',
                  collapsed ? 'flex-col items-center gap-0.5 px-1 py-2' : 'items-center gap-3 px-3 py-2.5',
                  isActive ? 'bg-white/10 ring-1 ring-white/15' : 'hover:bg-white/5',
                )}
              >
                {isActive && (
                  <span
                    className={clsx(
                      'absolute inset-y-2 w-1 rounded-full bg-gradient-to-b from-gold-light to-gold',
                      collapsed ? '-start-2' : 'start-0',
                    )}
                  />
                )}
                <item.icon size={20} style={{ color: isActive ? '#FFFFFF' : item.color }} className="shrink-0" />
                <span
                  className={clsx(
                    'truncate font-semibold',
                    collapsed ? 'w-full text-center text-[9.5px] leading-tight' : 'text-sm',
                    isActive ? 'text-white' : collapsed ? 'text-white/55 group-hover:text-white/85' : 'text-white/75',
                  )}
                >
                  {t(item.labelKey)}
                </span>
                {/* collapsed: name tooltip */}
                {collapsed && (
                  <span className="pointer-events-none absolute start-full top-1/2 z-50 ms-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#0B1324] px-2.5 py-1.5 text-xs font-semibold text-white shadow-wood-lg ring-1 ring-white/10 group-hover:block">
                    {t(item.labelKey)}
                  </span>
                )}
              </motion.div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Shortcuts + user + logout */}
      <div className={clsx('space-y-1.5 border-t border-white/10', collapsed ? 'p-2' : 'p-3')}>
        {onShowShortcuts && (
          <button
            type="button"
            onClick={onShowShortcuts}
            title={`${t('keyboardShortcuts')} (F1)`}
            className={clsx(
              'flex w-full items-center rounded-lg text-white/65 transition hover:bg-white/10 hover:text-white',
              collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2',
            )}
          >
            <Keyboard size={19} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="text-sm font-medium">{t('keyboardShortcuts')}</span>
                <span className="kbd-dark ms-auto">F1</span>
              </>
            )}
          </button>
        )}
        {!collapsed && (
          <div className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-shine text-xs font-bold text-white">
              {initials(currentUser?.fullName ?? 'U')}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">{currentUser?.fullName}</p>
              <p className="truncate text-[10px] text-white/55">{currentUser?.role}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          title={t('logout')}
          className={clsx(
            'flex w-full items-center rounded-lg text-white/80 transition hover:bg-terracotta/20',
            collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2.5',
          )}
        >
          <LogOut size={19} className="shrink-0 text-terracotta" />
          {!collapsed && <span className="text-sm font-medium">{t('logout')}</span>}
        </button>
      </div>
    </div>
  )
}

/**
 * `pointerEvents` has to be turned off by the *exit variant*, not by a
 * `style={{ pointerEvents: open ? … }}` prop: AnimatePresence renders a frozen
 * snapshot while animating out, so a prop-driven style would leave the backdrop
 * clickable during the exit and swallow the next press on the menu button.
 */
const backdropVariants: Variants = {
  initial: { opacity: 0, pointerEvents: 'none' },
  animate: { opacity: 1, pointerEvents: 'auto', transition: { duration: 0.25 } },
  exit: { opacity: 0, pointerEvents: 'none', transition: { duration: 0.2 } },
}

interface SidebarProps {
  open: boolean
  onClose: () => void
  onShowShortcuts?: () => void
}

/** Phone / tablet drawer — slides over the page from the header menu button. */
export const Sidebar = ({ open, onClose, onShowShortcuts }: SidebarProps) => {
  const { t, isRTL } = useTranslation()
  // Park the panel off-screen on whichever side the current language reads from.
  const hiddenX = isRTL ? '100%' : '-100%'

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sidebar-backdrop"
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 z-40 bg-[#0B1324]/55 backdrop-blur-[2px] lg:hidden"
            aria-hidden="true"
          />
          <motion.aside
            key="sidebar-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t('navigation')}
            initial={{ x: hiddenX, pointerEvents: 'none' }}
            animate={{ x: 0, pointerEvents: 'auto', transition: { type: 'spring', damping: 30, stiffness: 300, mass: 0.8 } }}
            exit={{ x: hiddenX, pointerEvents: 'none', transition: { duration: 0.22, ease: 'easeIn' } }}
            /* `!fixed`: `.wood-grain` sets `position: relative`, which would
               otherwise drop the drawer back into the flex row. */
            className="wood-grain !fixed inset-y-0 start-0 z-50 w-[300px] max-w-[86vw] bg-wood-sidebar shadow-wood-lg lg:hidden"
          >
            <SidebarNav isDrawer onNavigate={onClose} onToggle={onClose} onShowShortcuts={onShowShortcuts} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
