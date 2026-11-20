import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Check, Package, PackageOpen, AlertTriangle, Minus, Plus, ArrowRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useTranslation } from '@/i18n/useTranslation'
import { formatMoney, round2 } from '@/utils/helpers'
import { capacityOf, contentUnitPrice, splitAmount, stockUnitName, shelfBreakdown } from '@/utils/retail'
import { clsx } from '@/utils/clsx'
import type { Product } from '@/types'

type Mode = 'box' | 'detail'

interface RetailSaleModalProps {
  open: boolean
  onClose: () => void
  product: Product | null
  /** Content still sellable once what is already in the cart is deducted. */
  available: number
  /** Sealed boxes still sellable once the cart is deducted. */
  availableBoxes: number
  /** Sell `amount` units of content (pieces, ml, g…). */
  onSellRetail: (amount: number) => void
  /** Sell `count` whole sealed boxes. */
  onSellWhole: (count: number) => void
}

/**
 * "Box or detail?" — the counter dialog of a product sold by detail.
 * A box of 20 cigarettes can leave whole, or 3 cigarettes at a time; the price
 * follows the quantity and the shelf after the sale is shown before confirming.
 */
export const RetailSaleModal = ({
  open,
  onClose,
  product,
  available,
  availableBoxes,
  onSellRetail,
  onSellWhole,
}: RetailSaleModalProps) => {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('detail')
  const [amount, setAmount] = useState(1)
  const [boxes, setBoxes] = useState(1)
  const inputRef = useRef<HTMLInputElement>(null)

  const step = product?.retailStep && product.retailStep > 0 ? product.retailStep : 1
  const unit = product?.unit ?? ''
  const perUnit = product ? contentUnitPrice(product) : 0
  const boxName = product ? stockUnitName(product) : ''
  const boxesName = product ? stockUnitName(product, true) : ''
  const capacity = product ? capacityOf(product) : 0
  const canSellBox = !!product && product.salePrice > 0 && availableBoxes > 0
  const canSellDetail = perUnit > 0 && available > 0

  useEffect(() => {
    if (!open || !product) return
    setAmount(step)
    setBoxes(1)
    setMode(canSellDetail || !canSellBox ? 'detail' : 'box')
    window.setTimeout(() => inputRef.current?.select(), 60)
  }, [open, product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!product) return null

  const detailPrice = round2(amount * perUnit)
  const boxPrice = round2(boxes * product.salePrice)
  const tooMuch = mode === 'detail' ? amount > available + 1e-9 : boxes > availableBoxes
  const price = mode === 'detail' ? detailPrice : boxPrice
  const invalid = tooMuch || (mode === 'detail' ? amount <= 0 || !canSellDetail : boxes <= 0 || !canSellBox)

  // Shelf after this sale (on top of what the cart already holds).
  const usedContent = mode === 'detail' ? amount : boxes * capacity
  const afterTotal = round2(Math.max(0, available - usedContent))
  const after = splitAmount(product, afterTotal)
  const { boxes: shelfBoxes, loose: shelfLoose } = shelfBreakdown(product)

  const nudge = (dir: 1 | -1) => {
    if (mode === 'detail') setAmount((a) => Math.max(step, round2(a + dir * step)))
    else setBoxes((b) => Math.max(1, b + dir))
  }

  const confirm = () => {
    if (invalid) {
      toast.error(tooMuch ? t('notEnoughContent') : t('required'))
      return
    }
    if (mode === 'detail') onSellRetail(round2(amount))
    else onSellWhole(boxes)
    onClose()
  }

  // One tap for the usual quantities of the shop.
  const presets = [...new Set([step, step * 2, step * 3, step * 5, step * 10, capacity / 2, capacity].map(round2))]
    .filter((v) => v > 0 && v <= Math.max(available, step))
    .sort((a, b) => a - b)
    .slice(0, 7)

  const onKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key.toLowerCase()
    if (key === 'b' && canSellBox) {
      e.preventDefault()
      setMode('box')
    } else if (key === 'd' && canSellDetail) {
      e.preventDefault()
      setMode('detail')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      nudge(1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      nudge(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      confirm()
    }
  }

  const ModeButton = ({ value, icon, label, sub, hotkey, disabled }: { value: Mode; icon: React.ReactNode; label: string; sub: string; hotkey: string; disabled: boolean }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setMode(value)
        window.setTimeout(() => inputRef.current?.select(), 30)
      }}
      className={clsx(
        'relative flex flex-1 items-center gap-3 rounded-xl border-2 p-3 text-start transition disabled:cursor-not-allowed disabled:opacity-40',
        mode === value ? 'border-wood-warm bg-wood-warm/5 shadow-rose' : 'border-woodborder bg-white hover:border-wood-warm/40',
      )}
    >
      <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', mode === value ? 'bg-wood-btn text-white' : 'bg-wood-cream text-wood-medium')}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-wood-dark">{label}</p>
        <p className="truncate text-[11px] text-wood-medium">{sub}</p>
      </div>
      <kbd className="kbd absolute end-2 top-2">{hotkey}</kbd>
    </button>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product.name}
      subtitle={`${product.brand} · ${product.category}`}
      icon={<PackageOpen size={20} />}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={confirm} disabled={invalid} kbd="↵">
            <Check size={16} />
            {t('addToCart')} · {formatMoney(price)}
          </Button>
        </>
      }
    >
      <div className="space-y-4" onKeyDown={onKeyDown}>
        {/* Box or detail */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <ModeButton
            value="box"
            icon={<Package size={20} />}
            label={t('sellWholeBox').replace('{box}', boxName)}
            sub={product.salePrice > 0 ? `${formatMoney(product.salePrice)} · ${capacity} ${unit}` : t('boxPriceMissing')}
            hotkey="B"
            disabled={!canSellBox}
          />
          <ModeButton
            value="detail"
            icon={<PackageOpen size={20} />}
            label={t('sellByDetail')}
            sub={perUnit > 0 ? `${formatMoney(perUnit)} / ${unit}` : t('retailNotConfigured')}
            hotkey="D"
            disabled={!canSellDetail}
          />
        </div>

        {/* Quantity */}
        {mode === 'detail' && perUnit <= 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2.5 text-xs text-[#B45309]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {t('retailNotConfigured')}
          </p>
        ) : (
          <div>
            <label className="label-wood">
              {mode === 'detail' ? `${t('quantityToSell')} (${unit})` : `${t('numberOf')} ${boxesName}`}
            </label>
            <div className="flex items-stretch gap-2">
              <button type="button" onClick={() => nudge(-1)} className="flex w-12 items-center justify-center rounded-lg border border-[#D5DBE8] bg-white text-wood-dark transition hover:border-wood-warm hover:text-wood-warm active:scale-95">
                <Minus size={18} />
              </button>
              <input
                ref={inputRef}
                type="number"
                min={0}
                step={mode === 'detail' ? 'any' : 1}
                value={mode === 'detail' ? amount : boxes}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value))
                  if (mode === 'detail') setAmount(v)
                  else setBoxes(Math.floor(v))
                }}
                className="input-wood text-mono h-12 flex-1 text-center text-2xl font-bold"
                autoFocus
              />
              <button type="button" onClick={() => nudge(1)} className="flex w-12 items-center justify-center rounded-lg border border-[#D5DBE8] bg-white text-wood-dark transition hover:border-wood-warm hover:text-wood-warm active:scale-95">
                <Plus size={18} />
              </button>
            </div>
            {mode === 'detail' && presets.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {presets.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(v)}
                    className={clsx(
                      'rounded-md border px-2.5 py-1 text-xs font-bold transition',
                      amount === v ? 'border-wood-warm bg-wood-warm text-white' : 'border-[#D5DBE8] bg-white text-wood-medium hover:border-wood-warm/50 hover:text-wood-warm',
                    )}
                  >
                    {v === capacity ? `1 ${boxName}` : `${v} ${unit}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Price */}
        <motion.div
          key={`${mode}-${price}`}
          initial={{ scale: 0.98, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center justify-between rounded-xl bg-wood-sidebar px-4 py-3 text-white"
        >
          <span className="text-sm font-medium text-white/75">
            {mode === 'detail' ? `${amount} ${unit} × ${formatMoney(perUnit)}` : `${boxes} × ${formatMoney(product.salePrice)}`}
          </span>
          <span className="text-mono text-xl font-bold">{formatMoney(price)}</span>
        </motion.div>

        {/* Shelf now → after */}
        <div className="flex items-center gap-2 rounded-lg border border-woodborder bg-[#F8FAFD] px-3 py-2.5 text-xs">
          <span className="text-wood-medium">{t('shelfNow')}</span>
          <b className="text-wood-dark">
            {shelfBoxes} {boxesName}
            {shelfLoose > 0 && ` + ${shelfLoose} ${unit}`}
          </b>
          <ArrowRight size={13} className="shrink-0 text-wood-medium rtl:rotate-180" />
          <span className="text-wood-medium">{t('shelfAfter')}</span>
          <b className={tooMuch ? 'text-terracotta' : 'text-sage'}>
            {after.boxes} {boxesName}
            {after.rest > 0 && ` + ${after.rest} ${unit}`}
          </b>
        </div>
        {tooMuch && <p className="text-center text-xs font-semibold text-terracotta">{t('notEnoughContent')}</p>}
      </div>
    </Modal>
  )
}
