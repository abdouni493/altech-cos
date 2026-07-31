import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Search,
  FlaskConical,
  Zap,
  AlertTriangle,
  ChevronRight,
  Coins,
  TrendingUp,
  Beaker,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useProductionStore } from '@/store/useProductionStore'
import { useProductStore } from '@/store/useProductStore'
import { useTranslation } from '@/i18n/useTranslation'
import { formatMoney, round2 } from '@/utils/helpers'
import { scaleLines, missingComponents } from '@/pages/Production/ProductionModal'
import type { Production, TechSheet } from '@/types'

interface QuickProductionModalProps {
  open: boolean
  onClose: () => void
  /** The batch was manufactured — the POS drops it straight into the cart. */
  onProduced: (production: Production) => void
}

/**
 * POS shortcut: run a fiche technique without leaving the till. The batch is
 * manufactured for real — the stock of every component is deducted — and the
 * finished article lands in the current sale.
 */
export const QuickProductionModal = ({ open, onClose, onProduced }: QuickProductionModalProps) => {
  const { t } = useTranslation()
  const sheets = useProductionStore((s) => s.sheets)
  const addProduction = useProductionStore((s) => s.addProduction)
  const products = useProductStore((s) => s.products)

  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState<TechSheet | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)

  useEffect(() => {
    if (open) return
    setQuery('')
    setSheet(null)
    setQuantity(1)
    setUnitPrice(0)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sheets.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.outputName.toLowerCase().includes(q),
    )
  }, [sheets, query])

  const select = (s: TechSheet) => {
    setSheet(s)
    setQuantity(s.outputQuantity)
    setUnitPrice(s.outputUnitPrice)
  }

  // The recipe follows the quantity asked for at the till.
  const lines = useMemo(
    () => (sheet && sheet.outputQuantity > 0 ? scaleLines(sheet.lines, quantity / sheet.outputQuantity) : []),
    [sheet, quantity],
  )
  const totalCost = round2(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0))
  const totalRevenue = round2(quantity * unitPrice)
  const gain = round2(totalRevenue - totalCost)
  const missing = useMemo(() => missingComponents(lines, products), [lines, products])

  const produce = () => {
    if (!sheet) return
    if (quantity <= 0) {
      toast.error(`${t('outputQuantity')} — ${t('required')}`)
      return
    }
    if (missing.length > 0) {
      toast.error(`${t('notEnoughStock')} ${missing.join(', ')}`)
      return
    }
    const production = addProduction({
      sheetId: sheet.id,
      sheetName: sheet.name,
      outputName: sheet.outputName || sheet.name,
      outputQuantity: quantity,
      outputUnitPrice: unitPrice,
      lines,
      totalCost,
      totalRevenue,
      gain,
      soldQuantity: 0,
      status: 'active',
      date: new Date().toISOString(),
    })
    toast.success(t('productionCreated'))
    onProduced(production)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('quickProduction')}
      subtitle={t('quickProductionHint')}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="sage" onClick={produce} disabled={!sheet || missing.length > 0}>
            <Zap size={16} />
            {t('produceAndSell')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-wood-medium/50" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchTechSheet')}
            className="input-wood ps-10"
            autoFocus
          />
        </div>

        {/* Every fiche technique, one tap away */}
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-wood-medium">{t('noTechSheet')}</p>
          ) : (
            filtered.map((s) => {
              const cost = round2(s.lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0))
              const active = sheet?.id === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => select(s)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-start transition ${
                    active
                      ? 'border-wood-warm bg-wood-cream/60 shadow-wood'
                      : 'border-wood-light/25 bg-white/60 hover:bg-wood-cream/40'
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                    <FlaskConical size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-wood-dark">{s.name}</p>
                    <p className="truncate text-xs text-wood-medium">
                      {s.outputQuantity} × {s.outputName || s.name} · {t('productionCost')}{' '}
                      {formatMoney(cost)}
                    </p>
                  </div>
                  <span className="text-mono shrink-0 text-sm font-bold text-sage">
                    {formatMoney(s.outputUnitPrice)}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-wood-medium/60" />
                </button>
              )
            })
          )}
        </div>

        {sheet && (
          <div className="space-y-3 rounded-xl border border-wood-light/30 bg-wood-cream/30 p-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('outputQuantity')}
                type="number"
                min={0}
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
              />
              <Input
                label={`${t('outputUnitPrice')} (DA)`}
                type="number"
                min={0}
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(Number(e.target.value))}
              />
            </div>

            {/* What the batch will take out of the stock */}
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-wood-medium">
                {t('usedProducts')}
              </p>
              {lines.map((l) => (
                <div key={l.productId} className="flex items-center justify-between text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 text-wood-dark">
                    {l.byContent && <Beaker size={12} className="shrink-0 text-wood-warm" />}
                    <span className="truncate">{l.productName}</span>
                  </span>
                  <span className="text-mono shrink-0 text-wood-medium">
                    − {l.quantity} {l.byContent ? (l.unit ?? '') : ''}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-white/70 py-1.5">
                <p className="flex items-center justify-center gap-1 text-[10px] text-wood-medium">
                  <Coins size={11} />
                  {t('productionCost')}
                </p>
                <p className="text-mono font-bold">{formatMoney(totalCost)}</p>
              </div>
              <div className="rounded-lg bg-white/70 py-1.5">
                <p className="text-[10px] text-wood-medium">{t('expectedRevenue')}</p>
                <p className="text-mono font-bold text-sage">{formatMoney(totalRevenue)}</p>
              </div>
              <div className="rounded-lg bg-white/70 py-1.5">
                <p className="flex items-center justify-center gap-1 text-[10px] text-wood-medium">
                  <TrendingUp size={11} />
                  {t('expectedGain')}
                </p>
                <p className={`text-mono font-bold ${gain >= 0 ? 'text-sage' : 'text-terracotta'}`}>
                  {gain >= 0 ? '+' : ''}
                  {formatMoney(gain)}
                </p>
              </div>
            </div>

            {missing.length > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-terracotta/40 bg-terracotta/10 px-3 py-2 text-xs font-medium text-terracotta">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {t('notEnoughStock')} {missing.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
