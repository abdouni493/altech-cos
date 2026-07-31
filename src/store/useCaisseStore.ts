import { create } from 'zustand'
import type { CaisseTransaction } from '@/types'
import { uid } from '@/utils/helpers'
import { remote } from '@/lib/cloud'

interface CaisseState {
  transactions: CaisseTransaction[]
  addTransaction: (data: Omit<CaisseTransaction, 'id' | 'createdAt'>) => CaisseTransaction
  updateTransaction: (id: string, data: Partial<CaisseTransaction>) => void
  deleteTransaction: (id: string) => void
}

export const useCaisseStore = create<CaisseState>()(
  (set, get) => ({
    transactions: [],
    addTransaction: (data) => {
      const tx: CaisseTransaction = { ...data, id: uid('cx'), createdAt: new Date().toISOString() }
      set((s) => ({ transactions: [tx, ...s.transactions] }))
      remote.caisse.save(tx)
      return tx
    },
    updateTransaction: (id, data) => {
      set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...data } : t)) }))
      const updated = get().transactions.find((t) => t.id === id)
      if (updated) remote.caisse.save(updated)
    },
    deleteTransaction: (id) => {
      set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }))
      remote.caisse.remove(id)
    },
  }),
)
