import { create } from 'zustand'
import type { Client } from '@/types'
import { uid } from '@/utils/helpers'
import { remote } from '@/lib/cloud'

interface ClientState {
  clients: Client[]
  addClient: (data: Omit<Client, 'id' | 'createdAt'>) => Client
  updateClient: (id: string, data: Partial<Client>) => void
  deleteClient: (id: string) => void
}

export const useClientStore = create<ClientState>()(
  (set, get) => ({
    clients: [],
    addClient: (data) => {
      const client: Client = { ...data, id: uid('c'), createdAt: new Date().toISOString() }
      set((s) => ({ clients: [client, ...s.clients] }))
      remote.clients.save(client)
      return client
    },
    updateClient: (id, data) => {
      set((s) => ({ clients: s.clients.map((c) => (c.id === id ? { ...c, ...data } : c)) }))
      const updated = get().clients.find((c) => c.id === id)
      if (updated) remote.clients.save(updated)
    },
    deleteClient: (id) => {
      set((s) => ({ clients: s.clients.filter((c) => c.id !== id) }))
      remote.clients.remove(id)
    },
  }),
)
