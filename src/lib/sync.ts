import { fetchSnapshot, flushCloud, uploadLocalSnapshot, type LocalSnapshot } from './cloud'
import { useProductStore } from '@/store/useProductStore'
import { useClientStore } from '@/store/useClientStore'
import { useSupplierStore } from '@/store/useSupplierStore'
import { usePurchaseStore } from '@/store/usePurchaseStore'
import { useSalesStore } from '@/store/useSalesStore'
import { useProductionStore } from '@/store/useProductionStore'
import { useWorkerStore } from '@/store/useWorkerStore'
import { useExpenseStore } from '@/store/useExpenseStore'
import { useCaisseStore } from '@/store/useCaisseStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import type {
  CaisseTransaction,
  Client,
  Expense,
  Product,
  Production,
  Purchase,
  Sale,
  StoreSettings,
  Supplier,
  TechSheet,
  Worker,
} from '@/types'

const emptySettings = (): StoreSettings => ({
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
})

/** Everything currently held in memory (a mirror of the Supabase rows). */
export const readLocalSnapshot = (): LocalSnapshot => ({
  products: useProductStore.getState().products,
  brands: useProductStore.getState().brands,
  categories: useProductStore.getState().categories,
  units: useProductStore.getState().units,
  clients: useClientStore.getState().clients,
  suppliers: useSupplierStore.getState().suppliers,
  purchases: usePurchaseStore.getState().purchases,
  sales: useSalesStore.getState().sales,
  sheets: useProductionStore.getState().sheets,
  productions: useProductionStore.getState().productions,
  workers: useWorkerStore.getState().workers,
  workerRoles: useWorkerStore.getState().roles,
  expenses: useExpenseStore.getState().expenses,
  caisse: useCaisseStore.getState().transactions,
  settings: useSettingsStore.getState().settings,
})

/** Writes a snapshot into the stores. This is the ONLY way data reaches a screen. */
export const applySnapshot = (snapshot: {
  products: Product[]
  brands: string[]
  categories: string[]
  units: string[]
  clients: Client[]
  suppliers: Supplier[]
  purchases: Purchase[]
  sales: Sale[]
  sheets: TechSheet[]
  productions: Production[]
  workers: Worker[]
  workerRoles: string[]
  expenses: Expense[]
  caisse: CaisseTransaction[]
  settings: StoreSettings | null
}) => {
  useProductStore.setState({
    products: snapshot.products,
    brands: snapshot.brands,
    categories: snapshot.categories,
    units: snapshot.units,
  })
  useClientStore.setState({ clients: snapshot.clients })
  useSupplierStore.setState({ suppliers: snapshot.suppliers })
  usePurchaseStore.setState({ purchases: snapshot.purchases })
  useSalesStore.setState({ sales: snapshot.sales })
  useProductionStore.setState({ sheets: snapshot.sheets, productions: snapshot.productions })
  useWorkerStore.setState({ workers: snapshot.workers, roles: snapshot.workerRoles })
  useExpenseStore.setState({ expenses: snapshot.expenses })
  useCaisseStore.setState({ transactions: snapshot.caisse })
  useSettingsStore.setState({ settings: snapshot.settings ?? emptySettings() })
}

/** Empties every screen — called on logout so nothing survives the session. */
export const clearShopState = () => {
  applySnapshot({
    products: [],
    brands: [],
    categories: [],
    units: [],
    clients: [],
    suppliers: [],
    purchases: [],
    sales: [],
    sheets: [],
    productions: [],
    workers: [],
    workerRoles: [],
    expenses: [],
    caisse: [],
    settings: null,
  })
}

// ----------------------------------------------------------------------------
// One-time migration of the pre-Supabase browser data
// ----------------------------------------------------------------------------

const MIGRATION_FLAG = 'cosmetics-migrated-to-supabase'

const LEGACY_KEYS = {
  products: 'cosmetics-products-v1',
  clients: 'cosmetics-clients-v1',
  suppliers: 'cosmetics-suppliers-v1',
  purchases: 'cosmetics-purchases-v1',
  sales: 'cosmetics-sales-v1',
  workers: 'cosmetics-workers-v1',
  expenses: 'cosmetics-expenses-v1',
  caisse: 'cosmetics-caisse',
  settings: 'cosmetics-settings-v1',
} as const

/* eslint-disable @typescript-eslint/no-explicit-any */
const readLegacy = (key: string): any => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state ?? parsed
  } catch {
    return null
  }
}

/**
 * Data saved by older versions of the app lived in `localStorage`. It is read
 * once, uploaded to Supabase, and never displayed again from the browser.
 * The legacy keys are kept untouched as a safety copy.
 */
export const readLegacyBrowserData = (): LocalSnapshot | null => {
  if (localStorage.getItem(MIGRATION_FLAG)) return null

  const products = readLegacy(LEGACY_KEYS.products)
  const clients = readLegacy(LEGACY_KEYS.clients)
  const suppliers = readLegacy(LEGACY_KEYS.suppliers)
  const purchases = readLegacy(LEGACY_KEYS.purchases)
  const sales = readLegacy(LEGACY_KEYS.sales)
  const workers = readLegacy(LEGACY_KEYS.workers)
  const expenses = readLegacy(LEGACY_KEYS.expenses)
  const caisse = readLegacy(LEGACY_KEYS.caisse)
  const settings = readLegacy(LEGACY_KEYS.settings)

  const snapshot: LocalSnapshot = {
    products: products?.products ?? [],
    brands: products?.brands ?? [],
    categories: products?.categories ?? [],
    units: products?.units ?? [],
    clients: clients?.clients ?? [],
    suppliers: suppliers?.suppliers ?? [],
    purchases: purchases?.purchases ?? [],
    sales: sales?.sales ?? [],
    sheets: [],
    productions: [],
    workers: workers?.workers ?? [],
    workerRoles: workers?.roles ?? [],
    expenses: expenses?.expenses ?? [],
    caisse: caisse?.transactions ?? [],
    settings: settings?.settings ?? emptySettings(),
  }

  const isEmpty =
    snapshot.products.length === 0 &&
    snapshot.clients.length === 0 &&
    snapshot.suppliers.length === 0 &&
    snapshot.purchases.length === 0 &&
    snapshot.sales.length === 0 &&
    snapshot.workers.length === 0 &&
    snapshot.expenses.length === 0 &&
    snapshot.caisse.length === 0

  return isEmpty ? null : snapshot
}

export const markMigrated = () => localStorage.setItem(MIGRATION_FLAG, new Date().toISOString())

// ----------------------------------------------------------------------------
// Download / upload
// ----------------------------------------------------------------------------

export type SyncResult = 'synced' | 'migrated'

/**
 * Downloads the whole shop from Supabase into the stores — the single source
 * of truth for every screen.
 *
 * On the very first run after the Supabase migration, data still sitting in
 * this browser from the offline version is uploaded first so nothing is lost.
 */
export const syncFromCloud = async (): Promise<SyncResult> => {
  // never overwrite the screens while writes are still on their way up
  await flushCloud()

  let snapshot = await fetchSnapshot()
  let migrated = false

  const cloudIsEmpty =
    snapshot.products.length === 0 &&
    snapshot.sales.length === 0 &&
    snapshot.purchases.length === 0 &&
    snapshot.clients.length === 0 &&
    snapshot.workers.length === 0 &&
    snapshot.expenses.length === 0

  if (cloudIsEmpty) {
    const legacy = readLegacyBrowserData()
    if (legacy) {
      await uploadLocalSnapshot(legacy)
      markMigrated()
      snapshot = await fetchSnapshot()
      migrated = true
    }
  }

  applySnapshot(snapshot)
  return migrated ? 'migrated' : 'synced'
}

/** Settings → "Envoyer vers le serveur": re-uploads everything on screen. */
export const pushEverything = async (): Promise<void> => {
  await uploadLocalSnapshot(readLocalSnapshot())
  await syncFromCloud()
}

/** Restores a backup file into Supabase, then reloads the screens from it. */
export const restoreSnapshot = async (snapshot: Partial<LocalSnapshot>): Promise<void> => {
  await uploadLocalSnapshot({
    products: snapshot.products ?? [],
    brands: snapshot.brands ?? [],
    categories: snapshot.categories ?? [],
    units: snapshot.units ?? [],
    clients: snapshot.clients ?? [],
    suppliers: snapshot.suppliers ?? [],
    purchases: snapshot.purchases ?? [],
    sales: snapshot.sales ?? [],
    sheets: snapshot.sheets ?? [],
    productions: snapshot.productions ?? [],
    workers: snapshot.workers ?? [],
    workerRoles: snapshot.workerRoles ?? [],
    expenses: snapshot.expenses ?? [],
    caisse: snapshot.caisse ?? [],
    settings: snapshot.settings ?? emptySettings(),
  })
  await syncFromCloud()
}
