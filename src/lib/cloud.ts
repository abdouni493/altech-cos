import { supabase, isNetworkError } from './supabase'
import type {
  CaisseTransaction,
  Client,
  Expense,
  Payment,
  Product,
  Production,
  Purchase,
  PurchaseLine,
  RecipeLine,
  Sale,
  SaleLine,
  StoreSettings,
  Supplier,
  TechSheet,
  Worker,
  WorkerAbsence,
  WorkerAdvance,
  WorkerPayment,
} from '@/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

// ----------------------------------------------------------------------------
// Session tracking — writes are only pushed when a member is signed in (RLS).
// ----------------------------------------------------------------------------

let signedIn = false

export const setCloudSignedIn = (value: boolean) => {
  signedIn = value
}
export const isCloudSignedIn = () => signedIn

/** Last cloud error, surfaced by the header "cloud" indicator. */
export let lastCloudError: string | null = null

/**
 * Called whenever a write is rejected by Postgres. The app registers a handler
 * that warns the cashier and re-downloads the shop, so the screen never keeps
 * showing a row the server refused.
 */
export type CloudErrorHandler = (context: string, message: string, isOffline: boolean) => void

let onCloudError: CloudErrorHandler | null = null
export const setCloudErrorHandler = (handler: CloudErrorHandler | null) => {
  onCloudError = handler
}

const swallow = (context: string, error: unknown) => {
  if (!error) return
  const message = (error as { message?: string }).message ?? String(error)
  lastCloudError = `${context}: ${message}`
  const offline = isNetworkError(error)
  if (offline) console.warn(`[cloud] offline — ${context}`)
  else console.warn(`[cloud] ${context}`, error)
  onCloudError?.(context, message, offline)
}

/**
 * Serial write queue.
 *
 * Cloud writes must reach Postgres in the same order the cashier performed
 * them, otherwise a purchase line can hit the server before the product it
 * references (foreign key violation). Every mutation is therefore chained.
 */
let chain: Promise<unknown> = Promise.resolve()
let lastWriteAt = 0

export const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(fn, fn)
  chain = run
    .catch(() => undefined)
    .then(() => {
      lastWriteAt = Date.now()
    })
  return run
}

/** Milliseconds since this device last wrote to Supabase. */
export const msSinceLastWrite = (): number => Date.now() - lastWriteAt

/** Resolves once every pending cloud write has been flushed. */
export const flushCloud = (): Promise<unknown> => chain

/** Fire-and-forget cloud write: never blocks nor breaks the local UI. */
const push = (context: string, fn: () => PromiseLike<{ error: unknown }>): Promise<void> => {
  if (!signedIn) {
    // The session expired mid-session: warn instead of dropping the write silently.
    swallow(context, new Error('NOT_AUTHORIZED'))
    return Promise.resolve()
  }
  return enqueue(async () => {
    try {
      const { error } = await fn()
      if (error) swallow(context, error)
      else lastCloudError = null
    } catch (e) {
      swallow(context, e)
    }
  })
}

// ----------------------------------------------------------------------------
// Mappers — camelCase (app) <-> snake_case (Postgres)
// ----------------------------------------------------------------------------

const iso = (value?: string | null): string | null => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const day = (value?: string | null): string | null => {
  if (!value) return null
  return value.slice(0, 10)
}

export const productToRow = (p: Product): Row => ({
  id: p.id,
  name: p.name,
  description: p.description ?? '',
  barcode: p.barcode ?? '',
  brand: p.brand ?? '',
  category: p.category ?? '',
  purchase_price: p.purchasePrice ?? 0,
  sale_price: p.salePrice ?? 0,
  quantity: p.quantity ?? 0,
  min_quantity: p.minQuantity ?? 0,
  has_expiration: !!p.hasExpiration,
  expiration_date: p.hasExpiration ? day(p.expirationDate) : null,
  is_divisible: !!p.isDivisible,
  unit: p.unit ?? '',
  capacity: p.capacity ?? 0,
  retail_step: p.retailStep ?? 0,
  retail_price: p.retailPrice ?? 0,
  open_remaining: p.openRemaining ?? 0,
  created_at: iso(p.createdAt) ?? new Date().toISOString(),
})

export const rowToProduct = (r: Row): Product => ({
  id: r.id,
  name: r.name ?? '',
  description: r.description ?? '',
  barcode: r.barcode ?? '',
  brand: r.brand ?? '',
  category: r.category ?? '',
  purchasePrice: Number(r.purchase_price ?? 0),
  salePrice: Number(r.sale_price ?? 0),
  quantity: Number(r.quantity ?? 0),
  minQuantity: Number(r.min_quantity ?? 0),
  hasExpiration: !!r.has_expiration,
  expirationDate: r.expiration_date ?? undefined,
  isDivisible: !!r.is_divisible,
  unit: r.unit ?? '',
  capacity: Number(r.capacity ?? 0),
  retailStep: Number(r.retail_step ?? 0),
  retailPrice: Number(r.retail_price ?? 0),
  openRemaining: Number(r.open_remaining ?? 0),
  createdAt: r.created_at ?? new Date().toISOString(),
})

const clientToRow = (c: Client): Row => ({
  id: c.id,
  name: c.name,
  phone: c.phone ?? '',
  created_at: iso(c.createdAt) ?? new Date().toISOString(),
})
const rowToClient = (r: Row): Client => ({
  id: r.id,
  name: r.name ?? '',
  phone: r.phone ?? '',
  createdAt: r.created_at ?? new Date().toISOString(),
})

const supplierToRow = (s: Supplier): Row => ({
  id: s.id,
  name: s.name,
  phone: s.phone ?? '',
  address: s.address ?? '',
  created_at: iso(s.createdAt) ?? new Date().toISOString(),
})
const rowToSupplier = (r: Row): Supplier => ({
  id: r.id,
  name: r.name ?? '',
  phone: r.phone ?? '',
  address: r.address ?? '',
  createdAt: r.created_at ?? new Date().toISOString(),
})

const expenseToRow = (e: Expense): Row => ({
  id: e.id,
  name: e.name,
  description: e.description ?? '',
  amount: e.amount ?? 0,
  date: iso(e.date) ?? new Date().toISOString(),
  created_at: iso(e.createdAt) ?? new Date().toISOString(),
})
const rowToExpense = (r: Row): Expense => ({
  id: r.id,
  name: r.name ?? '',
  description: r.description ?? '',
  amount: Number(r.amount ?? 0),
  date: r.date ?? new Date().toISOString(),
  createdAt: r.created_at ?? new Date().toISOString(),
})

const caisseToRow = (c: CaisseTransaction): Row => ({
  id: c.id,
  type: c.type,
  amount: c.amount ?? 0,
  description: c.description ?? '',
  date: iso(c.date) ?? new Date().toISOString(),
  created_at: iso(c.createdAt) ?? new Date().toISOString(),
})
const rowToCaisse = (r: Row): CaisseTransaction => ({
  id: r.id,
  type: r.type,
  amount: Number(r.amount ?? 0),
  description: r.description ?? '',
  date: r.date ?? new Date().toISOString(),
  createdAt: r.created_at ?? new Date().toISOString(),
})

const purchaseLineToRow = (purchaseId: string, l: PurchaseLine): Row => ({
  purchase_id: purchaseId,
  product_id: l.productId || null,
  product_name: l.productName ?? '',
  barcode: l.barcode ?? '',
  quantity: l.quantity ?? 1,
  purchase_price: l.purchasePrice ?? 0,
  sale_price: l.salePrice ?? 0,
  min_quantity: l.minQuantity ?? 0,
  has_expiration: !!l.hasExpiration,
  expiration_date: l.hasExpiration ? day(l.expirationDate) : null,
  is_divisible: !!l.isDivisible,
  unit: l.unit ?? '',
  capacity: l.capacity ?? 0,
  retail_step: l.retailStep ?? 0,
  retail_price: l.retailPrice ?? 0,
})

const rowToPurchase = (r: Row): Purchase => ({
  id: r.id,
  reference: r.reference ?? '',
  supplierId: r.supplier_id ?? null,
  supplierName: r.supplier_name ?? '',
  total: Number(r.total ?? 0),
  paid: Number(r.paid ?? 0),
  date: r.date ?? new Date().toISOString(),
  createdAt: r.created_at ?? new Date().toISOString(),
  lines: (r.purchase_lines ?? []).map(
    (l: Row): PurchaseLine => ({
      productId: l.product_id ?? '',
      productName: l.product_name ?? '',
      barcode: l.barcode ?? '',
      quantity: Number(l.quantity ?? 0),
      purchasePrice: Number(l.purchase_price ?? 0),
      salePrice: Number(l.sale_price ?? 0),
      minQuantity: Number(l.min_quantity ?? 0),
      hasExpiration: !!l.has_expiration,
      expirationDate: l.expiration_date ?? undefined,
      isDivisible: !!l.is_divisible,
      unit: l.unit ?? undefined,
      capacity: Number(l.capacity ?? 0),
      retailStep: Number(l.retail_step ?? 0),
      retailPrice: Number(l.retail_price ?? 0),
    }),
  ),
  payments: (r.purchase_payments ?? []).map(
    (p: Row): Payment => ({
      id: p.id,
      amount: Number(p.amount ?? 0),
      date: p.date ?? new Date().toISOString(),
      note: p.note ?? undefined,
    }),
  ),
})

const rowToSale = (r: Row): Sale => ({
  id: r.id,
  reference: r.reference ?? '',
  clientId: r.client_id ?? null,
  clientName: r.client_name ?? '',
  subtotal: Number(r.subtotal ?? 0),
  discount: Number(r.discount ?? 0),
  total: Number(r.total ?? 0),
  paid: Number(r.paid ?? 0),
  date: r.date ?? new Date().toISOString(),
  createdAt: r.created_at ?? new Date().toISOString(),
  lines: (r.sale_lines ?? []).map(
    (l: Row): SaleLine => ({
      productId: l.product_id ?? '',
      productName: l.product_name ?? '',
      barcode: l.barcode ?? '',
      quantity: Number(l.quantity ?? 0),
      unitPrice: Number(l.unit_price ?? 0),
      kind: l.kind ?? 'product',
      unit: l.unit ?? undefined,
      unitCost: Number(l.cost_price ?? 0),
      productionId: l.production_id ?? undefined,
    }),
  ),
  payments: (r.sale_payments ?? []).map(
    (p: Row): Payment => ({
      id: p.id,
      amount: Number(p.amount ?? 0),
      date: p.date ?? new Date().toISOString(),
      note: p.note ?? undefined,
    }),
  ),
})

// -- Production --------------------------------------------------------------

const recipeLineToRow = (l: RecipeLine, index: number): Row => ({
  position: index,
  product_id: l.productId || null,
  product_name: l.productName ?? '',
  quantity: l.quantity ?? 0,
  unit_cost: l.unitCost ?? 0,
  by_content: !!l.byContent,
  unit: l.unit ?? '',
})

const rowToRecipeLine = (l: Row): RecipeLine => ({
  productId: l.product_id ?? '',
  productName: l.product_name ?? '',
  quantity: Number(l.quantity ?? 0),
  unitCost: Number(l.unit_cost ?? 0),
  byContent: !!l.by_content,
  unit: l.unit || undefined,
})

const sortLines = (rows: Row[]): Row[] =>
  [...rows].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))

const rowToTechSheet = (r: Row): TechSheet => ({
  id: r.id,
  name: r.name ?? '',
  description: r.description ?? '',
  outputName: r.output_name ?? '',
  outputQuantity: Number(r.output_quantity ?? 0),
  outputUnitPrice: Number(r.output_unit_price ?? 0),
  lines: sortLines(r.tech_sheet_lines ?? []).map(rowToRecipeLine),
  createdAt: r.created_at ?? new Date().toISOString(),
})

const rowToProduction = (r: Row): Production => ({
  id: r.id,
  reference: r.reference ?? '',
  sheetId: r.sheet_id ?? null,
  sheetName: r.sheet_name ?? '',
  outputName: r.output_name ?? '',
  outputQuantity: Number(r.output_quantity ?? 0),
  outputUnitPrice: Number(r.output_unit_price ?? 0),
  totalCost: Number(r.total_cost ?? 0),
  totalRevenue: Number(r.total_revenue ?? 0),
  gain: Number(r.gain ?? 0),
  soldQuantity: Number(r.sold_quantity ?? 0),
  status: r.status === 'recovered' ? 'recovered' : 'active',
  date: r.date ?? new Date().toISOString(),
  createdAt: r.created_at ?? new Date().toISOString(),
  lines: sortLines(r.production_lines ?? []).map(rowToRecipeLine),
})

/** JSON sent to create_production() / update_production(). */
const productionPayload = (p: Production): Row => ({
  id: p.id,
  reference: p.reference,
  sheetId: p.sheetId,
  sheetName: p.sheetName,
  outputName: p.outputName,
  outputQuantity: p.outputQuantity,
  outputUnitPrice: p.outputUnitPrice,
  totalCost: p.totalCost,
  totalRevenue: p.totalRevenue,
  gain: p.gain,
  soldQuantity: p.soldQuantity,
  status: p.status,
  date: iso(p.date),
  lines: p.lines,
})

/** Worker → row. The password never leaves the browser: it only feeds auth.users. */
const workerToRow = (w: Worker): Row => ({
  id: w.id,
  full_name: w.fullName,
  birth_date: day(w.birthDate),
  id_card: w.idCard ?? '',
  phone: w.phone ?? '',
  role: w.role ?? '',
  has_salary: !!w.hasSalary,
  salary_type: w.salaryType ?? 'monthly',
  salary_amount: w.salaryAmount ?? 0,
  has_account: !!w.hasAccount,
  email: w.email ?? '',
  username: w.username ?? '',
  permissions: w.permissions ?? {},
  start_date: iso(w.startDate) ?? new Date().toISOString(),
  active: w.active !== false,
  created_at: iso(w.createdAt) ?? new Date().toISOString(),
})

const rowToWorker = (r: Row): Worker => ({
  id: r.id,
  fullName: r.full_name ?? '',
  birthDate: r.birth_date ?? '',
  idCard: r.id_card ?? '',
  phone: r.phone ?? '',
  role: r.role ?? '',
  hasSalary: !!r.has_salary,
  salaryType: r.salary_type ?? 'monthly',
  salaryAmount: Number(r.salary_amount ?? 0),
  hasAccount: !!r.has_account,
  email: r.email ?? '',
  username: r.username ?? '',
  password: '',
  permissions: r.permissions ?? {},
  startDate: r.start_date ?? new Date().toISOString(),
  active: r.active !== false,
  createdAt: r.created_at ?? new Date().toISOString(),
  advances: (r.worker_advances ?? []).map(
    (a: Row): WorkerAdvance => ({
      id: a.id,
      date: a.date,
      description: a.description ?? '',
      amount: Number(a.amount ?? 0),
      deducted: !!a.deducted,
    }),
  ),
  absences: (r.worker_absences ?? []).map(
    (a: Row): WorkerAbsence => ({
      id: a.id,
      date: a.date,
      description: a.description ?? '',
      cost: Number(a.cost ?? 0),
    }),
  ),
  payments: (r.worker_payments ?? []).map(
    (p: Row): WorkerPayment => ({
      id: p.id,
      period: p.period ?? '',
      baseSalary: Number(p.base_salary ?? 0),
      absencesDeducted: Number(p.absences_deducted ?? 0),
      advancesDeducted: Number(p.advances_deducted ?? 0),
      amount: Number(p.amount ?? 0),
      date: p.date,
      note: p.note ?? undefined,
    }),
  ),
})

const settingsToRow = (s: StoreSettings): Row => ({
  id: 1,
  logo: s.logo ?? '',
  name: s.name ?? '',
  description: s.description ?? '',
  email: s.email ?? '',
  phone: s.phone ?? '',
  address: s.address ?? '',
  nif: s.nif ?? '',
  nis: s.nis ?? '',
  article: s.article ?? '',
  rc: s.rc ?? '',
  currency: s.currency ?? 'DA',
})

const rowToSettings = (r: Row): StoreSettings => ({
  logo: r.logo ?? '',
  name: r.name ?? '',
  description: r.description ?? '',
  email: r.email ?? '',
  phone: r.phone ?? '',
  address: r.address ?? '',
  nif: r.nif ?? '',
  nis: r.nis ?? '',
  article: r.article ?? '',
  rc: r.rc ?? '',
  currency: r.currency ?? 'DA',
})

// ----------------------------------------------------------------------------
// Remote repository — one entry per screen action
// ----------------------------------------------------------------------------

export const remote = {
  // -- Stock ---------------------------------------------------------------
  products: {
    save: (p: Product) => push('products.save', () => supabase.from('products').upsert(productToRow(p))),
    patch: (id: string, patch: Partial<Product>) =>
      push('products.patch', () => {
        const full = { id, ...patch } as Product
        const row = productToRow(full)
        // only send the keys the caller actually changed
        const allowed = new Set(
          Object.keys(patch).map((k) =>
            ({
              purchasePrice: 'purchase_price',
              salePrice: 'sale_price',
              minQuantity: 'min_quantity',
              hasExpiration: 'has_expiration',
              expirationDate: 'expiration_date',
              isDivisible: 'is_divisible',
              retailStep: 'retail_step',
              retailPrice: 'retail_price',
              openRemaining: 'open_remaining',
              createdAt: 'created_at',
            } as Record<string, string>)[k] ?? k,
          ),
        )
        const partialRow: Row = { id }
        Object.entries(row).forEach(([k, v]) => {
          if (allowed.has(k)) partialRow[k] = v
        })
        return supabase.from('products').update(partialRow).eq('id', id)
      }),
    remove: (id: string) => push('products.remove', () => supabase.from('products').delete().eq('id', id)),
    addBrand: (name: string) => push('brands.add', () => supabase.from('brands').upsert({ name })),
    addCategory: (name: string) => push('categories.add', () => supabase.from('categories').upsert({ name })),
    addUnit: (name: string) => push('units.add', () => supabase.from('measure_units').upsert({ name })),
  },

  // -- Production -----------------------------------------------------------
  techSheets: {
    /** "Enregistrer" on a fiche technique — header + recipe, no stock movement. */
    save: (s: TechSheet) =>
      push('techSheets.save', async () => {
        const { error } = await supabase.rpc('save_tech_sheet', {
          payload: {
            id: s.id,
            name: s.name,
            description: s.description,
            outputName: s.outputName,
            outputQuantity: s.outputQuantity,
            outputUnitPrice: s.outputUnitPrice,
            createdAt: iso(s.createdAt),
            lines: s.lines,
          },
        })
        return { error }
      }),
    remove: (id: string) =>
      push('techSheets.remove', () => supabase.from('tech_sheets').delete().eq('id', id)),
  },
  productions: {
    /** "Lancer la production" → atomic RPC (batch + lines + stock deduction). */
    create: (p: Production) =>
      push('productions.create', async () => {
        const { error } = await supabase.rpc('create_production', { payload: productionPayload(p) })
        return { error }
      }),
    /** Edit → the RPC restores the previous recipe then applies the new one. */
    update: (p: Production) =>
      push('productions.update', async () => {
        const { error } = await supabase.rpc('update_production', { payload: productionPayload(p) })
        return { error }
      }),
    /** "Récupérer" → every component goes back to the stock. */
    recover: (id: string) =>
      push('productions.recover', async () => {
        const { error } = await supabase.rpc('recover_production', { p_production_id: id })
        return { error }
      }),
    /** Delete → the components are returned first when the batch is still active. */
    remove: (id: string) =>
      push('productions.remove', async () => {
        const { error } = await supabase.rpc('delete_production', { p_production_id: id })
        return { error }
      }),
  },

  // -- Clients / suppliers --------------------------------------------------
  clients: {
    save: (c: Client) => push('clients.save', () => supabase.from('clients').upsert(clientToRow(c))),
    remove: (id: string) => push('clients.remove', () => supabase.from('clients').delete().eq('id', id)),
  },
  suppliers: {
    save: (s: Supplier) => push('suppliers.save', () => supabase.from('suppliers').upsert(supplierToRow(s))),
    remove: (id: string) => push('suppliers.remove', () => supabase.from('suppliers').delete().eq('id', id)),
  },

  // -- Purchases ------------------------------------------------------------
  purchases: {
    /** "Enregistrer" on a new purchase → atomic RPC (stock + prices refresh). */
    create: (p: Purchase) =>
      push('purchases.create', async () => {
        const { error } = await supabase.rpc('create_purchase', {
          payload: {
            id: p.id,
            reference: p.reference,
            supplierId: p.supplierId,
            supplierName: p.supplierName,
            total: p.total,
            paid: p.paid,
            date: p.date,
            lines: p.lines,
            payments: p.payments,
          },
        })
        return { error }
      }),
    update: (p: Purchase) =>
      push('purchases.update', async () => {
        const { error } = await supabase
          .from('purchases')
          .update({
            reference: p.reference,
            supplier_id: p.supplierId,
            supplier_name: p.supplierName,
            total: p.total,
            paid: p.paid,
            date: iso(p.date),
          })
          .eq('id', p.id)
        if (error) return { error }
        await supabase.from('purchase_lines').delete().eq('purchase_id', p.id)
        return supabase.from('purchase_lines').insert(p.lines.map((l) => purchaseLineToRow(p.id, l)))
      }),
    addPayment: (purchaseId: string, payment: Payment) =>
      push('purchases.pay', async () => {
        const { error } = await supabase.rpc('add_purchase_payment', {
          p_purchase_id: purchaseId,
          p_amount: payment.amount,
          p_date: iso(payment.date),
          p_note: payment.note ?? null,
        })
        return { error }
      }),
    remove: (id: string) => push('purchases.remove', () => supabase.from('purchases').delete().eq('id', id)),
  },

  // -- Sales / POS ----------------------------------------------------------
  sales: {
    /** "Valider la vente" → atomic RPC (sale + lines + cash-in + stock down). */
    create: (s: Sale) =>
      push('sales.create', async () => {
        const { error } = await supabase.rpc('create_sale', {
          payload: {
            id: s.id,
            reference: s.reference,
            clientId: s.clientId,
            clientName: s.clientName,
            subtotal: s.subtotal,
            discount: s.discount,
            total: s.total,
            paid: s.paid,
            date: s.date,
            lines: s.lines,
            payments: s.payments,
          },
        })
        return { error }
      }),
    update: (s: Sale) =>
      push('sales.update', () =>
        supabase
          .from('sales')
          .update({
            client_id: s.clientId,
            client_name: s.clientName,
            subtotal: s.subtotal,
            discount: s.discount,
            total: s.total,
            paid: s.paid,
            date: iso(s.date),
          })
          .eq('id', s.id),
      ),
    addPayment: (saleId: string, payment: Payment) =>
      push('sales.pay', async () => {
        const { error } = await supabase.rpc('add_sale_payment', {
          p_sale_id: saleId,
          p_amount: payment.amount,
          p_date: iso(payment.date),
          p_note: payment.note ?? null,
        })
        return { error }
      }),
    remove: (id: string) => push('sales.remove', () => supabase.from('sales').delete().eq('id', id)),
  },

  // -- Workers --------------------------------------------------------------
  workers: {
    save: (w: Worker) => push('workers.save', () => supabase.from('workers').upsert(workerToRow(w))),
    remove: (id: string) => push('workers.remove', () => supabase.from('workers').delete().eq('id', id)),
    setPermissions: (id: string, permissions: unknown) =>
      push('workers.permissions', async () => {
        const { error } = await supabase.rpc('set_worker_permissions', {
          p_worker_id: id,
          p_permissions: permissions,
        })
        return { error }
      }),
    addAdvance: (workerId: string, a: WorkerAdvance) =>
      push('workers.advance', () =>
        supabase.from('worker_advances').upsert({
          id: a.id,
          worker_id: workerId,
          date: iso(a.date),
          description: a.description ?? '',
          amount: a.amount,
          deducted: !!a.deducted,
        }),
      ),
    addAbsence: (workerId: string, a: WorkerAbsence) =>
      push('workers.absence', () =>
        supabase.from('worker_absences').upsert({
          id: a.id,
          worker_id: workerId,
          date: iso(a.date),
          description: a.description ?? '',
          cost: a.cost,
        }),
      ),
    addPayment: (workerId: string, p: WorkerPayment) =>
      push('workers.salary', async () => {
        const { error } = await supabase.from('worker_payments').upsert({
          id: p.id,
          worker_id: workerId,
          period: p.period,
          base_salary: p.baseSalary,
          absences_deducted: p.absencesDeducted,
          advances_deducted: p.advancesDeducted,
          amount: p.amount,
          date: iso(p.date),
          note: p.note ?? null,
        })
        if (error) return { error }
        return supabase.from('worker_advances').update({ deducted: true }).eq('worker_id', workerId)
      }),
    addRole: (name: string) => push('workerRoles.add', () => supabase.from('worker_roles').upsert({ name })),
    /**
     * Creates the real login account of the employee inside auth.users.
     * Queued behind the worker row itself so the RPC always finds it.
     */
    createAccount: (worker: Worker, password: string) =>
      enqueue(async () => {
        const { data, error } = await supabase.rpc('create_worker_account', {
          p_worker_id: worker.id,
          p_email: worker.email,
          p_password: password,
          p_full_name: worker.fullName,
          p_username: worker.username,
          p_permissions: worker.permissions ?? {},
          p_job_title: worker.role ?? '',
        })
        if (error) throw error
        return data
      }),
    disableAccount: (workerId: string) =>
      enqueue(async () => {
        const { error } = await supabase.rpc('disable_worker_account', { p_worker_id: workerId })
        if (error) throw error
      }),
  },

  // -- Expenses / caisse ----------------------------------------------------
  expenses: {
    save: (e: Expense) => push('expenses.save', () => supabase.from('expenses').upsert(expenseToRow(e))),
    remove: (id: string) => push('expenses.remove', () => supabase.from('expenses').delete().eq('id', id)),
  },
  caisse: {
    save: (c: CaisseTransaction) =>
      push('caisse.save', () => supabase.from('caisse_transactions').upsert(caisseToRow(c))),
    remove: (id: string) =>
      push('caisse.remove', () => supabase.from('caisse_transactions').delete().eq('id', id)),
  },

  // -- Settings -------------------------------------------------------------
  settings: {
    save: (s: StoreSettings) =>
      push('settings.save', () => supabase.from('store_settings').upsert(settingsToRow(s))),
  },

  /** Traceability of a button action (Reports → journal). */
  log: (module: string, action: string, entityId?: string, details?: Row) =>
    push('activity.log', async () => {
      const { error } = await supabase.rpc('log_action', {
        p_module: module,
        p_action: action,
        p_entity_id: entityId ?? null,
        p_details: details ?? {},
      })
      return { error }
    }),
}

// ----------------------------------------------------------------------------
// Full download — used right after login
// ----------------------------------------------------------------------------

export interface CloudSnapshot {
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
}

export const fetchSnapshot = async (): Promise<CloudSnapshot> => {
  const [
    products,
    brands,
    categories,
    units,
    clients,
    suppliers,
    purchases,
    sales,
    sheets,
    productions,
    workers,
    workerRoles,
    expenses,
    caisse,
    settings,
  ] = await Promise.all([
    supabase.from('products').select('*').order('created_at', { ascending: false }),
    supabase.from('brands').select('name').order('name'),
    supabase.from('categories').select('name').order('name'),
    supabase.from('measure_units').select('name').order('name'),
    supabase.from('clients').select('*').order('created_at', { ascending: false }),
    supabase.from('suppliers').select('*').order('created_at', { ascending: false }),
    supabase
      .from('purchases')
      .select('*, purchase_lines(*), purchase_payments(*)')
      .order('date', { ascending: false }),
    supabase.from('sales').select('*, sale_lines(*), sale_payments(*)').order('date', { ascending: false }),
    supabase
      .from('tech_sheets')
      .select('*, tech_sheet_lines(*)')
      .order('created_at', { ascending: false }),
    supabase
      .from('productions')
      .select('*, production_lines(*)')
      .order('date', { ascending: false }),
    supabase
      .from('workers')
      .select('*, worker_advances(*), worker_absences(*), worker_payments(*)')
      .order('created_at', { ascending: false }),
    supabase.from('worker_roles').select('name').order('name'),
    supabase.from('expenses').select('*').order('date', { ascending: false }),
    supabase.from('caisse_transactions').select('*').order('date', { ascending: false }),
    supabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
  ])

  const firstError = [
    products.error,
    clients.error,
    suppliers.error,
    purchases.error,
    sales.error,
    workers.error,
    expenses.error,
    caisse.error,
  ].find(Boolean)
  if (firstError) throw firstError

  // The production module ships after the first release: a project whose SQL
  // migration has not been applied yet simply reports no fiches / no batches
  // instead of blocking the whole download.
  if (sheets.error) swallow('fetch.tech_sheets', sheets.error)
  if (productions.error) swallow('fetch.productions', productions.error)
  if (units.error) swallow('fetch.measure_units', units.error)

  return {
    products: (products.data ?? []).map(rowToProduct),
    brands: (brands.data ?? []).map((r: Row) => r.name),
    categories: (categories.data ?? []).map((r: Row) => r.name),
    units: (units.data ?? []).map((r: Row) => r.name),
    clients: (clients.data ?? []).map(rowToClient),
    suppliers: (suppliers.data ?? []).map(rowToSupplier),
    purchases: (purchases.data ?? []).map(rowToPurchase),
    sales: (sales.data ?? []).map(rowToSale),
    sheets: (sheets.data ?? []).map(rowToTechSheet),
    productions: (productions.data ?? []).map(rowToProduction),
    workers: (workers.data ?? []).map(rowToWorker),
    workerRoles: (workerRoles.data ?? []).map((r: Row) => r.name),
    expenses: (expenses.data ?? []).map(rowToExpense),
    caisse: (caisse.data ?? []).map(rowToCaisse),
    settings: settings.data ? rowToSettings(settings.data) : null,
  }
}

// ----------------------------------------------------------------------------
// First-run migration — send the local (localStorage) data to a fresh project
// ----------------------------------------------------------------------------

export interface LocalSnapshot {
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
  settings: StoreSettings
}

/** Uploads everything that only lives in the browser. Safe to call twice. */
export const uploadLocalSnapshot = async (local: LocalSnapshot): Promise<void> => {
  const chunk = async (label: string, fn: () => PromiseLike<{ error: unknown }>) => {
    const { error } = await fn()
    if (error) swallow(`upload.${label}`, error)
  }

  if (local.brands.length)
    await chunk('brands', () => supabase.from('brands').upsert(local.brands.map((name) => ({ name }))))
  if (local.categories.length)
    await chunk('categories', () =>
      supabase.from('categories').upsert(local.categories.map((name) => ({ name }))),
    )
  if (local.units.length)
    await chunk('measure_units', () =>
      supabase.from('measure_units').upsert(local.units.map((name) => ({ name }))),
    )
  if (local.workerRoles.length)
    await chunk('worker_roles', () =>
      supabase.from('worker_roles').upsert(local.workerRoles.map((name) => ({ name }))),
    )
  if (local.suppliers.length)
    await chunk('suppliers', () => supabase.from('suppliers').upsert(local.suppliers.map(supplierToRow)))
  if (local.clients.length)
    await chunk('clients', () => supabase.from('clients').upsert(local.clients.map(clientToRow)))
  if (local.products.length)
    await chunk('products', () => supabase.from('products').upsert(local.products.map(productToRow)))
  if (local.workers.length)
    await chunk('workers', () => supabase.from('workers').upsert(local.workers.map(workerToRow)))

  for (const w of local.workers) {
    if (w.advances.length)
      await chunk('worker_advances', () =>
        supabase.from('worker_advances').upsert(
          w.advances.map((a) => ({
            id: a.id,
            worker_id: w.id,
            date: iso(a.date),
            description: a.description ?? '',
            amount: a.amount,
            deducted: !!a.deducted,
          })),
        ),
      )
    if (w.absences.length)
      await chunk('worker_absences', () =>
        supabase.from('worker_absences').upsert(
          w.absences.map((a) => ({
            id: a.id,
            worker_id: w.id,
            date: iso(a.date),
            description: a.description ?? '',
            cost: a.cost,
          })),
        ),
      )
    if (w.payments.length)
      await chunk('worker_payments', () =>
        supabase.from('worker_payments').upsert(
          w.payments.map((p) => ({
            id: p.id,
            worker_id: w.id,
            period: p.period,
            base_salary: p.baseSalary,
            absences_deducted: p.absencesDeducted,
            advances_deducted: p.advancesDeducted,
            amount: p.amount,
            date: iso(p.date),
            note: p.note ?? null,
          })),
        ),
      )
  }

  if (local.expenses.length)
    await chunk('expenses', () => supabase.from('expenses').upsert(local.expenses.map(expenseToRow)))
  if (local.caisse.length)
    await chunk('caisse', () =>
      supabase.from('caisse_transactions').upsert(local.caisse.map(caisseToRow)),
    )

  await uploadProduction(local, chunk)

  // purchases / sales : headers, then children (the stock is already correct
  // locally, so we insert the documents as-is instead of replaying the RPCs)
  for (const p of local.purchases) {
    await chunk('purchases', () =>
      supabase.from('purchases').upsert({
        id: p.id,
        reference: p.reference,
        supplier_id: p.supplierId,
        supplier_name: p.supplierName,
        total: p.total,
        paid: p.paid,
        date: iso(p.date),
        created_at: iso(p.createdAt),
      }),
    )
    await supabase.from('purchase_lines').delete().eq('purchase_id', p.id)
    if (p.lines.length)
      await chunk('purchase_lines', () =>
        supabase.from('purchase_lines').insert(p.lines.map((l) => purchaseLineToRow(p.id, l))),
      )
    if (p.payments.length)
      await chunk('purchase_payments', () =>
        supabase.from('purchase_payments').upsert(
          p.payments.map((pay) => ({
            id: pay.id,
            purchase_id: p.id,
            amount: pay.amount,
            date: iso(pay.date),
            note: pay.note ?? null,
          })),
        ),
      )
  }

  for (const s of local.sales) {
    await chunk('sales', () =>
      supabase.from('sales').upsert({
        id: s.id,
        reference: s.reference,
        client_id: s.clientId,
        client_name: s.clientName,
        subtotal: s.subtotal,
        discount: s.discount,
        total: s.total,
        paid: s.paid,
        date: iso(s.date),
        created_at: iso(s.createdAt),
      }),
    )
    await supabase.from('sale_lines').delete().eq('sale_id', s.id)
    if (s.lines.length)
      await chunk('sale_lines', () =>
        supabase.from('sale_lines').insert(
          s.lines.map((l) => ({
            sale_id: s.id,
            product_id: l.productId || null,
            product_name: l.productName,
            barcode: l.barcode ?? '',
            quantity: l.quantity,
            unit_price: l.unitPrice,
            kind: l.kind ?? 'product',
            unit: l.unit ?? '',
            production_id: l.productionId ?? null,
            cost_price:
              l.unitCost ?? local.products.find((p) => p.id === l.productId)?.purchasePrice ?? 0,
          })),
        ),
      )
    if (s.payments.length)
      await chunk('sale_payments', () =>
        supabase.from('sale_payments').upsert(
          s.payments.map((pay) => ({
            id: pay.id,
            sale_id: s.id,
            amount: pay.amount,
            date: iso(pay.date),
            note: pay.note ?? null,
          })),
        ),
      )
  }

  if (local.settings && (local.settings.name || local.settings.phone || local.settings.logo))
    await chunk('settings', () => supabase.from('store_settings').upsert(settingsToRow(local.settings)))
}

/**
 * Fiches techniques and manufactured batches. Uploaded BEFORE the sales, whose
 * lines may point at a batch. The stock is already correct locally, so the rows
 * are inserted as-is instead of replaying create_production().
 */
const uploadProduction = async (
  local: LocalSnapshot,
  chunk: (label: string, fn: () => PromiseLike<{ error: unknown }>) => Promise<void>,
): Promise<void> => {
  for (const s of local.sheets) {
    await chunk('tech_sheets', () =>
      supabase.from('tech_sheets').upsert({
        id: s.id,
        name: s.name,
        description: s.description ?? '',
        output_name: s.outputName ?? '',
        output_quantity: s.outputQuantity ?? 0,
        output_unit_price: s.outputUnitPrice ?? 0,
        created_at: iso(s.createdAt),
      }),
    )
    await supabase.from('tech_sheet_lines').delete().eq('sheet_id', s.id)
    if (s.lines.length)
      await chunk('tech_sheet_lines', () =>
        supabase
          .from('tech_sheet_lines')
          .insert(s.lines.map((l, i) => ({ sheet_id: s.id, ...recipeLineToRow(l, i) }))),
      )
  }

  for (const p of local.productions) {
    await chunk('productions', () =>
      supabase.from('productions').upsert({
        id: p.id,
        reference: p.reference,
        sheet_id: p.sheetId,
        sheet_name: p.sheetName ?? '',
        output_name: p.outputName ?? '',
        output_quantity: p.outputQuantity ?? 0,
        output_unit_price: p.outputUnitPrice ?? 0,
        total_cost: p.totalCost ?? 0,
        total_revenue: p.totalRevenue ?? 0,
        gain: p.gain ?? 0,
        sold_quantity: p.soldQuantity ?? 0,
        status: p.status ?? 'active',
        date: iso(p.date),
        created_at: iso(p.createdAt),
      }),
    )
    await supabase.from('production_lines').delete().eq('production_id', p.id)
    if (p.lines.length)
      await chunk('production_lines', () =>
        supabase
          .from('production_lines')
          .insert(p.lines.map((l, i) => ({ production_id: p.id, ...recipeLineToRow(l, i) }))),
      )
  }
}
