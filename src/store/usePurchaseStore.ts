import { create } from 'zustand'
import type { Purchase, Payment } from '@/types'
import { uid, round2 } from '@/utils/helpers'
import { remote } from '@/lib/cloud'

interface PurchaseState {
  purchases: Purchase[]
  addPurchase: (data: Omit<Purchase, 'id' | 'reference' | 'createdAt'>) => Purchase
  updatePurchase: (id: string, data: Partial<Purchase>) => void
  deletePurchase: (id: string) => void
  addPayment: (purchaseId: string, amount: number, date: string, note?: string) => void
}

const nextRef = (purchases: Purchase[]): string => {
  const year = new Date().getFullYear()
  const n = purchases.length + 1
  return `ACH-${year}-${String(n).padStart(3, '0')}`
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
      // create_purchase() also refreshes the products (stock, prices, min qty,
      // expiration) exactly like receiveStock() does locally.
      remote.purchases.create(purchase)
      return purchase
    },
    updatePurchase: (id, data) => {
      set((s) => ({
        purchases: s.purchases.map((p) => (p.id === id ? { ...p, ...data } : p)),
      }))
      const updated = get().purchases.find((p) => p.id === id)
      if (updated) remote.purchases.update(updated)
    },
    deletePurchase: (id) => {
      set((s) => ({ purchases: s.purchases.filter((p) => p.id !== id) }))
      remote.purchases.remove(id)
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
      remote.purchases.addPayment(purchaseId, payment)
    },
  }),
)
