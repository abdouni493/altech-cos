import type { Variants } from 'framer-motion'

export const pageVariants: Variants = {
  // No `filter` here: a filtered ancestor traps the `position: fixed` modals of the page.
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
}

export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 24 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 30, stiffness: 380 } },
  exit: { opacity: 0, scale: 0.97, y: 16, transition: { duration: 0.15 } },
}

export const overlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
}

export const cardVariants: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(i ?? 0, 12) * 0.035, duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  }),
}

export const sidebarItemVariants: Variants = {
  rest: { x: 0 },
  hover: { x: 6, transition: { duration: 0.2 } },
}

export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06 } },
}

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}

export const rowVariants: Variants = {
  initial: { opacity: 0, x: -12 },
  animate: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: (i ?? 0) * 0.035, duration: 0.3 },
  }),
}
