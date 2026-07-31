import type {
  AppUser,
  Client,
  Expense,
  Product,
  Purchase,
  Sale,
  Supplier,
  Worker,
  StoreSettings,
} from '@/types'
import { round2, paymentStatus } from '@/utils/helpers'

export const INITIAL_CATEGORIES = [
  'Maquillage',
  'Soin du visage',
  'Soin du corps',
  'Cheveux',
  'Parfums',
  'Ongles',
]

export const INITIAL_BRANDS = [
  "L'Oréal Paris",
  'Maybelline',
  'Nivea',
  'Garnier',
  'MAC',
  'The Ordinary',
  'Bioderma',
  'Autre',
]

export const DEMO_ADMIN: AppUser = {
  id: 'admin-demo',
  fullName: 'Admin Démo',
  username: 'admin',
  email: 'admin@belle-cosmetiques.com',
  password: 'demo2024',
  role: 'Administrateur',
  permissions: 'ALL',
  isDemo: true,
}

// --- date helpers (relative to "now" so the demo always looks fresh) ---------
const now = new Date()
const iso = (d: Date) => d.toISOString()
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number): string => {
  const d = new Date(now)
  d.setDate(d.getDate() - n)
  return iso(d)
}
const monthsAgo = (n: number, day = 15): string => {
  const d = new Date(now.getFullYear(), now.getMonth() - n, day, 11, 30)
  return iso(d)
}
/** A 'YYYY-MM-DD' date n days from today (negative = in the past). */
const dateInDays = (n: number): string => {
  const d = new Date(now)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

// --- Products ----------------------------------------------------------------
export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Fond de teint "Velvet Matte"',
    description: 'Fond de teint longue tenue fini mat, 30ml, teinte beige naturel.',
    barcode: '6132540098761',
    brand: "L'Oréal Paris",
    category: 'Maquillage',
    purchasePrice: 1200,
    salePrice: 2200,
    quantity: 14,
    minQuantity: 4,
    hasExpiration: true,
    expirationDate: dateInDays(420),
    createdAt: daysAgo(120),
  },
  {
    id: 'p2',
    name: 'Sérum Acide Hyaluronique',
    description: 'Sérum hydratant intense à l\'acide hyaluronique, 30ml.',
    barcode: '6132540098778',
    brand: 'The Ordinary',
    category: 'Soin du visage',
    purchasePrice: 1800,
    salePrice: 3200,
    quantity: 9,
    minQuantity: 3,
    hasExpiration: true,
    expirationDate: dateInDays(-15), // déjà expiré
    createdAt: daysAgo(110),
  },
  {
    id: 'p3',
    name: 'Rouge à lèvres "Rouge Velours"',
    description: 'Rouge à lèvres mat crémeux, pigmentation intense, rouge classique.',
    barcode: '6132540098785',
    brand: 'MAC',
    category: 'Maquillage',
    purchasePrice: 600,
    salePrice: 1300,
    quantity: 22,
    minQuantity: 6,
    hasExpiration: true,
    expirationDate: dateInDays(26), // expire bientôt
    createdAt: daysAgo(100),
  },
  {
    id: 'p4',
    name: 'Crème hydratante visage',
    description: 'Crème hydratante 24h pour peaux sensibles, 50ml.',
    barcode: '6132540098792',
    brand: 'Nivea',
    category: 'Soin du visage',
    purchasePrice: 1500,
    salePrice: 2800,
    quantity: 2,
    minQuantity: 3,
    hasExpiration: true,
    expirationDate: dateInDays(12), // expire bientôt + stock faible
    createdAt: daysAgo(95),
  },
  {
    id: 'p5',
    name: 'Parfum "Nuit de Rose" 50ml',
    description: 'Eau de parfum florale et boisée, vaporisateur 50ml.',
    barcode: '6132540098808',
    brand: 'Autre',
    category: 'Parfums',
    purchasePrice: 4500,
    salePrice: 8500,
    quantity: 7,
    minQuantity: 2,
    hasExpiration: false,
    createdAt: daysAgo(90),
  },
  {
    id: 'p6',
    name: 'Shampoing nourrissant',
    description: 'Shampoing à l\'huile d\'argan pour cheveux secs, 400ml.',
    barcode: '6132540098815',
    brand: 'Garnier',
    category: 'Cheveux',
    purchasePrice: 700,
    salePrice: 1450,
    quantity: 18,
    minQuantity: 5,
    hasExpiration: true,
    expirationDate: dateInDays(540),
    createdAt: daysAgo(80),
  },
  {
    id: 'p7',
    name: 'Mascara "Volume Intense"',
    description: 'Mascara volumateur waterproof, noir intense.',
    barcode: '6132540098822',
    brand: 'Maybelline',
    category: 'Maquillage',
    purchasePrice: 800,
    salePrice: 1600,
    quantity: 3,
    minQuantity: 4,
    hasExpiration: true,
    expirationDate: dateInDays(8), // expire bientôt + stock faible
    createdAt: daysAgo(70),
  },
  {
    id: 'p8',
    name: 'Vernis à ongles "Pink Glam"',
    description: 'Vernis à ongles brillant longue tenue, rose poudré.',
    barcode: '6132540098839',
    brand: 'Maybelline',
    category: 'Ongles',
    purchasePrice: 300,
    salePrice: 750,
    quantity: 30,
    minQuantity: 8,
    hasExpiration: false,
    createdAt: daysAgo(60),
  },
]

// --- Suppliers ---------------------------------------------------------------
export const INITIAL_SUPPLIERS: Supplier[] = [
  { id: 's1', name: 'Beauté Distribution SARL', phone: '0550 12 34 56', address: 'Zone industrielle, Rouiba, Alger', createdAt: daysAgo(200) },
  { id: 's2', name: 'Cosmétiques Import Méditerranée', phone: '0661 98 76 54', address: 'Rue des Frères Bouadou, Oran', createdAt: daysAgo(180) },
  { id: 's3', name: 'Parfums & Soins Algérie', phone: '0770 45 67 89', address: 'Cité 1000 logements, Constantine', createdAt: daysAgo(150) },
]

// --- Clients -----------------------------------------------------------------
export const INITIAL_CLIENTS: Client[] = [
  { id: 'c1', name: 'Karim Benali', phone: '0555 11 22 33', createdAt: daysAgo(140) },
  { id: 'c2', name: 'Amina Cherif', phone: '0666 44 55 66', createdAt: daysAgo(130) },
  { id: 'c3', name: 'Sofiane Mansouri', phone: '0777 77 88 99', createdAt: daysAgo(120) },
  { id: 'c4', name: 'Yasmine Haddad', phone: '0540 10 20 30', createdAt: daysAgo(110) },
  { id: 'c5', name: 'Réda Boukhari', phone: '0660 60 70 80', createdAt: daysAgo(100) },
  { id: 'c6', name: 'Nadia Belkacem', phone: '0771 21 31 41', createdAt: daysAgo(90) },
  { id: 'c7', name: 'Institut de Beauté Le Jardin', phone: '0550 90 80 70', createdAt: daysAgo(80) },
  { id: 'c8', name: 'Mohamed Larbi', phone: '0661 15 25 35', createdAt: daysAgo(70) },
  { id: 'c9', name: 'Lina Saadi', phone: '0775 55 45 35', createdAt: daysAgo(50) },
  { id: 'c10', name: "Salon & Spa L'Élégance", phone: '0540 33 22 11', createdAt: daysAgo(30) },
]

// --- Purchases ---------------------------------------------------------------
const mkPurchase = (
  id: string,
  reference: string,
  supplier: Supplier,
  lines: Purchase['lines'],
  date: string,
  paidRatio: number,
): Purchase => {
  const total = round2(lines.reduce((s, l) => s + l.quantity * l.purchasePrice, 0))
  const paid = round2(total * paidRatio)
  return {
    id,
    reference,
    supplierId: supplier.id,
    supplierName: supplier.name,
    lines,
    total,
    paid,
    payments: paid > 0 ? [{ id: `${id}-pay1`, amount: paid, date, note: 'Versement initial' }] : [],
    date,
    createdAt: date,
  }
}

/** Build a purchase line straight from a seed product (keeps prices consistent). */
const pLine = (p: Product, quantity: number): Purchase['lines'][number] => ({
  productId: p.id,
  productName: p.name,
  barcode: p.barcode,
  quantity,
  purchasePrice: p.purchasePrice,
  salePrice: p.salePrice,
  minQuantity: p.minQuantity,
  hasExpiration: p.hasExpiration,
  expirationDate: p.expirationDate,
})

export const INITIAL_PURCHASES: Purchase[] = [
  mkPurchase('pu1', 'ACH-2026-001', INITIAL_SUPPLIERS[0], [
    pLine(INITIAL_PRODUCTS[0], 20),
    pLine(INITIAL_PRODUCTS[7], 40),
  ], monthsAgo(3, 8), 1),
  mkPurchase('pu2', 'ACH-2026-002', INITIAL_SUPPLIERS[2], [
    pLine(INITIAL_PRODUCTS[4], 10),
    pLine(INITIAL_PRODUCTS[2], 30),
  ], monthsAgo(2, 12), 0.5),
  mkPurchase('pu3', 'ACH-2026-003', INITIAL_SUPPLIERS[1], [
    pLine(INITIAL_PRODUCTS[1], 15),
    pLine(INITIAL_PRODUCTS[3], 12),
  ], monthsAgo(1, 18), 1),
  mkPurchase('pu4', 'ACH-2026-004', INITIAL_SUPPLIERS[1], [
    pLine(INITIAL_PRODUCTS[5], 24),
  ], daysAgo(20), 0.6),
  mkPurchase('pu5', 'ACH-2026-005', INITIAL_SUPPLIERS[0], [
    pLine(INITIAL_PRODUCTS[6], 18),
  ], daysAgo(6), 1),
]

// --- Sales -------------------------------------------------------------------
const mkSale = (
  id: string,
  reference: string,
  client: Client | null,
  lines: Sale['lines'],
  date: string,
  paidRatio: number,
  discount = 0,
): Sale => {
  const subtotal = round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0))
  const total = round2(subtotal - discount)
  const paid = round2(total * paidRatio)
  return {
    id,
    reference,
    clientId: client?.id ?? null,
    clientName: client?.name ?? 'Client de passage',
    lines,
    subtotal,
    discount,
    total,
    paid,
    payments: paid > 0 ? [{ id: `${id}-pay1`, amount: paid, date, note: 'Encaissement' }] : [],
    date,
    createdAt: date,
  }
}

const line = (p: Product, qty: number) => ({
  productId: p.id,
  productName: p.name,
  barcode: p.barcode,
  quantity: qty,
  unitPrice: p.salePrice,
})

export const INITIAL_SALES: Sale[] = [
  mkSale('sa1', 'VTE-2026-001', INITIAL_CLIENTS[0], [line(INITIAL_PRODUCTS[0], 2)], monthsAgo(11, 6), 1),
  mkSale('sa2', 'VTE-2026-002', INITIAL_CLIENTS[1], [line(INITIAL_PRODUCTS[4], 1)], monthsAgo(10, 14), 1),
  mkSale('sa3', 'VTE-2026-003', INITIAL_CLIENTS[2], [line(INITIAL_PRODUCTS[2], 3), line(INITIAL_PRODUCTS[5], 2)], monthsAgo(9, 20), 1),
  mkSale('sa4', 'VTE-2026-004', null, [line(INITIAL_PRODUCTS[7], 2)], monthsAgo(8, 9), 1),
  mkSale('sa5', 'VTE-2026-005', INITIAL_CLIENTS[6], [line(INITIAL_PRODUCTS[1], 2), line(INITIAL_PRODUCTS[3], 4)], monthsAgo(7, 22), 0.4),
  mkSale('sa6', 'VTE-2026-006', INITIAL_CLIENTS[3], [line(INITIAL_PRODUCTS[6], 1)], monthsAgo(6, 11), 1),
  mkSale('sa7', 'VTE-2026-007', INITIAL_CLIENTS[4], [line(INITIAL_PRODUCTS[3], 1)], monthsAgo(5, 17), 1, 200),
  mkSale('sa8', 'VTE-2026-008', INITIAL_CLIENTS[5], [line(INITIAL_PRODUCTS[0], 1)], monthsAgo(4, 25), 1),
  mkSale('sa9', 'VTE-2026-009', INITIAL_CLIENTS[9], [line(INITIAL_PRODUCTS[4], 3)], monthsAgo(3, 8), 0.5),
  mkSale('sa10', 'VTE-2026-010', INITIAL_CLIENTS[7], [line(INITIAL_PRODUCTS[5], 2)], monthsAgo(2, 19), 1),
  mkSale('sa11', 'VTE-2026-011', INITIAL_CLIENTS[8], [line(INITIAL_PRODUCTS[7], 2), line(INITIAL_PRODUCTS[0], 1)], monthsAgo(1, 10), 1),
  mkSale('sa12', 'VTE-2026-012', INITIAL_CLIENTS[0], [line(INITIAL_PRODUCTS[3], 1)], daysAgo(12), 1),
  mkSale('sa13', 'VTE-2026-013', INITIAL_CLIENTS[2], [line(INITIAL_PRODUCTS[6], 2)], daysAgo(5), 0.3),
  mkSale('sa14', 'VTE-2026-014', null, [line(INITIAL_PRODUCTS[2], 1)], daysAgo(2), 1),
  mkSale('sa15', 'VTE-2026-015', INITIAL_CLIENTS[3], [line(INITIAL_PRODUCTS[1], 1)], daysAgo(0), 1, 300),
]

// --- Workers -----------------------------------------------------------------
export const INITIAL_ROLES = ['Vendeuse', 'Conseillère beauté', 'Caissière', 'Esthéticienne', 'Gérante']

export const INITIAL_WORKERS: Worker[] = [
  {
    id: 'w1',
    fullName: 'Yasmine Bouzid',
    birthDate: '1990-04-12',
    idCard: '109876543',
    phone: '0551 23 45 67',
    role: 'Conseillère beauté',
    hasSalary: true,
    salaryType: 'monthly',
    salaryAmount: 45000,
    hasAccount: true,
    email: 'yasmine@belle-cosmetiques.com',
    username: 'yasmine',
    password: 'yasmine123',
    permissions: {
      dashboard: { enabled: true, actions: ['view'] },
      stock: { enabled: true, actions: ['view'] },
      pos: { enabled: true, actions: ['view', 'create'] },
      sales: { enabled: true, actions: ['view', 'create', 'pay'] },
      clients: { enabled: true, actions: ['view', 'create', 'edit'] },
    },
    startDate: daysAgo(300),
    active: true,
    advances: [
      { id: 'w1-a1', date: daysAgo(10), description: 'Avance sur salaire', amount: 10000, deducted: false },
    ],
    absences: [
      { id: 'w1-ab1', date: daysAgo(8), description: 'Absence non justifiée', cost: 1500 },
    ],
    payments: [
      { id: 'w1-p1', period: '2026-05', baseSalary: 45000, absencesDeducted: 0, advancesDeducted: 0, amount: 45000, date: monthsAgo(1, 28), note: 'Salaire mai' },
    ],
    createdAt: daysAgo(300),
  },
  {
    id: 'w2',
    fullName: 'Salima Toumi',
    birthDate: '1995-09-03',
    idCard: '112233445',
    phone: '0662 34 56 78',
    role: 'Caissière',
    hasSalary: true,
    salaryType: 'monthly',
    salaryAmount: 38000,
    hasAccount: false,
    email: '',
    username: '',
    password: '',
    permissions: {},
    startDate: daysAgo(200),
    active: true,
    advances: [],
    absences: [],
    payments: [],
    createdAt: daysAgo(200),
  },
  {
    id: 'w3',
    fullName: 'Nadia Kaci',
    birthDate: '1988-01-25',
    idCard: '998877665',
    phone: '0773 45 67 89',
    role: 'Esthéticienne',
    hasSalary: true,
    salaryType: 'daily',
    salaryAmount: 2000,
    hasAccount: false,
    email: '',
    username: '',
    password: '',
    permissions: {},
    startDate: daysAgo(150),
    active: false,
    advances: [],
    absences: [
      { id: 'w3-ab1', date: daysAgo(3), description: 'Congé maladie', cost: 2000 },
    ],
    payments: [],
    createdAt: daysAgo(150),
  },
]

// --- Expenses ----------------------------------------------------------------
export const INITIAL_EXPENSES: Expense[] = [
  { id: 'e1', name: 'Loyer de la boutique', description: 'Loyer mensuel du local commercial', amount: 60000, date: daysAgo(18), createdAt: daysAgo(18) },
  { id: 'e2', name: 'Électricité & Eau', description: 'Facture SONELGAZ + SEAAL', amount: 14500, date: daysAgo(12), createdAt: daysAgo(12) },
  { id: 'e3', name: 'Sacs & emballages cadeaux', description: 'Sachets boutique et papier de soie', amount: 8000, date: daysAgo(7), createdAt: daysAgo(7) },
  { id: 'e4', name: 'Publicité Instagram', description: 'Campagne promotion nouvelle collection', amount: 12000, date: daysAgo(3), createdAt: daysAgo(3) },
]

// --- Settings ----------------------------------------------------------------
export const INITIAL_SETTINGS: StoreSettings = {
  logo: '',
  name: 'Belle Cosmétiques',
  description: 'Cosmétiques, parfums et soins de beauté',
  email: 'contact@belle-cosmetiques.com',
  phone: '0550 00 11 22',
  address: '12 Boulevard des Martyrs, Hydra, Alger',
  nif: '000216001234567',
  nis: '000216009876543',
  article: '16/00-1234567',
  rc: '16/00-9876543 B 24',
  currency: 'DA',
}

export const __statusOf = paymentStatus
