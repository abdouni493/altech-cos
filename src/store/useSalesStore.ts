import { create } from 'zustand'
import type { Sale, Payment } from '@/types'
import { uid, round2 } from '@/utils/helpers'
import { remote } from '@/lib/cloud'

interface SalesState {
  sales: Sale[]
  addSale: (data: Omit<Sale, 'id' | 'reference' | 'createdAt'>) => Sale
  updateSale: (id: string, data: Partial<Sale>) => void
  deleteSale: (id: string) => void
  addPayment: (saleId: string, amount: number, date: string, note?: string) => void
}

const nextRef = (sales: Sale[]): string => {
  const year = new Date().getFullYear()
  const n = sales.length + 1
  return `VTE-${year}-${String(n).padStart(3, '0')}`
}

export const useSalesStore = create<SalesState>()(
  (set, get) => ({
    sales: [],
    addSale: (data) => {
      const sale: Sale = {
        ...data,
        id: uid('sa'),
        reference: nextRef(get().sales),
        createdAt: new Date().toISOString(),
      }
      set((s) => ({ sales: [sale, ...s.sales] }))
      // create_sale() also decrements the stock of every line, server-side.
      remote.sales.create(sale)
      return sale
    },
    updateSale: (id, data) => {
      set((s) => ({ sales: s.sales.map((p) => (p.id === id ? { ...p, ...data } : p)) }))
      const updated = get().sales.find((s) => s.id === id)
      if (updated) remote.sales.update(updated)
    },
    deleteSale: (id) => {
      set((s) => ({ sales: s.sales.filter((p) => p.id !== id) }))
      remote.sales.remove(id)
    },
    addPayment: (saleId, amount, date, note) => {
      const payment: Payment = { id: uid('pay'), amount, date, note }
      set((s) => ({
        sales: s.sales.map((sale) =>
          sale.id === saleId
            ? { ...sale, paid: round2(sale.paid + amount), payments: [...sale.payments, payment] }
            : sale,
        ),
      }))
      remote.sales.addPayment(saleId, payment)
    },
  }),
)
