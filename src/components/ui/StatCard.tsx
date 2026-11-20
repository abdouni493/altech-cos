import { type ReactNode, useEffect, useState } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'
import { cardVariants } from '@/utils/animations'
import { clsx } from '@/utils/clsx'

interface StatCardProps {
  icon: ReactNode
  label: string
  value: number
  index?: number
  suffix?: string
  decimals?: boolean
  accent?: string
  hint?: ReactNode
}

const AnimatedNumber = ({ value, decimals }: { value: number; decimals?: boolean }) => {
  const mv = useMotionValue(0)
  const [display, setDisplay] = useState('0')

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 1.1,
      ease: 'easeOut',
      onUpdate: (v) => {
        setDisplay(
          decimals
            ? v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : Math.round(v).toLocaleString('fr-FR'),
        )
      },
    })
    return controls.stop
  }, [value, decimals, mv])

  return <span>{display}</span>
}

export const StatCard = ({
  icon,
  label,
  value,
  index = 0,
  suffix,
  decimals,
  accent = 'from-wood-warm to-aqua',
  hint,
}: StatCardProps) => (
  <motion.div
    variants={cardVariants}
    initial="initial"
    animate="animate"
    custom={index}
    whileHover={{ y: -3 }}
    className="card-wood card-hover relative overflow-hidden rounded-xl p-4 sm:p-5"
  >
    <div className={clsx('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r', accent)} />
    <div className="flex items-start justify-between gap-3">
      <p className="text-[13px] font-semibold text-wood-medium">{label}</p>
      <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-wood', accent)}>
        {icon}
      </div>
    </div>
    <p className="text-mono mt-2 text-xl font-bold tracking-tight text-wood-dark sm:text-2xl">
      <AnimatedNumber value={value} decimals={decimals} />
      {suffix && <span className="ml-1 text-base font-medium text-wood-medium">{suffix}</span>}
    </p>
    {hint && <div className="mt-1 text-xs text-wood-medium/70">{hint}</div>}
  </motion.div>
)
