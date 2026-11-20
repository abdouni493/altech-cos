import { flushDatabase, readSnapshot, replaceDatabase } from '@/lib/database'

/**
 * Backup / restore of the local database.
 *
 * The export is a JSON file of the whole shop (logins included — passwords are
 * only stored as salted hashes). The import replaces the local database; the
 * server keeps the previous state in data/backups/ first. Backups made by the
 * former cloud version of the app are accepted too.
 */

const FILE_MARKER = '__cosmetics'

export const exportData = async (): Promise<void> => {
  await flushDatabase()
  const snapshot = readSnapshot()
  const payload = {
    [FILE_MARKER]: true,
    version: 3,
    source: 'altech-pos-local',
    exportedAt: new Date().toISOString(),
    data: snapshot,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `altech-pos-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Reads legacy (v1, localStorage-shaped) backups as well as v2 dumps. */
const normalise = (parsed: any) => {
  const data = parsed?.data ?? parsed
  if (!data) return null

  // v2 / v3 — a snapshot of the cloud version or of this local database
  if (Array.isArray(data.products) || Array.isArray(data.sales)) {
    return {
      products: data.products ?? [],
      brands: data.brands ?? [],
      categories: data.categories ?? [],
      units: data.units ?? [],
      clients: data.clients ?? [],
      suppliers: data.suppliers ?? [],
      purchases: data.purchases ?? [],
      sales: data.sales ?? [],
      sheets: data.sheets ?? [],
      productions: data.productions ?? [],
      workers: data.workers ?? [],
      workerRoles: data.workerRoles ?? [],
      expenses: data.expenses ?? [],
      caisse: data.caisse ?? [],
      settings: data.settings ?? undefined,
      users: data.users ?? undefined,
    }
  }

  // v1 — the old localStorage export, keyed by zustand store name
  const state = (key: string) => data[key]?.state ?? data[key] ?? {}
  const products = state('cosmetics-products-v1')
  const workers = state('cosmetics-workers-v1')
  return {
    products: products.products ?? [],
    brands: products.brands ?? [],
    categories: products.categories ?? [],
    units: products.units ?? [],
    sheets: [],
    productions: [],
    clients: state('cosmetics-clients-v1').clients ?? [],
    suppliers: state('cosmetics-suppliers-v1').suppliers ?? [],
    purchases: state('cosmetics-purchases-v1').purchases ?? [],
    sales: state('cosmetics-sales-v1').sales ?? [],
    workers: workers.workers ?? [],
    workerRoles: workers.roles ?? [],
    expenses: state('cosmetics-expenses-v1').expenses ?? [],
    caisse: state('cosmetics-caisse').transactions ?? [],
    settings: state('cosmetics-settings-v1').settings ?? undefined,
  }
}

export const importData = (file: File): Promise<void> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const snapshot = normalise(JSON.parse(reader.result as string))
        if (!snapshot) throw new Error('INVALID_BACKUP')
        await replaceDatabase(snapshot)
        resolve()
      } catch (e) {
        reject(e)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
