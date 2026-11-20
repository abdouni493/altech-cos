import { create } from 'zustand'
import type {
  Worker,
  WorkerAdvance,
  WorkerAbsence,
  WorkerPayment,
  Permissions,
} from '@/types'
import { uid } from '@/utils/helpers'
import { useAuthStore } from './useAuthStore'

interface WorkerState {
  workers: Worker[]
  roles: string[]
  addWorker: (data: Omit<Worker, 'id' | 'createdAt' | 'advances' | 'absences' | 'payments'>) => Worker
  updateWorker: (id: string, data: Partial<Worker>) => void
  deleteWorker: (id: string) => void
  setPermissions: (id: string, permissions: Permissions) => void
  addRole: (name: string) => void
  addAdvance: (workerId: string, advance: Omit<WorkerAdvance, 'id' | 'deducted'>) => void
  addAbsence: (workerId: string, absence: Omit<WorkerAbsence, 'id'>) => void
  addPayment: (workerId: string, payment: Omit<WorkerPayment, 'id'>) => void
  /**
   * Creates (or refreshes) the employee login in the local database so the
   * worker can sign in with their own permissions. Throws on invalid input
   * (email already used, password too short…) so the caller can show it.
   */
  provisionAccount: (workerId: string, password: string) => Promise<void>
  /** Removes the employee login. */
  revokeAccount: (workerId: string) => Promise<void>
}

export const useWorkerStore = create<WorkerState>()(
  (set, get) => ({
    workers: [],
    roles: [],
    addWorker: (data) => {
      const worker: Worker = {
        ...data,
        // the password only feeds the login account — it is never stored here
        password: '',
        id: uid('w'),
        advances: [],
        absences: [],
        payments: [],
        createdAt: new Date().toISOString(),
      }
      set((s) => ({ workers: [worker, ...s.workers] }))
      return worker
    },
    updateWorker: (id, data) => {
      set((s) => ({ workers: s.workers.map((w) => (w.id === id ? { ...w, ...data, password: '' } : w)) }))
      // keep the login identifiers in step with the worker card
      const updated = get().workers.find((w) => w.id === id)
      const auth = useAuthStore.getState()
      if (updated?.hasAccount && auth.users.some((u) => u.workerId === id)) {
        try {
          auth.upsertWorkerAccount(updated)
        } catch (e) {
          console.warn('[workers] account sync', e)
        }
      }
    },
    deleteWorker: (id) => {
      useAuthStore.getState().removeWorkerAccount(id)
      set((s) => ({ workers: s.workers.filter((w) => w.id !== id) }))
    },
    setPermissions: (id, permissions) => {
      set((s) => ({ workers: s.workers.map((w) => (w.id === id ? { ...w, permissions } : w)) }))
    },
    addRole: (name) =>
      set((s) => {
        if (s.roles.includes(name)) return s
        return { roles: [...s.roles, name] }
      }),
    addAdvance: (workerId, advance) => {
      const created: WorkerAdvance = { ...advance, id: uid('adv'), deducted: false }
      set((s) => ({
        workers: s.workers.map((w) =>
          w.id === workerId ? { ...w, advances: [created, ...w.advances] } : w,
        ),
      }))
    },
    addAbsence: (workerId, absence) => {
      const created: WorkerAbsence = { ...absence, id: uid('abs') }
      set((s) => ({
        workers: s.workers.map((w) =>
          w.id === workerId ? { ...w, absences: [created, ...w.absences] } : w,
        ),
      }))
    },
    addPayment: (workerId, payment) => {
      const created: WorkerPayment = { ...payment, id: uid('wp') }
      set((s) => ({
        workers: s.workers.map((w) => {
          if (w.id !== workerId) return w
          return {
            ...w,
            payments: [created, ...w.payments],
            // mark all advances as deducted once a salary payment is recorded
            advances: w.advances.map((a) => ({ ...a, deducted: true })),
          }
        }),
      }))
    },
    provisionAccount: async (workerId, password) => {
      const worker = get().workers.find((w) => w.id === workerId)
      if (!worker) throw new Error('WORKER_NOT_FOUND')
      useAuthStore.getState().upsertWorkerAccount({ ...worker, hasAccount: true }, password)
      set((s) => ({
        workers: s.workers.map((w) => (w.id === workerId ? { ...w, hasAccount: true } : w)),
      }))
    },
    revokeAccount: async (workerId) => {
      useAuthStore.getState().removeWorkerAccount(workerId)
      set((s) => ({
        workers: s.workers.map((w) => (w.id === workerId ? { ...w, hasAccount: false } : w)),
      }))
    },
  }),
)
