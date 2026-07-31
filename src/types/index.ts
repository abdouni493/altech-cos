// ============================================================================
// Belle Cosmétiques — Core domain types
// ============================================================================

export type Lang = 'fr' | 'ar'

export type PaymentStatus = 'paid' | 'partial' | 'unpaid'

// ----------------------------------------------------------------------------
// Auth / Users
// ----------------------------------------------------------------------------

export interface AppUser {
  id: string
  fullName: string
  username: string
  email: string
  password: string
  role: string
  permissions: Permissions | 'ALL'
  isDemo?: boolean
}

/** A permission set: which modules are enabled and which actions inside them. */
export type ModuleKey =
  | 'dashboard'
  | 'stock'
  | 'purchase'
  | 'production'
  | 'pos'
  | 'sales'
  | 'clients'
  | 'suppliers'
  | 'workers'
  | 'expenses'
  | 'caisse'
  | 'reports'
  | 'settings'

export type ActionKey = 'view' | 'create' | 'edit' | 'delete' | 'print' | 'pay'

export type Permissions = {
  [key in ModuleKey]?: {
    enabled: boolean
    actions: ActionKey[]
  }
}

// ----------------------------------------------------------------------------
// Products / Stock
// ----------------------------------------------------------------------------

export interface Product {
  id: string
  name: string
  description: string
  barcode: string
  brand: string
  category: string
  purchasePrice: number
  salePrice: number
  quantity: number // current quantity in stock (sealed / whole units)
  minQuantity: number // alert threshold
  hasExpiration?: boolean // whether this product tracks an expiration date
  expirationDate?: string // ISO / YYYY-MM-DD date when the product expires
  // -- Retail ("vente au détail") ---------------------------------------------
  // A perfume bottle holds 100 ml and is also sold by 10 ml portions: the unit
  // is the container, `capacity` its content, `openRemaining` what is left in
  // the container currently opened at the counter.
  /** Whether this product can be sold by fractions of one unit. */
  isDivisible?: boolean
  /** Measure unit of the content — ml, g, L… */
  unit?: string
  /** Content of ONE whole unit, e.g. 100 (ml). */
  capacity?: number
  /** Reference portion sold at the counter, e.g. 10 (ml). */
  retailStep?: number
  /** Price charged for one `retailStep` portion, e.g. 1000 DA for 10 ml. */
  retailPrice?: number
  /** Content still available inside the currently opened unit. */
  openRemaining?: number
  createdAt: string
}

// ----------------------------------------------------------------------------
// Purchases
// ----------------------------------------------------------------------------

export interface PurchaseLine {
  productId: string
  productName: string
  barcode: string
  quantity: number
  purchasePrice: number
  salePrice: number
  minQuantity: number
  hasExpiration?: boolean
  expirationDate?: string
  /** Retail settings pushed onto the product when the purchase is saved. */
  isDivisible?: boolean
  unit?: string
  capacity?: number
  retailStep?: number
  retailPrice?: number
}

export interface Payment {
  id: string
  amount: number
  date: string
  note?: string
}

export interface Purchase {
  id: string
  reference: string
  supplierId: string | null
  supplierName: string
  lines: PurchaseLine[]
  total: number
  paid: number
  payments: Payment[]
  date: string
  createdAt: string
}

// ----------------------------------------------------------------------------
// Sales
// ----------------------------------------------------------------------------

/**
 * `product`    — a whole unit taken from the stock.
 * `retail`     — a fraction of a divisible product; `quantity` is expressed in
 *                `unit` (ml, g…) and `unitPrice` is the price of ONE `unit`.
 * `production` — a finished item coming out of a production batch.
 */
export type SaleLineKind = 'product' | 'retail' | 'production'

export interface SaleLine {
  productId: string
  productName: string
  barcode: string
  quantity: number
  unitPrice: number
  kind?: SaleLineKind
  /** Measure unit of `quantity` for retail lines. */
  unit?: string
  /** Cost of one `quantity` step, captured at sale time (exact margins). */
  unitCost?: number
  /** Batch this line was served from, for `production` lines. */
  productionId?: string
}

export interface Sale {
  id: string
  reference: string
  clientId: string | null
  clientName: string
  lines: SaleLine[]
  subtotal: number
  discount: number
  total: number
  paid: number
  payments: Payment[]
  date: string
  createdAt: string
}

// ----------------------------------------------------------------------------
// Production — technical sheets (recipes) & manufactured batches
// ----------------------------------------------------------------------------

/** One ingredient of a recipe: a stock product and the quantity it consumes. */
export interface RecipeLine {
  productId: string
  productName: string
  /**
   * Quantity consumed per batch. Whole units for a normal product, content
   * (ml, g…) when the product is divisible and `byContent` is true.
   */
  quantity: number
  /** Cost of ONE `quantity` step (one unit, or one ml for content lines). */
  unitCost: number
  /** True when the recipe eats the CONTENT of a divisible product. */
  byContent?: boolean
  /** Measure unit shown next to the quantity for content lines. */
  unit?: string
}

/**
 * A "fiche technique": the recipe of a finished article. Creating one never
 * touches the stock — it only describes what a batch would consume and yield.
 */
export interface TechSheet {
  id: string
  name: string
  description: string
  /** Name of the article produced (defaults to the sheet name). */
  outputName: string
  /** How many finished units one batch yields. */
  outputQuantity: number
  /** Sale price of one finished unit. */
  outputUnitPrice: number
  lines: RecipeLine[]
  createdAt: string
}

export type ProductionStatus = 'active' | 'recovered'

/** A batch actually manufactured — this one DOES consume the stock. */
export interface Production {
  id: string
  reference: string
  sheetId: string | null
  sheetName: string
  outputName: string
  outputQuantity: number
  outputUnitPrice: number
  lines: RecipeLine[]
  totalCost: number
  totalRevenue: number
  gain: number
  /** Finished units already sold at the POS. */
  soldQuantity: number
  /** `recovered` = the components were given back to the stock. */
  status: ProductionStatus
  date: string
  createdAt: string
}

// ----------------------------------------------------------------------------
// Clients
// ----------------------------------------------------------------------------

export interface Client {
  id: string
  name: string
  phone: string
  createdAt: string
}

// ----------------------------------------------------------------------------
// Suppliers
// ----------------------------------------------------------------------------

export interface Supplier {
  id: string
  name: string
  phone: string
  address: string
  createdAt: string
}

// ----------------------------------------------------------------------------
// Workers
// ----------------------------------------------------------------------------

export type SalaryType = 'monthly' | 'daily'

export interface WorkerAdvance {
  id: string
  date: string
  description: string
  amount: number
  deducted: boolean
}

export interface WorkerAbsence {
  id: string
  date: string
  description: string
  cost: number
}

export interface WorkerPayment {
  id: string
  period: string // e.g. "2026-06"
  baseSalary: number
  absencesDeducted: number
  advancesDeducted: number
  amount: number
  date: string
  note?: string
}

export interface Worker {
  id: string
  fullName: string
  birthDate: string
  idCard: string
  phone: string
  role: string
  hasSalary: boolean
  salaryType: SalaryType
  salaryAmount: number
  hasAccount: boolean
  email: string
  username: string
  password: string
  permissions: Permissions
  startDate: string
  active: boolean
  advances: WorkerAdvance[]
  absences: WorkerAbsence[]
  payments: WorkerPayment[]
  createdAt: string
}

// ----------------------------------------------------------------------------
// Expenses
// ----------------------------------------------------------------------------

export interface Expense {
  id: string
  name: string
  description: string
  amount: number
  date: string
  createdAt: string
}

// ----------------------------------------------------------------------------
// Caisse (Treasury / Cash register)
// ----------------------------------------------------------------------------

export type CaisseType = 'deposit' | 'withdrawal'

/** A manual cash movement registered directly in the Caisse. */
export interface CaisseTransaction {
  id: string
  type: CaisseType
  amount: number
  description: string
  date: string
  createdAt: string
}

// ----------------------------------------------------------------------------
// Settings
// ----------------------------------------------------------------------------

export interface StoreSettings {
  logo: string // base64 or empty
  name: string
  description: string
  email: string
  phone: string
  address: string
  nif: string
  nis: string
  article: string
  rc: string
  currency: string
}
