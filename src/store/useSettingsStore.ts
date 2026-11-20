import { create } from 'zustand'
import type { StoreSettings } from '@/types'

interface SettingsState {
  settings: StoreSettings
  updateSettings: (data: Partial<StoreSettings>) => void
}

export const useSettingsStore = create<SettingsState>()(
  (set) => ({
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
    },
  }),
)
