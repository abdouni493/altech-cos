import type { ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { clsx } from '@/utils/clsx'

type Variant = 'primary' | 'gold' | 'ghost' | 'danger' | 'outline' | 'sage'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref' | 'children'> {
  children?: ReactNode
  variant?: Variant
  size?: Size
  /** Keyboard shortcut shown inside the button, e.g. "F9". */
  kbd?: string
}

const variants: Record<Variant, string> = {
  primary:
    'btn-shine bg-wood-btn text-white shadow-rose ring-1 ring-inset ring-white/10 hover:brightness-110',
  gold: 'btn-shine bg-gold-shine text-wood-dark font-semibold shadow-gold hover:brightness-105',
  ghost: 'bg-transparent text-wood-medium hover:bg-wood-cream hover:text-wood-dark',
  danger: 'btn-shine bg-terracotta text-white shadow-[0_6px_16px_-6px_rgba(240,68,56,0.6)] hover:brightness-110',
  outline:
    'bg-white text-wood-dark border border-[#D5DBE8] shadow-wood hover:border-wood-warm/50 hover:text-wood-warm',
  sage: 'btn-shine bg-sage text-white shadow-[0_6px_16px_-6px_rgba(18,183,106,0.6)] hover:brightness-110',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
  icon: 'h-10 w-10',
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  kbd,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) => (
  <motion.button
    whileHover={disabled ? undefined : { y: -1 }}
    whileTap={disabled ? undefined : { scale: 0.96, y: 0 }}
    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    disabled={disabled}
    className={clsx(
      'inline-flex shrink-0 select-none items-center justify-center rounded-lg font-semibold transition-[filter,box-shadow,border-color,color,background-color] outline-none focus-visible:ring-4 focus-visible:ring-wood-warm/25 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none',
      variants[variant],
      sizes[size],
      className,
    )}
    {...props}
  >
    {children}
    {kbd && (
      <span
        className={clsx(
          'hidden sm:inline-flex',
          variant === 'outline' || variant === 'ghost' || variant === 'gold' ? 'kbd' : 'kbd-dark',
        )}
      >
        {kbd}
      </span>
    )}
  </motion.button>
)
