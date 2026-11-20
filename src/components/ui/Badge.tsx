import type { ReactNode } from 'react'
import { clsx } from '@/utils/clsx'

type Tone = 'paid' | 'partial' | 'unpaid' | 'neutral' | 'gold' | 'info' | 'sage'

const tones: Record<Tone, string> = {
  paid: 'bg-sage/10 text-[#067647] border-sage/25',
  partial: 'bg-gold/15 text-[#B45309] border-gold/30',
  unpaid: 'bg-terracotta/10 text-[#B42318] border-terracotta/25',
  neutral: 'bg-wood-cream text-wood-medium border-woodborder',
  gold: 'bg-gold-shine text-wood-dark border-gold/40',
  info: 'bg-wood-warm/10 text-wood-warm border-wood-warm/20',
  sage: 'bg-sage/10 text-[#067647] border-sage/25',
}

export const Badge = ({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) => (
  <span
    className={clsx(
      'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold',
      tones[tone],
      className,
    )}
  >
    {children}
  </span>
)

export const statusTone = (status: 'paid' | 'partial' | 'unpaid'): Tone => status
