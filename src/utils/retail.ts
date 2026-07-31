import type { Product } from '@/types'
import { round2 } from './helpers'

/**
 * Retail ("vente au détail") maths.
 *
 * A divisible product is stocked as containers — a 100 ml perfume bottle — but
 * sold by portions of that content. Two numbers describe the stock:
 *
 *   `quantity`      sealed containers still closed
 *   `openRemaining` content left inside the container opened at the counter
 *
 * Everything below works on the TOTAL content (`quantity × capacity +
 * openRemaining`) and re-splits it afterwards, so a sale of 250 ml out of two
 * 100 ml bottles + one open at 90 ml resolves by itself.
 */

/** Content is stored with 3 decimals, like the `numeric(12,3)` columns. */
const round3 = (value: number): number => Math.round((value + Number.EPSILON) * 1000) / 1000

/** Is this product configured for retail selling? */
export const isDivisible = (p: Product): boolean => !!p.isDivisible && (p.capacity ?? 0) > 0

/** Content of one container (0 when the product is not divisible). */
export const capacityOf = (p: Product): number => (isDivisible(p) ? (p.capacity ?? 0) : 0)

/** Total content available, all containers included. */
export const totalContent = (p: Product): number =>
  isDivisible(p) ? round3(p.quantity * capacityOf(p) + (p.openRemaining ?? 0)) : 0

/** Price of ONE unit of content (per ml / per g). */
export const contentUnitPrice = (p: Product): number => {
  const step = p.retailStep ?? 0
  if (step <= 0) return 0
  return round2((p.retailPrice ?? 0) / step)
}

/** Purchase cost of ONE unit of content — used for exact retail margins. */
export const contentUnitCost = (p: Product): number => {
  const cap = capacityOf(p)
  if (cap <= 0) return 0
  return round2(p.purchasePrice / cap)
}

/** Amount charged for `amount` units of content. */
export const retailAmount = (p: Product, amount: number): number =>
  round2(amount * contentUnitPrice(p))

/** Re-split a total content into sealed containers + opened container. */
const split = (total: number, capacity: number): { quantity: number; openRemaining: number } => {
  if (capacity <= 0) return { quantity: 0, openRemaining: 0 }
  const safe = Math.max(0, round3(total))
  let quantity = Math.floor(safe / capacity)
  let open = round3(safe - quantity * capacity)
  // Rounding can leave a container that is in fact full labelled as "opened".
  if (open >= capacity) {
    quantity += 1
    open = round3(open - capacity)
  }
  return { quantity, openRemaining: Math.max(0, open) }
}

/** Stock after selling / consuming `amount` units of content. */
export const consumeContent = (
  p: Product,
  amount: number,
): { quantity: number; openRemaining: number } =>
  split(totalContent(p) - Math.max(0, amount), capacityOf(p))

/** Stock after giving `amount` units of content back (sale cancelled, recovery). */
export const restoreContent = (
  p: Product,
  amount: number,
): { quantity: number; openRemaining: number } =>
  split(totalContent(p) + Math.max(0, amount), capacityOf(p))

/** "2 × 100 ml + 45 ml" — how the shelf actually looks. */
export const contentLabel = (p: Product): string => {
  if (!isDivisible(p)) return `${p.quantity}`
  const unit = p.unit ?? ''
  const open = round2(p.openRemaining ?? 0)
  const sealed = `${p.quantity} × ${capacityOf(p)} ${unit}`.trim()
  return open > 0 ? `${sealed} + ${open} ${unit}`.trim() : sealed
}

/** Cost of one whole unit, or of one content unit for a `byContent` usage. */
export const componentUnitCost = (p: Product, byContent: boolean): number =>
  byContent && isDivisible(p) ? contentUnitCost(p) : round2(p.purchasePrice)

/** How much of `p` a recipe can still draw from — content or whole units. */
export const componentAvailable = (p: Product, byContent: boolean): number =>
  byContent && isDivisible(p) ? totalContent(p) : p.quantity
