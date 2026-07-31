import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, Sparkles, X } from 'lucide-react'
import { NAV_ITEMS } from './navConfig'
import { useTranslation } from '@/i18n/useTranslation'
import { useAuthStore } from '@/store/useAuthStore'
import { initials, moduleEnabled } from '@/utils/helpers'
import { clsx } from '@/utils/clsx'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

/**
 * `pointerEvents` has to be turned off by the *exit variant*, not by a
 * `style={{ pointerEvents: open ? … }}` prop.
 *
 * AnimatePresence keeps rendering a snapshot of the subtree while it animates
 * out, and in that snapshot `open` is frozen at `true` — so a prop-driven style
 * never updates during the close animation. The backdrop would stay clickable
 * for the whole ~200ms exit and swallow the very next press on the menu button,
 * which is what made the sidebar feel like it refused to reopen. Variants are
 * applied to the exiting node itself, so they do take effect.
 */
const backdropVariants: Variants = {
  initial: { opacity: 0, pointerEvents: 'none' },
  animate: { opacity: 1, pointerEvents: 'auto', transition: { duration: 0.25 } },
  exit: { opacity: 0, pointerEvents: 'none', transition: { duration: 0.2 } },
}

/**
 * Navigation drawer — hidden by default, slides over the page from the menu
 * button in the header. The panel exits toward the top-left corner in LTR,
 * right across the menu button, so it disables its own pointer events on the
 * way out for the same reason the backdrop does.
 */
export const Sidebar = ({ open, onClose }: SidebarProps) => {
  const { t, isRTL } = useTranslation()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.currentUser)
  const logout = useAuthStore((s) => s.logout)

  const items = NAV_ITEMS.filter((item) => moduleEnabled(currentUser?.permissions, item.key))

  const handleLogout = async () => {
    onClose()
    await logout()
    navigate('/login')
  }

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
            className="fixed inset-0 z-40 bg-wood-dark/50 backdrop-blur-sm"
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
            /* `!fixed` is deliberate: `.wood-grain` sets `position: relative`,
               which otherwise beats Tailwind's `fixed` and drops the drawer
               back into the flex row — pushing the page (and the menu button
               that opens it) sideways instead of overlaying them. */
            className="wood-grain !fixed inset-y-0 start-0 z-50 flex w-[288px] max-w-[85vw] flex-col bg-wood-sidebar shadow-wood-lg"
          >
            {/* Brand + close */}
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-shine bg-[length:200%_200%] text-white shadow-rose animate-gradient-shift">
                <Sparkles size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-display truncate text-lg font-bold leading-tight text-white">
                  {t('appName')}
                </h1>
                <p className="mt-0.5 truncate text-[10px] text-wood-blonde/80">Beauté &amp; Cosmétiques</p>
              </div>
              <motion.button
                type="button"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={onClose}
                aria-label={t('closeMenu')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-wood-cream transition hover:bg-white/20 hover:text-white"
              >
                <X size={16} />
              </motion.button>
            </div>

            {/* Nav — every entry closes the drawer, including a tap on the page
                already being viewed (which fires no route change of its own). */}
            <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-3">
              {items.map((item, i) => (
                <NavLink key={item.key} to={item.path} onClick={onClose}>
                  {({ isActive }) => (
                    <motion.div
                      initial={{ opacity: 0, x: isRTL ? 16 : -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.04 + i * 0.025, duration: 0.25 }}
                      whileHover={{ x: isRTL ? -6 : 6 }}
                      className={clsx(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                        isActive
                          ? 'bg-white/15 shadow-wood-inset ring-1 ring-white/20 backdrop-blur-sm'
                          : 'hover:bg-white/10',
                      )}
                    >
                      {isActive && (
                        <span className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-gradient-to-b from-wood-light to-pink-300" />
                      )}
                      <item.icon size={20} style={{ color: item.color }} className="shrink-0" />
                      <span
                        className={clsx(
                          'truncate text-sm font-medium',
                          isActive ? 'text-white' : 'text-wood-cream/90',
                        )}
                      >
                        {t(item.labelKey)}
                      </span>
                      {isActive && <span className="ms-auto h-2 w-2 rounded-full bg-gold-light" />}
                    </motion.div>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* User + logout */}
            <div className="border-t border-white/10 p-3">
              <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wood-btn text-xs font-bold text-white">
                  {initials(currentUser?.fullName ?? 'U')}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white">{currentUser?.fullName}</p>
                  <p className="truncate text-[10px] text-wood-cream/70">{currentUser?.role}</p>
                </div>
              </div>
              <motion.button
                type="button"
                whileHover={{ x: isRTL ? -6 : 6 }}
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-wood-cream/90 transition hover:bg-terracotta/30"
              >
                <LogOut size={20} className="shrink-0 text-terracotta" />
                <span className="text-sm font-medium">{t('logout')}</span>
              </motion.button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
