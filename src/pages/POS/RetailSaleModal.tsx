import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Beaker, Check, Package, AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useTranslation } from '@/i18n/useTranslation'
import { formatMoney, round2 } from '@/utils/helpers'
import { capacityOf, contentUnitPrice } from '@/utils/retail'
import type { Product } from '@/types'

interface RetailSaleModalProps {
  open: boolean
  onClose: () => void
  product: Product | null
  /** Content still sellable once what is already in the cart is deducted. */
  available: number
  /** Sell `amount` units of content (ml, g…). */
  onSellRetail: (amount: number) => void
  /** Sell one whole sealed container instead. */
  onSellWhole: () => void
}

/**
 * "How much do you want?" — the counter dialog of a divisible product.
 * The price follows the quantity: 10 ml at 1000 DA makes 25 ml cost 2500 DA.
 */
export const RetailSaleModal = ({
  open,
  onClose,
  product,
  available,
  onSellRetail,
  onSellWhole,
}: RetailSaleModalProps) => {
  const { t } = useTranslation()
  const [amount, setAmount] = useState(0)

  const step = product?.retailStep ?? 0
  const unit = product?.unit ?? ''
  const perUnit = product ? contentUnitPrice(product) : 0
  const price = round2(amount * perUnit)
  const tooMuch = amount > available

  useEffect(() => {
    if (open) setAmount(step > 0 ? step : 1)
  }, [open, step])

  if (!product) return null

  // One tap for the usual portions of the shop.
  const presets = step > 0 ? [step, step * 2, step * 3, step * 5] : []

  const confirm = () => {
    if (amount <= 0) {
      toast.error(t('required'))
      return
    }
    if (tooMuch) {
      toast.error(t('notEnoughContent'))
      return
    }
    onSellRetail(amount)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product.name}
      subtitle={`${t('sellRetail')} — ${product.brand} · ${product.category}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={confirm} disabled={tooMuch || amount <= 0 || perUnit <= 0}>
            <Check size={16} />
            {t('addToCart')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* What is on the shelf right now */}
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-wood-cream/40 p-2.5">
            <p className="text-[10px] text-wood-medium">{t('containers')}</p>
            <p className="text-mono font-bold text-wood-dark">{product.quantity}</p>
          </div>
          <div className="rounded-xl bg-wood-cream/40 p-2.5">
            <p className="text-[10px] text-wood-medium">{t('openContainer')}</p>
            <p className="text-mono font-bold text-wood-warm">
              {round2(product.openRemaining ?? 0)} {unit}
            </p>
          </div>
          <div className="rounded-xl bg-sage/10 p-2.5">
            <p className="text-[10px] text-wood-medium">{t('available')}</p>
            <p className="text-mono font-bold text-sage">
              {round2(available)} {unit}
            </p>
          </div>
        </div>

        {perUnit <= 0 ? (
          <p className="flex items-start gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5 text-xs text-[#8a6420]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {t('retailNotConfigured')}
          </p>
        ) : (
          <>
            <div>
              <label className="label-wood">{`${t('quantityToSell')} (${unit})`}</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                className="input-wood text-lg font-bold"
                autoFocus
              />
              {presets.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {presets.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(v)}
                      disabled={v > available}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 ${
                        amount === v
                          ? 'border-wood-warm bg-wood-cream text-wood-dark'
                          : 'border-wood-light/40 text-wood-medium hover:bg-wood-cream'
                      }`}
                    >
                      {v} {unit}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl bg-wood-btn px-3 py-2.5 text-white">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Beaker size={15} />
                {amount} {unit}
              </span>
              <span className="text-mono text-lg font-bold">{formatMoney(price)}</span>
            </div>
            <p className="text-center text-xs text-wood-medium">
              {step} {unit} = {formatMoney(product.retailPrice ?? 0)} · {formatMoney(perUnit)}/{unit}
            </p>
            {tooMuch && (
              <p className="text-center text-xs font-semibold text-terracotta">{t('notEnoughContent')}</p>
            )}
          </>
        )}

        {/* A whole sealed container is still a normal sale */}
        {product.quantity > 0 && product.salePrice > 0 && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              onSellWhole()
              onClose()
            }}
          >
            <Package size={15} />
            {t('sellWhole')} ({capacityOf(product)} {unit}) — {formatMoney(product.salePrice)}
          </Button>
        )}
      </div>
    </Modal>
  )
}
