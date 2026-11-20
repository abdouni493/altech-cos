import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar, SidebarNav } from './Sidebar'
import { Header } from './Header'
import { NAV_ITEMS } from './navConfig'
import { ShortcutsHelp } from './ShortcutsHelp'
import { useAuthStore } from '@/store/useAuthStore'
import { moduleEnabled } from '@/utils/helpers'
import { pageVariants } from '@/utils/animations'

/** Is the user typing in a field? (single-key shortcuts must not fire then) */
export const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

const COLLAPSED_KEY = 'altech-sidebar-collapsed'
const DESKTOP_QUERY = '(min-width: 1024px)'

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Desktop: the full sidebar is always on screen — expanded by default; the
 * menu button (or Alt+M) collapses it to an icon rail and the choice is kept.
 * Phone / tablet: the same navigation in a drawer opened from the header.
 */
export const Layout = () => {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.currentUser)
  const items = NAV_ITEMS.filter((item) => moduleEnabled(currentUser?.permissions, item.key))

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* private mode — the sidebar simply opens expanded next time */
    }
  }, [collapsed])

  // Menu button / Alt+M: collapse the desktop sidebar, or open the phone drawer.
  // Functional updaters — the handler is stable and never toggles from a stale value.
  const toggleSidebar = useCallback(() => {
    if (window.matchMedia(DESKTOP_QUERY).matches) setCollapsed((v) => !v)
    else setDrawerOpen((v) => !v)
  }, [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Any navigation closes the phone drawer, whatever triggered it.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false)
        return
      }
      if (e.key === 'F1' || (e.key === '?' && !isTypingTarget(e.target))) {
        e.preventDefault()
        setHelpOpen((v) => !v)
        return
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toUpperCase()
        if (key === 'M') {
          e.preventDefault()
          toggleSidebar()
          return
        }
        const target = items.find((i) => i.hotkey === key || i.hotkey === e.code.replace(/^(Digit|Key)/, ''))
        if (target) {
          e.preventDefault()
          navigate(target.path)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen, items, navigate, toggleSidebar])

  const showShortcuts = useCallback(() => setHelpOpen(true), [])

  return (
    <div className="flex h-screen overflow-hidden bg-wood-bg">
      {/* Desktop sidebar — always on screen, expanded by default */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 80 : 264 }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="wood-grain relative z-30 hidden shrink-0 bg-wood-sidebar lg:block"
      >
        <SidebarNav collapsed={collapsed} onToggle={toggleSidebar} onShowShortcuts={showShortcuts} />
      </motion.aside>

      {/* Phone / tablet drawer */}
      <Sidebar open={drawerOpen} onClose={closeDrawer} onShowShortcuts={showShortcuts} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          sidebarOpen={isDesktop ? !collapsed : drawerOpen}
          onToggleSidebar={toggleSidebar}
          onShowShortcuts={showShortcuts}
        />
        <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5 xl:px-7">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="mx-auto max-w-[1600px]"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
