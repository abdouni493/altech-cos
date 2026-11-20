import { type ReactNode, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { modalVariants, overlayVariants } from '@/utils/animations'
import { clsx } from '@/utils/clsx'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  /** Small icon shown in the header tile. */
  icon?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

const sizes = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
  full: 'sm:max-w-7xl',
}

/**
 * Dialog — a bottom sheet on phones, a centred card on larger screens.
 * Escape closes it; the top accent bar carries the brand gradient.
 */
export const Modal = ({ open, onClose, title, subtitle, icon, children, footer, size = 'md' }: ModalProps) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#0B1324]/55 backdrop-blur-[3px] sm:items-center sm:p-4"
          onMouseDown={onClose}
        >
          <motion.div
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
            className={clsx(
              'relative w-full overflow-hidden rounded-t-2xl border border-woodborder bg-white shadow-wood-lg sm:my-auto sm:rounded-2xl',
              sizes[size],
            )}
          >
            <div className="h-1 w-full bg-wood-header" />
            {(title || subtitle) && (
              <div className="flex items-start justify-between gap-4 border-b border-woodborder px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  {icon && (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-wood-warm/10 text-wood-warm">
                      {icon}
                    </div>
                  )}
                  <div className="min-w-0">
                    {title && <h3 className="text-display truncate text-lg font-bold leading-tight text-wood-dark">{title}</h3>}
                    {subtitle && <p className="mt-0.5 text-sm text-wood-medium">{subtitle}</p>}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Fermer"
                  title="Échap"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-wood-medium transition hover:bg-terracotta/10 hover:text-terracotta"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="max-h-[72vh] overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-woodborder bg-[#F8FAFD] px-5 py-3.5 sm:px-6">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
