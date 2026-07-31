import { fetchSnapshot } from '@/lib/cloud'
import { restoreSnapshot } from '@/lib/sync'

/**
 * Backup / restore.
 *
 * Both directions talk to Supabase: the export is a fresh dump of the database
 * (never of the browser), and the import writes the file back into Supabase
 * before the screens are reloaded from it.
 */

const FILE_MARKER = '__cosmetics'

export const exportData = async (): Promise<void> => {
  const snapshot = await fetchSnapshot()
  const payload = {
    [FILE_MARKER]: true,
    version: 2,
    source: 'supabase',
    exportedAt: new Date().toISOString(),
    data: snapshot,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `belle-cosmetiques-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Reads legacy (v1, localStorage-shaped) backups as well as v2 dumps. */
const normalise = (parsed: any) => {
  const data = parsed?.data ?? parsed
  if (!data) return null

  // v2 — a Supabase snapshot
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
        await restoreSnapshot(snapshot)
        resolve()
      } catch (e) {
        reject(e)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
