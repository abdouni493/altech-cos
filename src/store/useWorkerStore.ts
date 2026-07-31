import { create } from 'zustand'
import type {
  Worker,
  WorkerAdvance,
  WorkerAbsence,
  WorkerPayment,
  Permissions,
} from '@/types'
import { uid } from '@/utils/helpers'
import { remote } from '@/lib/cloud'

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
   * Creates (or refreshes) the employee login inside Supabase `auth.users`
   * so the worker can sign in directly with their own permissions.
   * Throws on failure so the caller can show the error.
   */
  provisionAccount: (workerId: string, password: string) => Promise<void>
  /** Removes the employee login (auth.users row + profile). */
  revokeAccount: (workerId: string) => Promise<void>
}

export const useWorkerStore = create<WorkerState>()(
  (set, get) => ({
    workers: [],
    roles: [],
    addWorker: (data) => {
      const worker: Worker = {
        ...data,
        id: uid('w'),
        advances: [],
        absences: [],
        payments: [],
        createdAt: new Date().toISOString(),
      }
      set((s) => ({ workers: [worker, ...s.workers] }))
      remote.workers.save(worker)
      return worker
    },
    updateWorker: (id, data) => {
      set((s) => ({ workers: s.workers.map((w) => (w.id === id ? { ...w, ...data } : w)) }))
      const updated = get().workers.find((w) => w.id === id)
      if (updated) remote.workers.save(updated)
    },
    deleteWorker: (id) => {
      set((s) => ({ workers: s.workers.filter((w) => w.id !== id) }))
      remote.workers.remove(id)
    },
    setPermissions: (id, permissions) => {
      set((s) => ({ workers: s.workers.map((w) => (w.id === id ? { ...w, permissions } : w)) }))
      remote.workers.setPermissions(id, permissions)
    },
    addRole: (name) =>
      set((s) => {
        if (s.roles.includes(name)) return s
        remote.workers.addRole(name)
        return { roles: [...s.roles, name] }
      }),
    addAdvance: (workerId, advance) => {
      const created: WorkerAdvance = { ...advance, id: uid('adv'), deducted: false }
      set((s) => ({
        workers: s.workers.map((w) =>
          w.id === workerId ? { ...w, advances: [created, ...w.advances] } : w,
        ),
      }))
      remote.workers.addAdvance(workerId, created)
    },
    addAbsence: (workerId, absence) => {
      const created: WorkerAbsence = { ...absence, id: uid('abs') }
      set((s) => ({
        workers: s.workers.map((w) =>
          w.id === workerId ? { ...w, absences: [created, ...w.absences] } : w,
        ),
      }))
      remote.workers.addAbsence(workerId, created)
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
      remote.workers.addPayment(workerId, created)
    },
    provisionAccount: async (workerId, password) => {
      const worker = get().workers.find((w) => w.id === workerId)
      if (!worker) throw new Error('WORKER_NOT_FOUND')
      await remote.workers.createAccount(worker, password)
      set((s) => ({
        workers: s.workers.map((w) => (w.id === workerId ? { ...w, hasAccount: true } : w)),
      }))
    },
    revokeAccount: async (workerId) => {
      await remote.workers.disableAccount(workerId)
      set((s) => ({
        workers: s.workers.map((w) => (w.id === workerId ? { ...w, hasAccount: false } : w)),
      }))
    },
  }),
)
