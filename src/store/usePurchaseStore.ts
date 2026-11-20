import { create } from 'zustand'
import type { Purchase, Payment, PurchaseLine } from '@/types'
import { uid, round2 } from '@/utils/helpers'
import { useProductStore } from './useProductStore'

interface PurchaseState {
  purchases: Purchase[]
  addPurchase: (data: Omit<Purchase, 'id' | 'reference' | 'createdAt'>) => Purchase
  /** Edits a purchase; quantity changes are carried over to the stock. */
  updatePurchase: (id: string, data: Partial<Purchase>) => void
  /** Deletes a purchase and takes its quantities back out of the stock. */
  deletePurchase: (id: string) => void
  addPayment: (purchaseId: string, amount: number, date: string, note?: string) => void
}

const nextRef = (purchases: Purchase[]): string => {
  const year = new Date().getFullYear()
  const n = purchases.length + 1
  return `ACH-${year}-${String(n).padStart(3, '0')}`
}

/** Quantity received per product. */
const receivedByProduct = (lines: PurchaseLine[]) => {
  const map = new Map<string, number>()
  lines.forEach((l) => l.productId && map.set(l.productId, (map.get(l.productId) ?? 0) + l.quantity))
  return map
}

/** Applies `after − before` to the stock of every product of the purchase. */
const shiftStock = (before: PurchaseLine[], after: PurchaseLine[]) => {
  const old = receivedByProduct(before)
  const next = receivedByProduct(after)
  const { restoreComponent, reduceStock } = useProductStore.getState()
  new Set([...old.keys(), ...next.keys()]).forEach((productId) => {
    const delta = (next.get(productId) ?? 0) - (old.get(productId) ?? 0)
    if (delta > 0) restoreComponent(productId, delta)
    else if (delta < 0) reduceStock(productId, -delta)
  })
}

export const usePurchaseStore = create<PurchaseState>()(
  (set, get) => ({
    purchases: [],
    addPurchase: (data) => {
      const purchase: Purchase = {
        ...data,
        id: uid('pu'),
        reference: nextRef(get().purchases),
        createdAt: new Date().toISOString(),
      }
      set((s) => ({ purchases: [purchase, ...s.purchases] }))
      return purchase
    },
    updatePurchase: (id, data) => {
      const before = get().purchases.find((p) => p.id === id)
      if (before && data.lines) shiftStock(before.lines, data.lines)
      set((s) => ({
        purchases: s.purchases.map((p) => (p.id === id ? { ...p, ...data } : p)),
      }))
    },
    deletePurchase: (id) => {
      const target = get().purchases.find((p) => p.id === id)
      if (target) shiftStock(target.lines, [])
      set((s) => ({ purchases: s.purchases.filter((p) => p.id !== id) }))
    },
    addPayment: (purchaseId, amount, date, note) => {
      const payment: Payment = { id: uid('pay'), amount, date, note }
      set((s) => ({
        purchases: s.purchases.map((p) =>
          p.id === purchaseId
            ? { ...p, paid: round2(p.paid + amount), payments: [...p.payments, payment] }
            : p,
        ),
      }))
    },
  }),
)
