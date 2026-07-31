import { useState, useMemo, useEffect } from 'react'
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
  SprayCan,
  ScanLine,
  Smartphone,
  Beaker,
  FlaskConical,
  Zap,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/Misc'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PhoneScanModal, type ScanFeedItem } from '@/components/shared/PhoneScanModal'
import { beep } from '@/components/shared/CameraScanner'
import { RetailSaleModal } from './RetailSaleModal'
import { QuickProductionModal } from './QuickProductionModal'
import { usePhoneScan } from '@/lib/usePhoneScan'
import { useProductStore } from '@/store/useProductStore'
import { useClientStore } from '@/store/useClientStore'
import { useSalesStore } from '@/store/useSalesStore'
import { useProductionStore } from '@/store/useProductionStore'
import { useTranslation } from '@/i18n/useTranslation'
import { formatMoney, round2, uid } from '@/utils/helpers'
import { isDivisible, totalContent, contentUnitPrice, contentUnitCost, capacityOf } from '@/utils/retail'
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

type Catalog = 'products' | 'production'

export const POSPage = () => {
  const { t } = useTranslation()
  const products = useProductStore((s) => s.products)
  const reduceStock = useProductStore((s) => s.reduceStock)
  const consumeRetail = useProductStore((s) => s.consumeRetail)
  const { clients, addClient } = useClientStore()
  const addSale = useSalesStore((s) => s.addSale)
  const productions = useProductionStore((s) => s.productions)
  const addSoldUnits = useProductionStore((s) => s.addSoldUnits)

  const [catalog, setCatalog] = useState<Catalog>('products')
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
  const [showQuickProduction, setShowQuickProduction] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.barcode.includes(q))
  }, [products, search])

  /** Batches with finished units still available for sale. */
  const sellableProductions = useMemo(() => {
    const q = search.trim().toLowerCase()
    return productions
      .filter((p) => productionRemaining(p) > 0)
      .filter((p) => !q || p.outputName.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q))
  }, [productions, search])

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

  const remainingUnits = (p: Product): number =>
    isDivisible(p)
      ? Math.floor(remainingContent(p) / (capacityOf(p) || 1))
      : p.quantity - (committed.units.get(p.id) ?? 0)

  const remainingBatch = (b: Production): number =>
    round2(productionRemaining(b) - (committed.batches.get(b.id) ?? 0))

  // ---- Adding to the cart ---------------------------------------------------

  /** One whole unit of a product (a sealed bottle, a jar, a box…). */
  const addToCart = (productId: string) => {
    const p = products.find((x) => x.id === productId)
    if (!p) return
    if (remainingUnits(p) <= 0) {
      toast.error(t('outOfStock'))
      return
    }
    const key = `unit:${p.id}`
    setCart((prev) => {
      const existing = prev.find((l) => l._key === key)
      if (existing)
        return prev.map((l) => (l._key === key ? { ...l, quantity: l.quantity + 1 } : l))
      return [
        ...prev,
        {
          _key: key,
          productId: p.id,
          productName: p.name,
          barcode: p.barcode,
          quantity: 1,
          unitPrice: p.salePrice,
          unitCost: p.purchasePrice,
          kind: 'product',
          stock: p.quantity,
          step: 1,
        },
      ]
    })
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
    const code = barcode.trim()
    const product =
      products.find((p) => p.barcode === code) ??
      products.find((p) => p.barcode.replace(/^0+/, '') === code.replace(/^0+/, ''))

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

    const retail = isDivisible(product) && (product.retailStep ?? 0) > 0
    if (retail) {
      if (remainingContent(product) < (product.retailStep ?? 0)) {
        beep(false)
        toast.error(`${product.name} — ${t('notEnoughContent')}`)
        return
      }
      beep(true)
      addRetailToCart(product, product.retailStep ?? 0)
      return
    }

    if (remainingUnits(product) <= 0) {
      beep(false)
      toast.error(`${product.name} — ${t('outOfStock')}`)
      return
    }
    beep(true)
    addToCart(product.id)
    toast.success(`${product.name} · ${formatMoney(product.salePrice)}`, { duration: 1400 })
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
  }

  return (
    <div>
      <PageHeader
        title={t('pos')}
        subtitle={format(new Date(), 'dd/MM/yyyy HH:mm')}
        actions={
          <>
            <Button variant="sage" onClick={() => setShowQuickProduction(true)} title={t('quickProductionHint')}>
              <Zap size={18} />
              <span className="hidden sm:inline">{t('quickProduction')}</span>
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Catalog */}
        <div className="lg:col-span-3">
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-wood-medium/50" size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  // a USB barcode gun ends its emission with Enter
                  if (e.key === 'Enter' && search.trim()) {
                    handleBarcode(search.trim(), 'local')
                    setSearch('')
                  }
                }}
                placeholder={`${t('search')} (${t('productName')} / ${t('barcode')})`}
                className="input-wood ps-10"
                autoFocus
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => setShowScanner(true)} title={t('scanBarcode')}>
              <ScanLine size={20} />
            </Button>
          </div>

          {/* Stock products vs finished batches */}
          <div className="mb-3 inline-flex rounded-xl border border-wood-light/40 bg-white/70 p-1">
            {([
              { k: 'products', l: t('products'), icon: <SprayCan size={15} />, n: filtered.length },
              { k: 'production', l: t('productionStock'), icon: <FlaskConical size={15} />, n: sellableProductions.length },
            ] as const).map((o) => (
              <button
                key={o.k}
                onClick={() => setCatalog(o.k)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  catalog === o.k ? 'bg-wood-btn text-white shadow-wood' : 'text-wood-medium hover:bg-wood-cream'
                }`}
              >
                {o.icon}
                {o.l}
                <span className={`rounded-full px-1.5 text-[10px] ${catalog === o.k ? 'bg-white/25' : 'bg-wood-cream'}`}>
                  {o.n}
                </span>
              </button>
            ))}
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

          {catalog === 'products' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p, i) => {
                const retail = isDivisible(p)
                const left = retail ? remainingContent(p) : remainingUnits(p)
                return (
                  <motion.button
                    key={p.id}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.02 } }}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => openProduct(p)}
                    disabled={left <= 0}
                    className="card-wood flex flex-col overflow-hidden rounded-2xl p-3 text-start disabled:opacity-50"
                  >
                    <div className="relative mb-2 flex h-20 items-center justify-center rounded-xl bg-wood-cream/60 text-wood-light">
                      <SprayCan size={32} />
                      {retail && (
                        <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[9px] font-bold text-wood-warm">
                          <Beaker size={10} />
                          {p.unit}
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-wood-dark">{p.name}</p>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <span className="text-mono truncate font-bold text-sage">
                        {retail && (p.retailStep ?? 0) > 0
                          ? `${formatMoney(p.retailPrice ?? 0)} / ${p.retailStep}${p.unit ?? ''}`
                          : formatMoney(p.salePrice)}
                      </span>
                      <span className={`shrink-0 text-xs ${p.quantity <= p.minQuantity ? 'text-terracotta' : 'text-wood-medium'}`}>
                        {retail ? `${left} ${p.unit ?? ''}` : left}
                      </span>
                    </div>
                    {retail && (
                      <span className="mt-0.5 text-[10px] text-wood-medium/70">
                        {p.quantity} × {capacityOf(p)} {p.unit}
                        {(p.openRemaining ?? 0) > 0 && ` + ${round2(p.openRemaining ?? 0)} ${p.unit}`}
                      </span>
                    )}
                  </motion.button>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {sellableProductions.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-wood-light/40 py-10 text-center">
                  <FlaskConical size={32} className="mx-auto mb-2 text-wood-light" />
                  <p className="text-sm text-wood-medium">{t('noProduction')}</p>
                  <Button variant="sage" size="sm" className="mt-3" onClick={() => setShowQuickProduction(true)}>
                    <Zap size={15} />
                    {t('quickProduction')}
                  </Button>
                </div>
              ) : (
                sellableProductions.map((b, i) => {
                  const left = remainingBatch(b)
                  return (
                    <motion.button
                      key={b.id}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.02 } }}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => addProductionToCart(b)}
                      disabled={left <= 0}
                      className="card-wood flex flex-col overflow-hidden rounded-2xl p-3 text-start disabled:opacity-50"
                    >
                      <div className="mb-2 flex h-20 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-fuchsia-100 text-violet-500">
                        <FlaskConical size={32} />
                      </div>
                      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-wood-dark">
                        {b.outputName || b.sheetName}
                      </p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-mono font-bold text-sage">{formatMoney(b.outputUnitPrice)}</span>
                        <span className="text-xs text-wood-medium">{left}</span>
                      </div>
                      <span className="text-mono mt-0.5 truncate text-[10px] text-wood-medium/70">
                        {b.reference} · {t('unitCost')} {formatMoney(productionUnitCost(b))}
                      </span>
                    </motion.button>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="lg:col-span-2">
          <div className="card-wood sticky top-4 flex max-h-[calc(100vh-8rem)] flex-col rounded-2xl">
            <div className="flex items-center justify-between rounded-t-2xl bg-wood-header px-4 py-3 text-white">
              <h3 className="flex items-center gap-2 text-display text-lg font-bold"><ShoppingBag size={20} />{t('cart')}</h3>
              {cart.length > 0 && <button onClick={resetSale} className="rounded-lg p-1 hover:bg-white/15"><Trash2 size={18} /></button>}
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
                      <input value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder={`${t('client')} (${t('name')} / ${t('phone')})`} className="input-wood py-1.5" />
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
                <p className="py-8 text-center text-sm text-wood-medium">{t('emptyCart')}</p>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence>
                    {cart.map((l) => (
                      <motion.div key={l._key} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="rounded-xl bg-wood-cream/30 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-wood-dark">
                            {l.kind === 'retail' && <Beaker size={13} className="shrink-0 text-wood-warm" />}
                            {l.kind === 'production' && <FlaskConical size={13} className="shrink-0 text-violet-500" />}
                            <span className="truncate">{l.productName}</span>
                          </p>
                          <button onClick={() => removeItem(l._key)} className="text-terracotta"><X size={15} /></button>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button onClick={() => changeQty(l._key, -1)} className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-wood-warm shadow-wood"><Minus size={13} /></button>
                            <span className="text-mono min-w-[3rem] text-center text-sm font-bold">
                              {l.quantity}
                              {l.kind === 'retail' && <span className="text-[10px] font-normal text-wood-medium"> {l.unit}</span>}
                            </span>
                            <button onClick={() => changeQty(l._key, 1)} className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-wood-warm shadow-wood"><Plus size={13} /></button>
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
                <input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} placeholder={t('discount')} className="input-wood py-1.5" />
              )}
              <div className="flex items-center justify-between rounded-xl bg-wood-btn px-3 py-2 text-white">
                <span className="font-medium">{t('toPay')}</span>
                <span className="text-mono text-lg font-bold">{formatMoney(total)}</span>
              </div>
              <Input label={t('received')} type="number" step="0.01" value={received} onChange={(e) => setReceived(Number(e.target.value))} />
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
        onSellRetail={(amount) => retailProduct && addRetailToCart(retailProduct, amount)}
        onSellWhole={() => retailProduct && addToCart(retailProduct.id)}
      />

      <QuickProductionModal
        open={showQuickProduction}
        onClose={() => setShowQuickProduction(false)}
        onProduced={(production) => {
          setCatalog('production')
          addProductionToCart(production, production.outputQuantity)
        }}
      />
    </div>
  )
}
