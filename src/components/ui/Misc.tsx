import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Search, PackageOpen } from 'lucide-react'
import { fadeUp } from '@/utils/animations'
import { clsx } from '@/utils/clsx'

export const PageHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) => (
  <motion.div
    variants={fadeUp}
    initial="initial"
    animate="animate"
    className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6"
  >
    <div className="flex min-w-0 items-center gap-3">
      <span className="hidden h-9 w-1.5 shrink-0 rounded-full bg-wood-header sm:block" />
      <div className="min-w-0">
        <h1 className="text-display truncate text-xl font-bold text-wood-dark sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-sm text-wood-medium">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </motion.div>
)

export const SearchInput = ({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) => (
  <div className={clsx('relative', className)}>
    <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-wood-medium/60" size={17} />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="input-wood ps-10"
    />
  </div>
)

export const EmptyState = ({
  title,
  hint,
  action,
  icon,
}: {
  title: string
  hint?: string
  action?: ReactNode
  icon?: ReactNode
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#D5DBE8] bg-white/60 px-6 py-14 text-center"
  >
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-wood-warm/10 text-wood-warm">
      {icon ?? <PackageOpen size={34} />}
    </div>
    <h3 className="text-display text-lg font-bold text-wood-dark">{title}</h3>
    {hint && <p className="max-w-sm text-sm text-wood-medium">{hint}</p>}
    {action && <div className="mt-2">{action}</div>}
  </motion.div>
)

export const ViewToggle = ({
  view,
  onChange,
  labels,
}: {
  view: 'cards' | 'table'
  onChange: (v: 'cards' | 'table') => void
  labels: { cards: string; table: string }
}) => (
  <div className="segmented">
    {(['cards', 'table'] as const).map((v) => (
      <button
        key={v}
        onClick={() => onChange(v)}
        className={clsx(
          'rounded-md px-3 py-1.5 text-xs font-semibold transition',
          view === v ? 'bg-white text-wood-warm shadow-wood' : 'text-wood-medium hover:text-wood-dark',
        )}
      >
        {labels[v]}
      </button>
    ))}
  </div>
)

export const ProgressBar = ({ value, max, danger }: { value: number; max: number; danger?: boolean }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-wood-cream">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={clsx(
          'h-full rounded-full',
          danger ? 'bg-gradient-to-r from-gold to-terracotta' : 'bg-gradient-to-r from-wood-warm to-aqua',
        )}
      />
    </div>
  )
}
