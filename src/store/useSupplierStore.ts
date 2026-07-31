import { create } from 'zustand'
import type { Supplier } from '@/types'
import { uid } from '@/utils/helpers'
import { remote } from '@/lib/cloud'

interface SupplierState {
  suppliers: Supplier[]
  addSupplier: (data: Omit<Supplier, 'id' | 'createdAt'>) => Supplier
  updateSupplier: (id: string, data: Partial<Supplier>) => void
  deleteSupplier: (id: string) => void
}

export const useSupplierStore = create<SupplierState>()(
  (set, get) => ({
    suppliers: [],
    addSupplier: (data) => {
      const supplier: Supplier = { ...data, id: uid('s'), createdAt: new Date().toISOString() }
      set((s) => ({ suppliers: [supplier, ...s.suppliers] }))
      remote.suppliers.save(supplier)
      return supplier
    },
    updateSupplier: (id, data) => {
      set((s) => ({ suppliers: s.suppliers.map((c) => (c.id === id ? { ...c, ...data } : c)) }))
      const updated = get().suppliers.find((s) => s.id === id)
      if (updated) remote.suppliers.save(updated)
    },
    deleteSupplier: (id) => {
      set((s) => ({ suppliers: s.suppliers.filter((c) => c.id !== id) }))
      remote.suppliers.remove(id)
    },
  }),
)
