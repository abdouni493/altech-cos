import type {
  Sale,
  SaleLine,
  Purchase,
  Worker,
  Expense,
  Product,
  CaisseTransaction,
  Production,
} from '@/types'
import { round2, monthKey } from './helpers'
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  subMonths,
  format,
} from 'date-fns'

export const remaining = (total: number, paid: number): number => round2(Math.max(0, total - paid))

export interface PartyStats {
  totalAmount: number
  totalPaid: number
  totalDebt: number
  count: number
}

export const clientStats = (clientId: string, sales: Sale[]): PartyStats => {
  const list = sales.filter((s) => s.clientId === clientId)
  const totalAmount = round2(list.reduce((s, x) => s + x.total, 0))
  const totalPaid = round2(list.reduce((s, x) => s + x.paid, 0))
  return { totalAmount, totalPaid, totalDebt: remaining(totalAmount, totalPaid), count: list.length }
}

export const supplierStats = (supplierId: string, purchases: Purchase[]): PartyStats => {
  const list = purchases.filter((p) => p.supplierId === supplierId)
  const totalAmount = round2(list.reduce((s, x) => s + x.total, 0))
  const totalPaid = round2(list.reduce((s, x) => s + x.paid, 0))
  return { totalAmount, totalPaid, totalDebt: remaining(totalAmount, totalPaid), count: list.length }
}

const inRange = (dateStr: string, start: Date, end: Date): boolean => {
  const d = new Date(dateStr)
  return isWithinInterval(d, { start, end })
}

export const sumSales = (sales: Sale[], start: Date, end: Date): number =>
  round2(sales.filter((s) => inRange(s.date, start, end)).reduce((acc, s) => acc + s.total, 0))

export const sumPurchases = (purchases: Purchase[], start: Date, end: Date): number =>
  round2(purchases.filter((p) => inRange(p.date, start, end)).reduce((acc, p) => acc + p.total, 0))

export const sumExpenses = (expenses: Expense[], start: Date, end: Date): number =>
  round2(expenses.filter((e) => inRange(e.date, start, end)).reduce((acc, e) => acc + e.amount, 0))

export const sumSalaries = (workers: Worker[], start: Date, end: Date): number =>
  round2(
    workers.reduce(
      (acc, w) => acc + w.payments.filter((p) => inRange(p.date, start, end)).reduce((s, p) => s + p.amount, 0),
      0,
    ),
  )

// ----------------------------------------------------------------------------
// Caisse (Treasury / Cash register)
// ----------------------------------------------------------------------------

/** Sum the cash actually collected on sales whose date falls in range. */
export const sumSalesPaid = (sales: Sale[], start: Date, end: Date): number =>
  round2(sales.filter((s) => inRange(s.date, start, end)).reduce((acc, s) => acc + s.paid, 0))

/** Sum the cash actually disbursed on purchases whose date falls in range. */
export const sumPurchasesPaid = (purchases: Purchase[], start: Date, end: Date): number =>
  round2(purchases.filter((p) => inRange(p.date, start, end)).reduce((acc, p) => acc + p.paid, 0))

export const sumCaisse = (
  transactions: CaisseTransaction[],
  type: 'deposit' | 'withdrawal',
  start: Date,
  end: Date,
): number =>
  round2(
    transactions
      .filter((t) => t.type === type && inRange(t.date, start, end))
      .reduce((acc, t) => acc + t.amount, 0),
  )

export interface CaissePeriodStats {
  /** Total invoiced sales (billed). */
  salesTotal: number
  /** Cash collected from sales. */
  salesCollected: number
  /** Total invoiced purchases (billed). */
  purchasesTotal: number
  /** Cash disbursed for purchases. */
  purchasesPaid: number
  expenses: number
  salaries: number
  deposits: number
  withdrawals: number
  /** Money entering the caisse: sales collected + manual deposits. */
  cashIn: number
  /** Money leaving the caisse: purchases paid + expenses + salaries + withdrawals. */
  cashOut: number
  /** cashIn − cashOut. */
  netFlow: number
}

/** Aggregate every cash movement of the store over a date range. */
export const caissePeriodStats = (
  transactions: CaisseTransaction[],
  sales: Sale[],
  purchases: Purchase[],
  expenses: Expense[],
  workers: Worker[],
  start: Date,
  end: Date,
): CaissePeriodStats => {
  const salesTotal = sumSales(sales, start, end)
  const salesCollected = sumSalesPaid(sales, start, end)
  const purchasesTotal = sumPurchases(purchases, start, end)
  const purchasesPaid = sumPurchasesPaid(purchases, start, end)
  const expensesSum = sumExpenses(expenses, start, end)
  const salaries = sumSalaries(workers, start, end)
  const deposits = sumCaisse(transactions, 'deposit', start, end)
  const withdrawals = sumCaisse(transactions, 'withdrawal', start, end)
  const cashIn = round2(salesCollected + deposits)
  const cashOut = round2(purchasesPaid + expensesSum + salaries + withdrawals)
  return {
    salesTotal,
    salesCollected,
    purchasesTotal,
    purchasesPaid,
    expenses: expensesSum,
    salaries,
    deposits,
    withdrawals,
    cashIn,
    cashOut,
    netFlow: round2(cashIn - cashOut),
  }
}

export interface StoreWealth {
  /** All-time cash balance held in the caisse. */
  caisseBalance: number
  /** Purchase-cost value of everything currently in stock. */
  stockValue: number
  /** Cost value of the finished batches still waiting to be sold. */
  productionValue: number
  /** Money clients still owe the store. */
  clientReceivables: number
  /** Money the store still owes suppliers. */
  supplierPayables: number
  /** caisse + stock + production + receivables − payables. */
  totalWealth: number
}

const VERY_EARLY = new Date(0)
const VERY_LATE = new Date(8640000000000000)

/** Compute the global financial snapshot of the store (date-independent). */
export const storeWealth = (
  transactions: CaisseTransaction[],
  sales: Sale[],
  purchases: Purchase[],
  expenses: Expense[],
  workers: Worker[],
  products: Product[],
  productions: Production[] = [],
): StoreWealth => {
  const all = caissePeriodStats(transactions, sales, purchases, expenses, workers, VERY_EARLY, VERY_LATE)
  const caisseBalance = all.netFlow
  // Sealed units + the content still inside an opened container.
  const stockValue = round2(
    products.reduce((s, p) => {
      const base = p.quantity * p.purchasePrice
      const open =
        p.isDivisible && (p.capacity ?? 0) > 0
          ? ((p.openRemaining ?? 0) / (p.capacity ?? 1)) * p.purchasePrice
          : 0
      return s + base + open
    }, 0),
  )
  const productionValue = productionStockValue(productions)
  const clientReceivables = round2(sales.reduce((s, x) => s + Math.max(0, x.total - x.paid), 0))
  const supplierPayables = round2(purchases.reduce((s, x) => s + Math.max(0, x.total - x.paid), 0))
  return {
    caisseBalance,
    stockValue,
    productionValue,
    clientReceivables,
    supplierPayables,
    totalWealth: round2(
      caisseBalance + stockValue + productionValue + clientReceivables - supplierPayables,
    ),
  }
}

// ----------------------------------------------------------------------------
// Production analytics
// ----------------------------------------------------------------------------

/** Finished units of a batch still available for sale. */
export const productionRemaining = (p: Production): number =>
  p.status === 'recovered' ? 0 : Math.max(0, round2(p.outputQuantity - p.soldQuantity))

/** Cost of ONE finished unit of a batch. */
export const productionUnitCost = (p: Production): number =>
  p.outputQuantity > 0 ? round2(p.totalCost / p.outputQuantity) : 0

/** Cost value of everything produced but not sold yet. */
export const productionStockValue = (productions: Production[]): number =>
  round2(
    productions.reduce((s, p) => s + productionRemaining(p) * productionUnitCost(p), 0),
  )

export interface ProductionStats {
  /** Batches manufactured in the period. */
  count: number
  /** Finished units manufactured. */
  producedUnits: number
  /** Raw material consumed, at purchase cost. */
  totalCost: number
  /** What the whole output would bring in once entirely sold. */
  expectedRevenue: number
  /** expectedRevenue − totalCost. */
  expectedGain: number
  /** Units already sold at the POS. */
  soldUnits: number
  /** Cash value of the units already sold. */
  soldRevenue: number
  /** Margin actually realised on the units sold. */
  realisedGain: number
  /** Units still in the workshop. */
  remainingUnits: number
  /** Cost value of those remaining units. */
  remainingValue: number
  /** Batches whose components went back to the stock. */
  recoveredCount: number
}

export const periodProductions = (productions: Production[], start: Date, end: Date): Production[] =>
  productions
    .filter((p) => inRange(p.date, start, end))
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))

export const productionStats = (list: Production[]): ProductionStats => {
  const active = list.filter((p) => p.status !== 'recovered')
  const soldUnits = round2(active.reduce((s, p) => s + p.soldQuantity, 0))
  const soldRevenue = round2(active.reduce((s, p) => s + p.soldQuantity * p.outputUnitPrice, 0))
  const soldCost = round2(active.reduce((s, p) => s + p.soldQuantity * productionUnitCost(p), 0))
  return {
    count: list.length,
    producedUnits: round2(active.reduce((s, p) => s + p.outputQuantity, 0)),
    totalCost: round2(active.reduce((s, p) => s + p.totalCost, 0)),
    expectedRevenue: round2(active.reduce((s, p) => s + p.totalRevenue, 0)),
    expectedGain: round2(active.reduce((s, p) => s + p.gain, 0)),
    soldUnits,
    soldRevenue,
    realisedGain: round2(soldRevenue - soldCost),
    remainingUnits: round2(active.reduce((s, p) => s + productionRemaining(p), 0)),
    remainingValue: productionStockValue(active),
    recoveredCount: list.filter((p) => p.status === 'recovered').length,
  }
}

export interface ProductionComponentAgg {
  productId: string
  name: string
  unit?: string
  quantity: number
  cost: number
}

/** Every raw material eaten by the batches of a period, grouped by product. */
export const periodProductionComponents = (
  productions: Production[],
  start: Date,
  end: Date,
): ProductionComponentAgg[] => {
  const map = new Map<string, ProductionComponentAgg>()
  periodProductions(productions, start, end)
    .filter((p) => p.status !== 'recovered')
    .forEach((p) =>
      p.lines.forEach((l) => {
        const cur =
          map.get(l.productId) ??
          { productId: l.productId, name: l.productName, unit: l.byContent ? l.unit : undefined, quantity: 0, cost: 0 }
        cur.quantity = round2(cur.quantity + l.quantity)
        cur.cost = round2(cur.cost + l.quantity * l.unitCost)
        map.set(l.productId, cur)
      }),
    )
  return [...map.values()].sort((a, b) => b.cost - a.cost)
}

export interface DashboardStats {
  revenueToday: number
  revenueMonth: number
  productsInStock: number
  stockAlertCount: number
  purchasesMonth: number
  expensesMonth: number
  netProfit: number
  salariesMonth: number
}

export const dashboardStats = (
  sales: Sale[],
  purchases: Purchase[],
  expenses: Expense[],
  products: Product[],
  workers: Worker[],
): DashboardStats => {
  const now = new Date()
  const dayStart = startOfDay(now)
  const dayEnd = endOfDay(now)
  const monStart = startOfMonth(now)
  const monEnd = endOfMonth(now)

  const revenueMonth = sumSales(sales, monStart, monEnd)
  const purchasesMonth = sumPurchases(purchases, monStart, monEnd)
  const expensesMonth = sumExpenses(expenses, monStart, monEnd)
  const salariesMonth = sumSalaries(workers, monStart, monEnd)

  return {
    revenueToday: sumSales(sales, dayStart, dayEnd),
    revenueMonth,
    productsInStock: products.reduce((s, p) => s + p.quantity, 0),
    stockAlertCount: products.filter((p) => p.quantity <= p.minQuantity).length,
    purchasesMonth,
    expensesMonth,
    salariesMonth,
    netProfit: round2(revenueMonth - purchasesMonth - expensesMonth - salariesMonth),
  }
}

export interface MonthPoint {
  month: string
  sales: number
  purchases: number
  expenses: number
}

export const last12Months = (
  sales: Sale[],
  purchases: Purchase[],
  expenses: Expense[],
): MonthPoint[] => {
  const points: MonthPoint[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const ref = subMonths(now, i)
    const start = startOfMonth(ref)
    const end = endOfMonth(ref)
    points.push({
      month: format(ref, 'MMM yy'),
      sales: sumSales(sales, start, end),
      purchases: sumPurchases(purchases, start, end),
      expenses: sumExpenses(expenses, start, end),
    })
  }
  return points
}

export interface ProductSalesAgg {
  productId: string
  name: string
  quantity: number
  amount: number
}

export const topProducts = (sales: Sale[], limit = 5): ProductSalesAgg[] => {
  const map = new Map<string, ProductSalesAgg>()
  sales.forEach((sale) =>
    sale.lines.forEach((l) => {
      const cur = map.get(l.productId) ?? { productId: l.productId, name: l.productName, quantity: 0, amount: 0 }
      cur.quantity += l.quantity
      cur.amount += l.quantity * l.unitPrice
      map.set(l.productId, cur)
    }),
  )
  return [...map.values()].sort((a, b) => b.quantity - a.quantity).slice(0, limit)
}

// ----------------------------------------------------------------------------
// Per-product & per-category analytics (used by Caisse + Reports)
// ----------------------------------------------------------------------------

const productIndex = (products: Product[]): Map<string, Product> =>
  new Map(products.map((p) => [p.id, p]))

export interface ProductPurchaseAgg {
  productId: string
  name: string
  category: string
  quantity: number
  total: number
}

/** Aggregate every purchase LINE whose purchase falls in range, grouped by product. */
export const periodPurchasedProducts = (
  purchases: Purchase[],
  products: Product[],
  start: Date,
  end: Date,
): ProductPurchaseAgg[] => {
  const idx = productIndex(products)
  const map = new Map<string, ProductPurchaseAgg>()
  purchases
    .filter((p) => inRange(p.date, start, end))
    .forEach((p) =>
      p.lines.forEach((l) => {
        const cur =
          map.get(l.productId) ??
          { productId: l.productId, name: l.productName, category: idx.get(l.productId)?.category ?? '—', quantity: 0, total: 0 }
        cur.quantity += l.quantity
        cur.total = round2(cur.total + l.quantity * l.purchasePrice)
        map.set(l.productId, cur)
      }),
    )
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export interface ProductSaleAgg {
  productId: string
  name: string
  category: string
  quantity: number
  revenue: number
  cost: number
  gain: number
}

/**
 * Cost of one step of a sale line. Lines carry the cost captured at sale time
 * (exact even if prices moved since, and the only correct figure for a retail
 * portion or a production output); the product is only a fallback for the
 * documents saved before that snapshot existed.
 */
export const lineUnitCost = (line: SaleLine, product?: Product): number => {
  if (line.unitCost !== undefined && line.unitCost !== null) return line.unitCost
  if (line.kind === 'retail' && product && (product.capacity ?? 0) > 0)
    return round2(product.purchasePrice / (product.capacity ?? 1))
  return product?.purchasePrice ?? 0
}

/** Key a sale line aggregates under — production batches have no product id. */
const lineKey = (line: SaleLine): string =>
  line.kind === 'production' ? `prod:${line.productionId ?? line.productName}` : line.productId

/** Aggregate every sale LINE whose sale falls in range, grouped by product (with margin). */
export const periodSoldProducts = (
  sales: Sale[],
  products: Product[],
  start: Date,
  end: Date,
): ProductSaleAgg[] => {
  const idx = productIndex(products)
  const map = new Map<string, ProductSaleAgg>()
  sales
    .filter((s) => inRange(s.date, start, end))
    .forEach((s) =>
      s.lines.forEach((l) => {
        const key = lineKey(l)
        const prod = idx.get(l.productId)
        const category =
          l.kind === 'production' ? 'Production' : prod?.category ?? '—'
        const label =
          l.kind === 'retail' && l.unit ? `${l.productName} (${l.unit})` : l.productName
        const cur =
          map.get(key) ??
          { productId: key, name: label, category, quantity: 0, revenue: 0, cost: 0, gain: 0 }
        const lineRevenue = l.quantity * l.unitPrice
        const lineCost = l.quantity * lineUnitCost(l, prod)
        cur.quantity = round2(cur.quantity + l.quantity)
        cur.revenue = round2(cur.revenue + lineRevenue)
        cur.cost = round2(cur.cost + lineCost)
        cur.gain = round2(cur.revenue - cur.cost)
        map.set(key, cur)
      }),
    )
  return [...map.values()].sort((a, b) => b.quantity - a.quantity)
}

/**
 * Velocity table over a period: EVERY product, including those never sold,
 * sorted by quantity sold. Lets a view slice fast movers (top) and slow / dead
 * stock (bottom) from one list.
 */
export const productSalesAnalysis = (
  sales: Sale[],
  products: Product[],
  start: Date,
  end: Date,
): ProductSaleAgg[] => {
  const sold = new Map(periodSoldProducts(sales, products, start, end).map((r) => [r.productId, r]))
  return products
    .map(
      (p) =>
        sold.get(p.id) ?? {
          productId: p.id,
          name: p.name,
          category: p.category,
          quantity: 0,
          revenue: 0,
          cost: 0,
          gain: 0,
        },
    )
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
}

export interface CategoryAgg {
  category: string
  qtySold: number
  salesRevenue: number
  salesCost: number
  gain: number
  qtyPurchased: number
  purchasesCost: number
}

/** Per-category sales, purchases and realised gain over a date range. */
export const categoryBreakdown = (
  sales: Sale[],
  purchases: Purchase[],
  products: Product[],
  start: Date,
  end: Date,
): CategoryAgg[] => {
  const map = new Map<string, CategoryAgg>()
  const blank = (category: string): CategoryAgg => ({
    category,
    qtySold: 0,
    salesRevenue: 0,
    salesCost: 0,
    gain: 0,
    qtyPurchased: 0,
    purchasesCost: 0,
  })

  periodSoldProducts(sales, products, start, end).forEach((r) => {
    const cur = map.get(r.category) ?? blank(r.category)
    cur.qtySold += r.quantity
    cur.salesRevenue = round2(cur.salesRevenue + r.revenue)
    cur.salesCost = round2(cur.salesCost + r.cost)
    cur.gain = round2(cur.salesRevenue - cur.salesCost)
    map.set(r.category, cur)
  })

  periodPurchasedProducts(purchases, products, start, end).forEach((r) => {
    const cur = map.get(r.category) ?? blank(r.category)
    cur.qtyPurchased += r.quantity
    cur.purchasesCost = round2(cur.purchasesCost + r.total)
    map.set(r.category, cur)
  })

  return [...map.values()].sort((a, b) => b.salesRevenue - a.salesRevenue)
}

// ----------------------------------------------------------------------------
// Worker cash movements (advances / payments / absences) over a period
// ----------------------------------------------------------------------------

export interface WorkerMovement {
  id: string
  workerId: string
  workerName: string
  role: string
  date: string
  description: string
  amount: number
}

export interface PeriodWorkerMovements {
  advances: WorkerMovement[]
  payments: WorkerMovement[]
  absences: WorkerMovement[]
  totalAdvances: number
  totalPayments: number
  totalAbsences: number
}

export const periodWorkerMovements = (
  workers: Worker[],
  start: Date,
  end: Date,
): PeriodWorkerMovements => {
  const advances: WorkerMovement[] = []
  const payments: WorkerMovement[] = []
  const absences: WorkerMovement[] = []
  workers.forEach((w) => {
    w.advances
      .filter((a) => inRange(a.date, start, end))
      .forEach((a) =>
        advances.push({ id: a.id, workerId: w.id, workerName: w.fullName, role: w.role, date: a.date, description: a.description, amount: a.amount }),
      )
    w.payments
      .filter((p) => inRange(p.date, start, end))
      .forEach((p) =>
        payments.push({ id: p.id, workerId: w.id, workerName: w.fullName, role: w.role, date: p.date, description: p.note ?? p.period, amount: p.amount }),
      )
    w.absences
      .filter((a) => inRange(a.date, start, end))
      .forEach((a) =>
        absences.push({ id: a.id, workerId: w.id, workerName: w.fullName, role: w.role, date: a.date, description: a.description, amount: a.cost }),
      )
  })
  const sortDesc = (a: WorkerMovement, b: WorkerMovement) => +new Date(b.date) - +new Date(a.date)
  advances.sort(sortDesc)
  payments.sort(sortDesc)
  absences.sort(sortDesc)
  return {
    advances,
    payments,
    absences,
    totalAdvances: round2(advances.reduce((s, x) => s + x.amount, 0)),
    totalPayments: round2(payments.reduce((s, x) => s + x.amount, 0)),
    totalAbsences: round2(absences.reduce((s, x) => s + x.amount, 0)),
  }
}

export interface ClientAgg {
  clientId: string
  name: string
  amount: number
}

export const topClients = (sales: Sale[], limit = 5): ClientAgg[] => {
  const map = new Map<string, ClientAgg>()
  sales.forEach((s) => {
    if (!s.clientId) return
    const cur = map.get(s.clientId) ?? { clientId: s.clientId, name: s.clientName, amount: 0 }
    cur.amount += s.total
    map.set(s.clientId, cur)
  })
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit)
}

/** Compute a worker's payable salary for a given month key (YYYY-MM). */
export const computeSalary = (worker: Worker, period: string) => {
  const base =
    worker.salaryType === 'monthly' ? worker.salaryAmount : worker.salaryAmount * 26 // ~26 working days
  const absences = round2(
    worker.absences.filter((a) => monthKey(a.date) === period).reduce((s, a) => s + a.cost, 0),
  )
  const advances = round2(worker.advances.filter((a) => !a.deducted).reduce((s, a) => s + a.amount, 0))
  const toPay = round2(Math.max(0, base - absences - advances))
  return { base, absences, advances, toPay }
}
