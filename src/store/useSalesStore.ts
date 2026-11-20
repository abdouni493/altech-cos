import { create } from 'zustand'
import type { Sale, Payment } from '@/types'
import { uid, round2 } from '@/utils/helpers'
import { useProductStore } from './useProductStore'
import { useProductionStore } from './useProductionStore'

interface SalesState {
  sales: Sale[]
  addSale: (data: Omit<Sale, 'id' | 'reference' | 'createdAt'>) => Sale
  updateSale: (id: string, data: Partial<Sale>) => void
  /** Deletes a sale and puts everything it sold back on the shelf. */
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
      return sale
    },
    updateSale: (id, data) => {
      set((s) => ({ sales: s.sales.map((p) => (p.id === id ? { ...p, ...data } : p)) }))
    },
    deleteSale: (id) => {
      const sale = get().sales.find((s) => s.id === id)
      if (sale) {
        const { restoreRetail, restoreComponent } = useProductStore.getState()
        const { addSoldUnits } = useProductionStore.getState()
        sale.lines.forEach((l) => {
          if (l.kind === 'retail') restoreRetail(l.productId, l.quantity)
          else if (l.kind === 'production') {
            if (l.productionId) addSoldUnits(l.productionId, -l.quantity)
          } else if (l.productId) restoreComponent(l.productId, l.quantity)
        })
      }
      set((s) => ({ sales: s.sales.filter((p) => p.id !== id) }))
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
    },
  }),
)
