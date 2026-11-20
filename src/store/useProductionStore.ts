import { create } from 'zustand'
import type { Production, RecipeLine, TechSheet } from '@/types'
import { uid, round2 } from '@/utils/helpers'
import { useProductStore } from './useProductStore'

interface ProductionState {
  sheets: TechSheet[]
  productions: Production[]
  // -- Fiches techniques (recipes) — never touch the stock ------------------
  addSheet: (data: Omit<TechSheet, 'id' | 'createdAt'>) => TechSheet
  updateSheet: (id: string, data: Partial<TechSheet>) => void
  deleteSheet: (id: string) => void
  // -- Productions (real batches) — these DO move the stock -----------------
  addProduction: (data: Omit<Production, 'id' | 'reference' | 'createdAt'>) => Production
  updateProduction: (id: string, data: Partial<Production>) => void
  deleteProduction: (id: string) => void
  /** Give every component of a batch back to the stock. */
  recoverProduction: (id: string) => void
  /** POS sold `qty` finished units out of a batch (negative when a sale is cancelled). */
  addSoldUnits: (id: string, qty: number) => void
}

const nextRef = (productions: Production[]): string => {
  const year = new Date().getFullYear()
  const n = productions.length + 1
  return `PRD-${year}-${String(n).padStart(3, '0')}`
}

/** Take every ingredient of a batch out of the stock. */
const consumeLines = (lines: RecipeLine[]) => {
  const { consumeComponent } = useProductStore.getState()
  lines.forEach((l) => consumeComponent(l.productId, l.quantity, l.byContent))
}

/** Put every ingredient of a batch back. */
const restoreLines = (lines: RecipeLine[]) => {
  const { restoreComponent } = useProductStore.getState()
  lines.forEach((l) => restoreComponent(l.productId, l.quantity, l.byContent))
}

export const useProductionStore = create<ProductionState>()(
  (set, get) => ({
    sheets: [],
    productions: [],

    addSheet: (data) => {
      const sheet: TechSheet = { ...data, id: uid('ft'), createdAt: new Date().toISOString() }
      set((s) => ({ sheets: [sheet, ...s.sheets] }))
      return sheet
    },
    updateSheet: (id, data) => {
      set((s) => ({ sheets: s.sheets.map((x) => (x.id === id ? { ...x, ...data } : x)) }))
    },
    deleteSheet: (id) => {
      set((s) => ({ sheets: s.sheets.filter((x) => x.id !== id) }))
    },

    addProduction: (data) => {
      const production: Production = {
        ...data,
        id: uid('pr'),
        reference: nextRef(get().productions),
        createdAt: new Date().toISOString(),
      }
      set((s) => ({ productions: [production, ...s.productions] }))
      consumeLines(production.lines)
      return production
    },

    updateProduction: (id, data) => {
      const before = get().productions.find((p) => p.id === id)
      if (!before) return
      const after = { ...before, ...data }
      // Re-align the stock: give the old recipe back, take the new one.
      if (before.status !== 'recovered') restoreLines(before.lines)
      if (after.status !== 'recovered') consumeLines(after.lines)
      set((s) => ({ productions: s.productions.map((p) => (p.id === id ? after : p)) }))
    },

    deleteProduction: (id) => {
      const target = get().productions.find((p) => p.id === id)
      if (target && target.status !== 'recovered') restoreLines(target.lines)
      set((s) => ({ productions: s.productions.filter((p) => p.id !== id) }))
    },

    recoverProduction: (id) => {
      const target = get().productions.find((p) => p.id === id)
      if (!target || target.status === 'recovered') return
      restoreLines(target.lines)
      set((s) => ({
        productions: s.productions.map((p) => (p.id === id ? { ...p, status: 'recovered' } : p)),
      }))
    },

    addSoldUnits: (id, qty) => {
      set((s) => ({
        productions: s.productions.map((p) =>
          p.id === id ? { ...p, soldQuantity: Math.max(0, round2(p.soldQuantity + qty)) } : p,
        ),
      }))
    },
  }),
)
