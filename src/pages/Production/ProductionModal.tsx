import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Check, Search, FlaskConical, Coins, TrendingUp, AlertTriangle, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { RecipeEditor, recipeCost } from './RecipeEditor'
import { useProductionStore } from '@/store/useProductionStore'
import { useProductStore } from '@/store/useProductStore'
import { useTranslation } from '@/i18n/useTranslation'
import { formatMoney, round2 } from '@/utils/helpers'
import { componentAvailable } from '@/utils/retail'
import type { Product, Production, RecipeLine, TechSheet } from '@/types'

interface ProductionModalProps {
  open: boolean
  onClose: () => void
  editing?: Production | null
  /** Pre-selected fiche technique (POS quick production, "produce" button). */
  presetSheet?: TechSheet | null
}

/** Scale a recipe to a different output quantity. */
export const scaleLines = (lines: RecipeLine[], ratio: number): RecipeLine[] =>
  lines.map((l) => ({ ...l, quantity: round2(l.quantity * ratio) }))

/**
 * Which components the stock cannot cover. `ignore` holds the quantities an
 * edited batch already took out of the stock and is about to give back.
 */
export const missingComponents = (
  lines: RecipeLine[],
  products: Product[],
  ignore: RecipeLine[] = [],
): string[] =>
  lines
    .filter((l) => {
      const product = products.find((p) => p.id === l.productId)
      if (!product) return true
      const back = ignore
        .filter((o) => o.productId === l.productId && !!o.byContent === !!l.byContent)
        .reduce((s, o) => s + o.quantity, 0)
      return l.quantity > round2(componentAvailable(product, !!l.byContent) + back)
    })
    .map((l) => l.productName)

export const ProductionModal = ({ open, onClose, editing, presetSheet }: ProductionModalProps) => {
  const { t } = useTranslation()
  const { sheets, addProduction, updateProduction } = useProductionStore()
  const products = useProductStore((s) => s.products)

  const [sheet, setSheet] = useState<TechSheet | null>(null)
  const [query, setQuery] = useState('')
  const [outputName, setOutputName] = useState('')
  const [outputQuantity, setOutputQuantity] = useState(1)
  const [outputUnitPrice, setOutputUnitPrice] = useState(0)
  const [lines, setLines] = useState<RecipeLine[]>([])
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  /** Load a fiche technique into the form — quantities, prices and recipe. */
  const loadSheet = (s: TechSheet) => {
    setSheet(s)
    setQuery(s.name)
    setOutputName(s.outputName || s.name)
    setOutputQuantity(s.outputQuantity)
    setOutputUnitPrice(s.outputUnitPrice)
    setLines(s.lines.map((l) => ({ ...l })))
  }

  useEffect(() => {
    if (!open) return
    if (editing) {
      setSheet(sheets.find((s) => s.id === editing.sheetId) ?? null)
      setQuery(editing.sheetName)
      setOutputName(editing.outputName)
      setOutputQuantity(editing.outputQuantity)
      setOutputUnitPrice(editing.outputUnitPrice)
      setLines(editing.lines.map((l) => ({ ...l })))
      setDate(format(new Date(editing.date), 'yyyy-MM-dd'))
    } else if (presetSheet) {
      loadSheet(presetSheet)
      setDate(format(new Date(), 'yyyy-MM-dd'))
    } else {
      setSheet(null)
      setQuery('')
      setOutputName('')
      setOutputQuantity(1)
      setOutputUnitPrice(0)
      setLines([])
      setDate(format(new Date(), 'yyyy-MM-dd'))
    }
  }, [open, editing, presetSheet]) // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (sheet && q === sheet.name.toLowerCase()) return []
    return sheets.filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 6)
  }, [query, sheets, sheet])

  /**
   * Raising the produced quantity scales the whole recipe from the fiche, so
   * the components follow on their own — the ratio is always taken from the
   * sheet's own yield, never from the previous on-screen value.
   */
  const changeOutputQuantity = (value: number) => {
    const next = Math.max(0, value)
    setOutputQuantity(next)
    if (sheet && sheet.outputQuantity > 0) {
      setLines(scaleLines(sheet.lines, next / sheet.outputQuantity))
    }
  }

  const totalCost = recipeCost(lines)
  const totalRevenue = round2(outputQuantity * outputUnitPrice)
  const gain = round2(totalRevenue - totalCost)
  const unitCost = outputQuantity > 0 ? round2(totalCost / outputQuantity) : 0

  // An edited batch already holds its previous quantities out of the stock.
  const missing = useMemo(
    () => missingComponents(lines, products, editing && editing.status === 'active' ? editing.lines : []),
    [lines, products, editing],
  )

  const submit = () => {
    if (lines.length === 0) {
      toast.error(t('emptyRecipe'))
      return
    }
    if (outputQuantity <= 0) {
      toast.error(`${t('outputQuantity')} — ${t('required')}`)
      return
    }
    if (missing.length > 0) {
      toast.error(`${t('notEnoughStock')} ${missing.join(', ')}`)
      return
    }
    const payload = {
      sheetId: sheet?.id ?? null,
      sheetName: sheet?.name ?? (query || t('production')),
      outputName: outputName || sheet?.outputName || query,
      outputQuantity,
      outputUnitPrice,
      lines,
      totalCost,
      totalRevenue,
      gain,
      date: new Date(date).toISOString(),
    }
    if (editing) {
      updateProduction(editing.id, payload)
      toast.success(t('saved'))
    } else {
      addProduction({ ...payload, soldQuantity: 0, status: 'active' })
      toast.success(t('productionCreated'))
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('editProduction') : t('newProduction')}
      subtitle={t('productionsHint')}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={missing.length > 0}>
            <Check size={16} />
            {editing ? t('save') : t('launchProduction')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Fiche technique picker */}
          <div className="mb-3">
            <label className="label-wood">{t('selectTechSheet')}</label>
            {sheet ? (
              <div className="flex items-center justify-between rounded-xl bg-sage/10 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-semibold text-wood-dark">
                    <FlaskConical size={15} className="shrink-0 text-wood-warm" />
                    {sheet.name}
                  </p>
                  <p className="truncate text-xs text-wood-medium">
                    {sheet.lines.length} {t('usedProducts').toLowerCase()} · {sheet.outputQuantity}{' '}
                    {sheet.outputName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSheet(null)
                    setQuery('')
                  }}
                  className="rounded-lg p-1 text-terracotta hover:bg-terracotta/10"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-wood-medium/50" size={18} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('searchTechSheet')}
                  className="input-wood ps-10"
                />
                {suggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-wood-light/30 bg-white shadow-wood-lg">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => loadSheet(s)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm transition hover:bg-wood-cream"
                      >
                        <span className="truncate font-medium text-wood-dark">{s.name}</span>
                        <span className="text-mono shrink-0 text-xs text-wood-medium">
                          {s.outputQuantity} × {formatMoney(s.outputUnitPrice)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <h4 className="mb-2 flex items-center gap-2 font-bold text-wood-dark">
            <FlaskConical size={18} className="text-wood-warm" />
            {t('usedProducts')}
          </h4>
          <RecipeEditor lines={lines} onChange={setLines} checkStock />

          {missing.length > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-terracotta/40 bg-terracotta/10 px-3 py-2.5 text-xs font-medium text-terracotta">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {t('notEnoughStock')} {missing.join(', ')}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-wood-light/25 p-3">
            <h4 className="mb-2 font-bold text-wood-dark">{t('outputQuantity')}</h4>
            <div className="space-y-2">
              <Input
                label={t('outputName')}
                value={outputName}
                onChange={(e) => setOutputName(e.target.value)}
              />
              <Input
                label={t('outputQuantity')}
                type="number"
                min={0}
                step="0.01"
                value={outputQuantity}
                onChange={(e) => changeOutputQuantity(Number(e.target.value))}
                hint={sheet ? t('productionsHint') : undefined}
              />
              <Input
                label={`${t('outputUnitPrice')} (DA)`}
                type="number"
                min={0}
                step="0.01"
                value={outputUnitPrice}
                onChange={(e) => setOutputUnitPrice(Number(e.target.value))}
              />
              <Input label={t('date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border border-wood-light/25 p-3">
            <h4 className="mb-2 flex items-center gap-2 font-bold text-wood-dark">
              <Coins size={16} className="text-wood-warm" />
              {t('productionCost')}
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-wood-cream/40 px-3 py-2">
                <span className="text-wood-medium">{t('productionCost')}</span>
                <span className="text-mono font-bold text-wood-dark">{formatMoney(totalCost)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-wood-cream/40 px-3 py-2">
                <span className="text-wood-medium">{t('unitCost')}</span>
                <span className="text-mono font-bold text-wood-dark">{formatMoney(unitCost)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-sage/10 px-3 py-2">
                <span className="text-wood-medium">{t('expectedRevenue')}</span>
                <span className="text-mono font-bold text-sage">{formatMoney(totalRevenue)}</span>
              </div>
              <div
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-white ${
                  gain >= 0 ? 'bg-wood-btn' : 'bg-gradient-to-br from-terracotta to-red-700'
                }`}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <TrendingUp size={15} />
                  {t('expectedGain')}
                </span>
                <span className="text-mono font-bold">
                  {gain >= 0 ? '+' : ''}
                  {formatMoney(gain)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
