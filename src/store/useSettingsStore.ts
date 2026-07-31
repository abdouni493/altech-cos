import { create } from 'zustand'
import type { StoreSettings } from '@/types'
import { remote } from '@/lib/cloud'

interface SettingsState {
  settings: StoreSettings
  updateSettings: (data: Partial<StoreSettings>) => void
}

export const useSettingsStore = create<SettingsState>()(
  (set, get) => ({
    settings: {
      logo: '',
      name: '',
      description: '',
      email: '',
      phone: '',
      address: '',
      nif: '',
      nis: '',
      article: '',
      rc: '',
      currency: 'DA',
    },
    updateSettings: (data) => {
      set((s) => ({ settings: { ...s.settings, ...data } }))
      remote.settings.save(get().settings)
    },
  }),
)
