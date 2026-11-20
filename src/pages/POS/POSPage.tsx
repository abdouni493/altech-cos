import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Search,
  Plus,
  Minus,
  X,
  Trash2,
  ShoppingBag,
  UserPlus,
  Check,
  Package,
  ScanLine,
  Smartphone,
  PackageOpen,
  PauseCircle,
  PlayCircle,
  Banknote,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/Misc'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PhoneScanModal, type ScanFeedItem } from '@/components/shared/PhoneScanModal'
import { beep } from '@/components/shared/CameraScanner'
import { RetailSaleModal } from './RetailSaleModal'
import { usePhoneScan } from '@/lib/usePhoneScan'
import { useProductStore } from '@/store/useProductStore'
import { useClientStore } from '@/store/useClientStore'
import { useSalesStore } from '@/store/useSalesStore'
import { useProductionStore } from '@/store/useProductionStore'
import { useTranslation } from '@/i18n/useTranslation'
import { formatMoney, round2, uid } from '@/utils/helpers'
import { isDivisible, totalContent, contentUnitPrice, contentUnitCost, capacityOf, stockUnitName } from '@/utils/retail'
import { isTypingTarget } from '@/components/layout/Layout'
import { productionRemaining, productionUnitCost } from '@/utils/calculations'
import type { Client, Product, Production, SaleLine } from '@/types'
import { format } from 'date-fns'

/**
 * A cart line. `_key` identifies it because one product can appear twice — once
 * as a whole unit and once as a retail portion — and production batches carry
 * no product id at all. `stock` is the ceiling of this very line, `step` how
 * much the +/- buttons move (1 unit, or one retail portion).
 */
interface CartItem extends SaleLine {
  _key: string
  stock: number
  step: number
}

/** A cart parked with F8 to serve another customer, restored later. */
interface HeldSale {
  id: string
  at: string
  cart: CartItem[]
  clientId: string | null
  label: string
  total: number
}

const HELD_KEY = 'altech-held-sales'
const readHeld = (): HeldSale[] => {
  try {
    return JSON.parse(localStorage.getItem(HELD_KEY) ?? '[]')
  } catch {
    return []
  }
}
const writeHeld = (list: HeldSale[]) => {
  try {
    localStorage.setItem(HELD_KEY, JSON.stringify(list))
  } catch {
    /* storage full / private mode — parking just won't survive a reload */
  }
}

/** "3*6130…" → 3 × the scanned article (classic till multiplier). */
const parseMultiplier = (raw: string): { qty: number; code: string } => {
  const m = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*[*xX×]\s*(.+)$/)
  if (!m) return { qty: 1, code: raw.trim() }
  return { qty: Math.max(0, Number(m[1].replace(',', '.'))), code: m[2].trim() }
}

export const POSPage = () => {
  const { t } = useTranslation()
  const products = useProductStore((s) => s.products)
  const reduceStock = useProductStore((s) => s.reduceStock)
  const consumeRetail = useProductStore((s) => s.consumeRetail)
  const { clients, addClient } = useClientStore()
  const addSale = useSalesStore((s) => s.addSale)
  const productions = useProductionStore((s) => s.productions)
  const addSoldUnits = useProductionStore((s) => s.addSoldUnits)

  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [client, setClient] = useState<Client | null>(null)
  const [clientQuery, setClientQuery] = useState('')
  const [walkIn, setWalkIn] = useState(true)
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', phone: '' })
  const [discountOn, setDiscountOn] = useState(false)
  const [discount, setDiscount] = useState(0)
  const [received, setReceived] = useState(0)
  const [showScanner, setShowScanner] = useState(false)
  const [scanFeed, setScanFeed] = useState<ScanFeedItem[]>([])
  const [retailProduct, setRetailProduct] = useState<Product | null>(null)
  const [held, setHeld] = useState<HeldSale[]>(readHeld)
  const [showHeld, setShowHeld] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const clientRef = useRef<HTMLInputElement>(null)
  const discountRef = useRef<HTMLInputElement>(null)
  const receivedRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        (p.retailBarcode ?? '').includes(q) ||
        p.brand.toLowerCase().includes(q),
    )
  }, [products, search])

  const clientSuggestions = useMemo(() => {
    const q = clientQuery.trim().toLowerCase()
    if (!q || client) return []
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 5)
  }, [clientQuery, clients, client])

  // ---- What the cart already holds, per product / per batch -----------------
  const committed = useMemo(() => {
    const units = new Map<string, number>()
    const content = new Map<string, number>()
    const batches = new Map<string, number>()
    cart.forEach((l) => {
      if (l.kind === 'retail') content.set(l.productId, (content.get(l.productId) ?? 0) + l.quantity)
      else if (l.kind === 'production' && l.productionId)
        batches.set(l.productionId, (batches.get(l.productionId) ?? 0) + l.quantity)
      else units.set(l.productId, (units.get(l.productId) ?? 0) + l.quantity)
    })
    return { units, content, batches }
  }, [cart])

  /**
   * Content a divisible product can still give: a whole unit already in the
   * cart is a whole container gone, so it counts for its full capacity.
   */
  const remainingContent = (p: Product): number =>
    round2(
      totalContent(p) -
        (committed.content.get(p.id) ?? 0) -
        (committed.units.get(p.id) ?? 0) * capacityOf(p),
    )

  /**
   * Whole units still sellable. For a product sold by detail only SEALED boxes
   * leave whole — and never more than the content left once the pieces already
   * in the cart are served.
   */
  const remainingUnits = (p: Product): number =>
    isDivisible(p)
      ? Math.max(
          0,
          Math.min(
            p.quantity - (committed.units.get(p.id) ?? 0),
            Math.floor(remainingContent(p) / (capacityOf(p) || 1)),
          ),
        )
      : p.quantity - (committed.units.get(p.id) ?? 0)

  const remainingBatch = (b: Production): number =>
    round2(productionRemaining(b) - (committed.batches.get(b.id) ?? 0))

  // ---- Adding to the cart ---------------------------------------------------

  /** Whole units of a product (a sealed box, a bottle, a jar…). */
  const addToCart = (productId: string, qty = 1): boolean => {
    const p = products.find((x) => x.id === productId)
    if (!p || qty <= 0) return false
    if (remainingUnits(p) < qty) {
      toast.error(t('outOfStock'))
      return false
    }
    const key = `unit:${p.id}`
    setCart((prev) => {
      const existing = prev.find((l) => l._key === key)
      if (existing)
        return prev.map((l) => (l._key === key ? { ...l, quantity: l.quantity + qty } : l))
      return [
        ...prev,
        {
          _key: key,
          productId: p.id,
          productName: isDivisible(p) ? `${p.name} (${stockUnitName(p)})` : p.name,
          barcode: p.barcode,
          quantity: qty,
          unitPrice: p.salePrice,
          unitCost: p.purchasePrice,
          kind: 'product',
          stock: p.quantity,
          step: 1,
        },
      ]
    })
    return true
  }

  /** A fraction of a divisible product: 25 ml out of a 100 ml bottle. */
  const addRetailToCart = (p: Product, amount: number) => {
    if (amount <= 0) return
    if (amount > remainingContent(p)) {
      toast.error(t('notEnoughContent'))
      return
    }
    const key = `retail:${p.id}`
    setCart((prev) => {
      const existing = prev.find((l) => l._key === key)
      if (existing)
        return prev.map((l) =>
          l._key === key ? { ...l, quantity: round2(l.quantity + amount) } : l,
        )
      return [
        ...prev,
        {
          _key: key,
          productId: p.id,
          productName: p.name,
          barcode: p.barcode,
          quantity: amount,
          unitPrice: contentUnitPrice(p),
          unitCost: contentUnitCost(p),
          kind: 'retail',
          unit: p.unit,
          stock: totalContent(p),
          step: p.retailStep || 1,
        },
      ]
    })
    toast.success(`${p.name} · ${amount} ${p.unit ?? ''} · ${formatMoney(round2(amount * contentUnitPrice(p)))}`, {
      duration: 1600,
    })
  }

  /** A finished article coming out of a production batch. */
  const addProductionToCart = (batch: Production, qty = 1) => {
    if (qty <= 0) return
    if (qty > remainingBatch(batch)) {
      toast.error(t('outOfStock'))
      return
    }
    const key = `prod:${batch.id}`
    setCart((prev) => {
      const existing = prev.find((l) => l._key === key)
      if (existing)
        return prev.map((l) => (l._key === key ? { ...l, quantity: round2(l.quantity + qty) } : l))
      return [
        ...prev,
        {
          _key: key,
          productId: '',
          productName: batch.outputName || batch.sheetName,
          barcode: '',
          quantity: qty,
          unitPrice: batch.outputUnitPrice,
          unitCost: productionUnitCost(batch),
          kind: 'production',
          productionId: batch.id,
          stock: productionRemaining(batch),
          step: 1,
        },
      ]
    })
  }

  /** Tapping a product tile: divisible articles ask "how much?" first. */
  const openProduct = (p: Product) => {
    if (isDivisible(p)) {
      setRetailProduct(p)
      return
    }
    addToCart(p.id)
  }

  const subtotal = useMemo(
    () => round2(cart.reduce((s, l) => s + l.quantity * l.unitPrice, 0)),
    [cart],
  )
  const total = round2(Math.max(0, subtotal - (discountOn ? discount : 0)))

  // keep "received" pre-filled with the current total (cashier can lower it for credit)
  useEffect(() => {
    setReceived(total)
  }, [total])
  const change = round2(Math.max(0, received - total))
  const rest = round2(Math.max(0, total - received))

  /**
   * A barcode arrived — from the paired phone camera, from the camera of this
   * device, or from a USB barcode gun typing in the search box.
   * The matching product is dropped straight into the sale invoice; a retail
   * article is served one standard portion at a time.
   */
  const handleBarcode = (barcode: string, source: 'phone' | 'local') => {
    const { qty, code } = parseMultiplier(barcode)
    const same = (a: string | undefined, b: string) =>
      !!a && (a === b || a.replace(/^0+/, '') === b.replace(/^0+/, ''))
    // The barcode printed on ONE piece sells one portion straight away.
    const pieceProduct = products.find((p) => isDivisible(p) && same(p.retailBarcode, code))
    const product = pieceProduct ?? products.find((p) => same(p.barcode, code))

    const entry: ScanFeedItem = {
      id: uid('scan'),
      barcode: code,
      label: product ? product.name : t('unknownBarcode'),
      found: !!product,
      source,
    }
    setScanFeed((prev) => [entry, ...prev].slice(0, 20))

    if (!product) {
      beep(false)
      toast.error(`${t('unknownBarcode')} · ${code}`)
      return
    }

    if (pieceProduct) {
      const amount = round2((product.retailStep || 1) * qty)
      if (remainingContent(product) < amount) {
        beep(false)
        toast.error(`${product.name} — ${t('notEnoughContent')}`)
        return
      }
      beep(true)
      addRetailToCart(product, amount)
      return
    }

    // The box barcode of a product sold by detail: ask "box or detail?".
    if (isDivisible(product) && qty === 1 && source === 'local') {
      beep(true)
      setRetailProduct(product)
      return
    }

    if (remainingUnits(product) < qty) {
      beep(false)
      toast.error(`${product.name} — ${t('outOfStock')}`)
      return
    }
    beep(true)
    if (addToCart(product.id, qty))
      toast.success(`${qty > 1 ? `${qty} × ` : ''}${product.name} · ${formatMoney(round2(product.salePrice * qty))}`, { duration: 1400 })
  }

  const phone = usePhoneScan((barcode) => handleBarcode(barcode, 'phone'))

  /** +/- on a cart line — one unit, one portion, or one finished article. */
  const changeQty = (key: string, direction: 1 | -1) =>
    setCart((prev) =>
      prev
        .map((l) => {
          if (l._key !== key) return l
          const next = round2(l.quantity + direction * l.step)
          if (direction > 0) {
            const product = products.find((p) => p.id === l.productId)
            const batch = productions.find((b) => b.id === l.productionId)
            const room =
              l.kind === 'retail' && product
                ? remainingContent(product)
                : l.kind === 'production'
                  ? batch
                    ? remainingBatch(batch)
                    : 0
                  : product
                    ? remainingUnits(product)
                    : 0
            if (l.step > room) {
              toast.error(l.kind === 'retail' ? t('notEnoughContent') : t('outOfStock'))
              return l
            }
          }
          return { ...l, quantity: next }
        })
        .filter((l) => l.quantity > 0),
    )

  const removeItem = (key: string) => setCart((prev) => prev.filter((l) => l._key !== key))

  const resetSale = () => {
    setCart([])
    setClient(null)
    setClientQuery('')
    setWalkIn(true)
    setDiscountOn(false)
    setDiscount(0)
    setReceived(0)
    setScanFeed([])
  }

  const handleNewClient = () => {
    if (!newClient.name.trim()) {
      toast.error(t('required'))
      return
    }
    const created = addClient({ name: newClient.name, phone: newClient.phone })
    setClient(created)
    setWalkIn(false)
    setShowNewClient(false)
    setNewClient({ name: '', phone: '' })
  }

  const creditBlocked = rest > 0 && !client

  /** F8 — park the current cart to serve the next customer. */
  const holdSale = () => {
    if (cart.length === 0) {
      toast.error(t('emptyCart'))
      return
    }
    const entry: HeldSale = {
      id: uid('hold'),
      at: new Date().toISOString(),
      cart,
      clientId: client?.id ?? null,
      label: client?.name ?? `${t('ticket')} ${held.length + 1}`,
      total,
    }
    const next = [entry, ...held].slice(0, 20)
    setHeld(next)
    writeHeld(next)
    resetSale()
    toast.success(t('saleHeld'))
    searchRef.current?.focus()
  }

  const recallSale = (entry: HeldSale) => {
    if (cart.length > 0) {
      toast.error(t('finishCurrentSaleFirst'))
      return
    }
    // Quantities are re-checked against the shelf of now, not of when it was parked.
    setCart(entry.cart)
    const c = clients.find((x) => x.id === entry.clientId) ?? null
    setClient(c)
    setWalkIn(!c)
    const next = held.filter((h) => h.id !== entry.id)
    setHeld(next)
    writeHeld(next)
    setShowHeld(false)
  }

  /** Cash notes the customer usually hands over, from the exact amount up. */
  const quickCash = useMemo(() => {
    if (total <= 0) return []
    const ups = [100, 500, 1000, 2000].map((n) => Math.ceil(total / n) * n)
    return [...new Set([total, ...ups])].filter((v) => v >= total).slice(0, 4)
  }, [total])

  const validate = () => {
    if (cart.length === 0) {
      toast.error(t('emptyCart'))
      return
    }
    if (creditBlocked) {
      toast.error(t('selectClientForCredit'))
      return
    }
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const lines: SaleLine[] = cart.map(({ _key, stock, step, ...l }) => l)
    /* eslint-enable @typescript-eslint/no-unused-vars */
    const paid = round2(Math.min(received, total))
    const nowIso = new Date().toISOString()
    addSale({
      clientId: client?.id ?? null,
      clientName: client?.name ?? t('walkInClient'),
      lines,
      subtotal,
      discount: discountOn ? discount : 0,
      total,
      paid,
      payments: paid > 0 ? [{ id: `p-${Date.now()}`, amount: paid, date: nowIso, note: 'Encaissement' }] : [],
      date: nowIso,
    })
    // Move the stock the way each kind of line demands.
    lines.forEach((l) => {
      if (l.kind === 'retail') consumeRetail(l.productId, l.quantity)
      else if (l.kind === 'production') {
        if (l.productionId) addSoldUnits(l.productionId, l.quantity)
      } else reduceStock(l.productId, l.quantity)
    })
    toast.success(t('saleValidated'))
    resetSale()
    searchRef.current?.focus()
  }

  // Till shortcuts — see the F1 help sheet.
  const shortcutRef = useRef<(e: KeyboardEvent) => void>()
  shortcutRef.current = (e: KeyboardEvent) => {
    if (retailProduct || showScanner) return
    const typing = isTypingTarget(e.target)
    const last = cart[cart.length - 1]
    switch (e.key) {
      case 'F2':
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      case 'F4':
        e.preventDefault()
        setWalkIn(false)
        window.setTimeout(() => clientRef.current?.focus(), 30)
        return
      case 'F6':
        e.preventDefault()
        setDiscountOn(true)
        window.setTimeout(() => discountRef.current?.select(), 30)
        return
      case 'F7':
        e.preventDefault()
        receivedRef.current?.select()
        return
      case 'F8':
        e.preventDefault()
        holdSale()
        return
      case 'F9':
        e.preventDefault()
        validate()
        return
      case 'Enter':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          validate()
        }
        return
    }
    if (typing || !last) return
    if (e.key === '+' || e.key === 'Add') {
      e.preventDefault()
      changeQty(last._key, 1)
    } else if (e.key === '-' || e.key === 'Subtract') {
      e.preventDefault()
      changeQty(last._key, -1)
    } else if (e.key === 'Delete') {
      e.preventDefault()
      removeItem(last._key)
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcutRef.current?.(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div>
      <PageHeader
        title={t('pos')}
        subtitle={format(new Date(), 'dd/MM/yyyy HH:mm')}
        actions={
          <>
            <Button variant="outline" onClick={() => setShowHeld((v) => !v)} title={t('heldSales')} disabled={held.length === 0}>
              <PlayCircle size={18} />
              <span className="hidden sm:inline">{t('heldSales')}</span>
              {held.length > 0 && <span className="rounded-md bg-gold px-1.5 text-xs font-bold text-wood-dark">{held.length}</span>}
            </Button>
            <Button
              variant={phone.status === 'connected' ? 'sage' : 'gold'}
              onClick={() => setShowScanner(true)}
              title={t('scanWithPhone')}
            >
              <Smartphone size={18} />
              <span className="hidden sm:inline">{t('scanWithPhone')}</span>
              {phone.status === 'connected' && (
                <span className="ms-1 rounded-full bg-white/25 px-2 text-xs font-bold">{phone.count}</span>
              )}
            </Button>
          </>
        }
      />

      {showHeld && held.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {held.map((h) => (
            <button
              key={h.id}
              onClick={() => recallSale(h)}
              className="card-wood card-hover flex items-center gap-3 rounded-xl p-3 text-start"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-[#B45309]">
                <PauseCircle size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-wood-dark">{h.label}</p>
                <p className="text-xs text-wood-medium">
                  {format(new Date(h.at), 'HH:mm')} · {h.cart.length} {t('articles')}
                </p>
              </div>
              <span className="text-mono text-sm font-bold text-wood-warm">{formatMoney(h.total)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Catalog */}
        <div className="lg:col-span-3">
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-wood-medium/60" size={18} />
              <span className="kbd pointer-events-none absolute end-3 top-1/2 -translate-y-1/2">F2</span>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  // a USB barcode gun ends its emission with Enter
                  if (e.key === 'Enter' && search.trim() && !e.ctrlKey) {
                    // a single visible match is picked as if it had been clicked
                    const { qty, code } = parseMultiplier(search)
                    const exact = products.some((p) => p.barcode === code || p.retailBarcode === code)
                    if (!exact && filtered.length === 1 && qty === 1) openProduct(filtered[0])
                    else handleBarcode(search.trim(), 'local')
                    setSearch('')
                  }
                  if (e.key === 'Escape') setSearch('')
                }}
                placeholder={t('posSearchPlaceholder')}
                className="input-wood h-12 pe-12 ps-10 text-base"
                autoFocus
              />
            </div>
            <Button variant="outline" size="icon" className="!h-12 !w-12" onClick={() => setShowScanner(true)} title={t('scanBarcode')}>
              <ScanLine size={20} />
            </Button>
          </div>

          {phone.status === 'connected' && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-sage/30 bg-sage/10 px-3 py-2 text-xs font-medium text-sage">
              <Smartphone size={14} />
              {t('phoneConnected')} — {t('scanToAdd')}
              <button onClick={phone.stop} className="ms-auto text-wood-medium hover:text-terracotta">
                <X size={14} />
              </button>
            </div>
          )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p, i) => {
                const retail = isDivisible(p)
                const left = retail ? remainingContent(p) : remainingUnits(p)
                const low = p.quantity <= p.minQuantity
                return (
                  <motion.button
                    key={p.id}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.02 } }}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => openProduct(p)}
                    disabled={left <= 0}
                    className="card-wood card-hover flex flex-col overflow-hidden rounded-xl p-3 text-start disabled:opacity-50"
                  >
                    <div className="relative mb-2 flex h-16 items-center justify-center rounded-lg bg-gradient-to-br from-wood-cream to-white text-wood-warm/70 ring-1 ring-woodborder">
                      {retail ? <PackageOpen size={28} /> : <Package size={28} />}
                      {retail && (
                        <span className="absolute end-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-wood-warm px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {t('detailBadge')}
                        </span>
                      )}
                      <span className={`absolute bottom-1.5 start-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${left <= 0 ? 'bg-terracotta text-white' : low ? 'bg-gold/20 text-[#B45309]' : 'bg-white text-wood-medium ring-1 ring-woodborder'}`}>
                        {retail ? `${remainingUnits(p)} ${stockUnitName(p, remainingUnits(p) > 1)}` : left}
                      </span>
                    </div>
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug text-wood-dark">{p.name}</p>
                    <span className="text-mono mt-1 truncate text-sm font-bold text-wood-warm">{formatMoney(p.salePrice)}</span>
                    {retail && (
                      <span className="mt-0.5 flex items-center justify-between gap-1 text-[10px] text-wood-medium">
                        <span className="text-mono font-semibold text-sage">
                          {formatMoney(contentUnitPrice(p))}/{p.unit}
                        </span>
                        <span>
                          {(p.openRemaining ?? 0) > 0 ? `+${round2(p.openRemaining ?? 0)} ${p.unit}` : `${left} ${p.unit}`}
                        </span>
                      </span>
                    )}
                  </motion.button>
                )
              })}
            </div>
        </div>

        {/* Cart */}
        <div className="lg:col-span-2">
          <div className="card-wood sticky top-0 flex max-h-[calc(100vh-7.5rem)] flex-col overflow-hidden rounded-xl">
            <div className="wood-grain flex items-center justify-between bg-wood-sidebar px-4 py-3 text-white">
              <h3 className="relative z-10 flex items-center gap-2 text-display text-base font-bold">
                <ShoppingBag size={19} />
                {t('cart')}
                {cart.length > 0 && <span className="rounded-md bg-white/15 px-1.5 text-xs">{cart.length}</span>}
              </h3>
              <div className="relative z-10 flex items-center gap-1">
                {cart.length > 0 && (
                  <button onClick={holdSale} title={`${t('holdSale')} (F8)`} className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-white/85 hover:bg-white/10">
                    <PauseCircle size={16} />
                    <span className="hidden xl:inline">{t('holdSale')}</span>
                  </button>
                )}
                {cart.length > 0 && <button onClick={resetSale} title={t('delete')} className="flex h-8 w-8 items-center justify-center rounded-md text-white/85 hover:bg-terracotta/30"><Trash2 size={16} /></button>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {/* Client */}
              <div className="mb-3 rounded-xl border border-wood-light/25 p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={walkIn} onChange={(e) => { setWalkIn(e.target.checked); if (e.target.checked) { setClient(null); setClientQuery('') } }} className="accent-wood-warm" />
                    {t('walkInClient')}
                  </label>
                </div>
                {!walkIn && (
                  client ? (
                    <div className="flex items-center justify-between rounded-lg bg-sage/10 px-3 py-2">
                      <div><p className="text-sm font-medium text-wood-dark">{client.name}</p><p className="text-xs text-wood-medium">{client.phone}</p></div>
                      <button onClick={() => setClient(null)} className="text-terracotta"><X size={16} /></button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input ref={clientRef} value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder={`${t('client')} (${t('name')} / ${t('phone')}) — F4`} className="input-wood py-1.5" />
                      {clientSuggestions.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-wood-light/30 bg-white shadow-wood-lg">
                          {clientSuggestions.map((c) => (
                            <button key={c.id} onClick={() => { setClient(c); setClientQuery(c.name) }} className="block w-full px-3 py-2 text-start text-sm hover:bg-wood-cream">{c.name} · {c.phone}</button>
                          ))}
                        </div>
                      )}
                      <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={() => setShowNewClient((v) => !v)}><UserPlus size={14} />{t('newClient')}</Button>
                      {showNewClient && (
                        <div className="mt-2 space-y-2">
                          <input value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} placeholder={t('name')} className="input-wood py-1.5" />
                          <input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder={t('phone')} className="input-wood py-1.5" />
                          <Button type="button" variant="sage" size="sm" className="w-full" onClick={handleNewClient}><Plus size={14} />{t('add')}</Button>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>

              {/* Items */}
              {cart.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-wood-cream text-wood-warm"><ScanLine size={22} /></div>
                  <p className="text-sm font-semibold text-wood-dark">{t('emptyCart')}</p>
                  <p className="max-w-[16rem] text-xs text-wood-medium">{t('emptyCartHint')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence>
                    {cart.map((l) => (
                      <motion.div key={l._key} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="rounded-lg border border-woodborder bg-[#F8FAFD] p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-wood-dark">
                            {l.kind === 'retail' && <PackageOpen size={13} className="shrink-0 text-wood-warm" />}
                            <span className="truncate">{l.productName}</span>
                          </p>
                          <button onClick={() => removeItem(l._key)} className="text-terracotta"><X size={15} /></button>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button onClick={() => changeQty(l._key, -1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-[#D5DBE8] bg-white text-wood-dark transition hover:border-wood-warm hover:text-wood-warm active:scale-90"><Minus size={13} /></button>
                            <span className="text-mono min-w-[3rem] text-center text-sm font-bold">
                              {l.quantity}
                              {l.kind === 'retail' && <span className="text-[10px] font-normal text-wood-medium"> {l.unit}</span>}
                            </span>
                            <button onClick={() => changeQty(l._key, 1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-[#D5DBE8] bg-white text-wood-dark transition hover:border-wood-warm hover:text-wood-warm active:scale-90"><Plus size={13} /></button>
                          </div>
                          <span className="text-mono text-sm font-bold text-sage">{formatMoney(round2(l.quantity * l.unitPrice))}</span>
                        </div>
                        {l.kind === 'retail' && (
                          <p className="mt-0.5 text-end text-[10px] text-wood-medium/70">
                            {formatMoney(l.unitPrice)} / {l.unit}
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="space-y-2 border-t border-wood-light/20 px-4 py-3">
              <div className="flex justify-between text-sm"><span className="text-wood-medium">{t('subtotal')}</span><span className="text-mono font-semibold">{formatMoney(subtotal)}</span></div>
              <label className="flex items-center gap-1.5 text-sm text-wood-medium">
                <input type="checkbox" checked={discountOn} onChange={(e) => setDiscountOn(e.target.checked)} className="accent-wood-warm" />
                {t('enableDiscount')}
              </label>
              {discountOn && (
                <input ref={discountRef} type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} placeholder={t('discount')} className="input-wood py-1.5" />
              )}
              <div className="flex items-center justify-between rounded-lg bg-wood-header px-3.5 py-2.5 text-white shadow-rose">
                <span className="font-semibold">{t('toPay')}</span>
                <span className="text-mono text-xl font-bold">{formatMoney(total)}</span>
              </div>
              <Input ref={receivedRef} label={`${t('received')} (F7)`} type="number" step="0.01" value={received} onChange={(e) => setReceived(Number(e.target.value))} />
              {quickCash.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {quickCash.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setReceived(v)}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition ${received === v ? 'border-sage bg-sage text-white' : 'border-[#D5DBE8] bg-white text-wood-medium hover:border-sage hover:text-sage'}`}
                    >
                      <Banknote size={12} />
                      {formatMoney(v)}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-wood-medium">{received >= total ? t('change') : t('remaining')}</span>
                <span className={`text-mono font-bold ${received >= total ? 'text-sage' : 'text-terracotta'}`}>{formatMoney(received >= total ? change : rest)}</span>
              </div>
              <Button
                variant={creditBlocked ? 'outline' : 'primary'}
                size="lg"
                className="w-full"
                disabled={creditBlocked || cart.length === 0}
                title={creditBlocked ? t('selectClientForCredit') : undefined}
                onClick={validate}
                kbd="F9"
              >
                <Check size={18} />
                {t('validateSale')}
              </Button>
              {creditBlocked && <p className="text-center text-xs text-terracotta">{t('selectClientForCredit')}</p>}
            </div>
          </div>
        </div>
      </div>

      <PhoneScanModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        phone={phone}
        onLocalBarcode={(code) => handleBarcode(code, 'local')}
        feed={scanFeed}
      />

      <RetailSaleModal
        open={!!retailProduct}
        onClose={() => setRetailProduct(null)}
        product={retailProduct}
        available={retailProduct ? remainingContent(retailProduct) : 0}
        availableBoxes={retailProduct ? remainingUnits(retailProduct) : 0}
        onSellRetail={(amount) => retailProduct && addRetailToCart(retailProduct, amount)}
        onSellWhole={(count) => retailProduct && addToCart(retailProduct.id, count)}
      />

    </div>
  )
}
