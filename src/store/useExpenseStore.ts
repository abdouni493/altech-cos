import { create } from 'zustand'
import type { Expense } from '@/types'
import { uid } from '@/utils/helpers'
import { remote } from '@/lib/cloud'

interface ExpenseState {
  expenses: Expense[]
  addExpense: (data: Omit<Expense, 'id' | 'createdAt'>) => Expense
  updateExpense: (id: string, data: Partial<Expense>) => void
  deleteExpense: (id: string) => void
}

export const useExpenseStore = create<ExpenseState>()(
  (set, get) => ({
    expenses: [],
    addExpense: (data) => {
      const expense: Expense = { ...data, id: uid('e'), createdAt: new Date().toISOString() }
      set((s) => ({ expenses: [expense, ...s.expenses] }))
      remote.expenses.save(expense)
      return expense
    },
    updateExpense: (id, data) => {
      set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...data } : e)) }))
      const updated = get().expenses.find((e) => e.id === id)
      if (updated) remote.expenses.save(updated)
    },
    deleteExpense: (id) => {
      set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }))
      remote.expenses.remove(id)
    },
  }),
)
