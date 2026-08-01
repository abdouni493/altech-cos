import { useMemo, useState } from 'react'
import { Search, Trash2, Beaker, PackageSearch, AlertTriangle } from 'lucide-react'
import { useProductStore } from '@/store/useProductStore'
import { useTranslation } from '@/i18n/useTranslation'
import { formatMoney, round2 } from '@/utils/helpers'
import { isDivisible, componentUnitCost, componentAvailable } from '@/utils/retail'
import type { Product, RecipeLine } from '@/types'

interface RecipeEditorProps {
  lines: RecipeLine[]
  onChange: (lines: RecipeLine[]) => void
  /** Warn when the stock cannot cover the recipe (production screen only). */
  checkStock?: boolean
}

/** Build a recipe line out of a product, defaulting to its natural unit. */
export const recipeLineFor = (p: Product): RecipeLine => {
  const byContent = isDivisible(p)
  return {
    productId: p.id,
    productName: p.name,
    quantity: byContent ? (p.retailStep || 1) : 1,
    unitCost: componentUnitCost(p, byContent),
    byContent,
    unit: byContent ? p.unit : undefined,
  }
}

export const recipeCost = (lines: RecipeLine[]): number =>
  round2(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0))

/**
 * The ingredient list shared by the fiche technique and the production form:
 * search a stock product, set how much of it a batch eats, read its cost.
 */
export const RecipeEditor = ({ lines, onChange, checkStock = false }: RecipeEditorProps) => {
  const { t } = useTranslation()
  const products = useProductStore((s) => s.products)
  const [query, setQuery] = useState('')

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q))
      .filter((p) => !lines.some((l) => l.productId === p.id))
      .slice(0, 6)
  }, [query, products, lines])

  const add = (p: Product) => {
    onChange([...lines, recipeLineFor(p)])
    setQuery('')
  }

  const patch = (productId: string, next: Partial<RecipeLine>) =>
    onChange(lines.map((l) => (l.productId === productId ? { ...l, ...next } : l)))

  const remove = (productId: string) => onChange(lines.filter((l) => l.productId !== productId))

  /** Switching between "whole units" and "content" re-prices the line. */
  const toggleMode = (line: RecipeLine, byContent: boolean) => {
    const product = products.find((p) => p.id === line.productId)
    if (!product) return
    patch(line.productId, {
      byContent,
      unitCost: componentUnitCost(product, byContent),
      unit: byContent ? product.unit : undefined,
    })
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-wood-medium/50" size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${t('addComponent')} (${t('productName')} / ${t('barcode')})`}
          className="input-wood ps-10"
        />
        {query && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-wood-light/30 bg-white shadow-wood-lg">
            {suggestions.length > 0 ? (
              suggestions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add(p)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm transition hover:bg-wood-cream"
                >
                  <span className="flex min-w-0 items-center gap-1.5 font-medium text-wood-dark">
                    {isDivisible(p) && <Beaker size={13} className="shrink-0 text-wood-warm" />}
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="text-mono shrink-0 text-xs text-wood-medium">
                    {isDivisible(p)
                      ? `${componentAvailable(p, true)} ${p.unit ?? ''}`
                      : `${p.quantity}`}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2.5 text-sm text-wood-medium">{t('noData')}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-wood-light/40 py-6 text-center text-sm text-wood-medium">
            <PackageSearch size={18} className="mx-auto mb-1.5 text-wood-light" />
            {t('emptyRecipe')}
          </p>
        ) : (
          lines.map((l) => {
            const product = products.find((p) => p.id === l.productId)
            const available = product ? componentAvailable(product, !!l.byContent) : 0
            const short = checkStock && l.quantity > available
            // Content lines are counted in the product's measure unit (ml, cm…),
            // whole-unit lines in bare units.
            const lineUnit = l.byContent ? (l.unit ?? product?.unit ?? '') : ''
            return (
              <div
                key={l.productId}
                className={`rounded-xl border p-3 ${short ? 'border-terracotta/50 bg-terracotta/5' : 'border-wood-light/25 bg-wood-cream/20'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 font-semibold text-wood-dark">
                    {l.byContent && <Beaker size={14} className="shrink-0 text-wood-warm" />}
                    <span className="truncate">{l.productName}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => remove(l.productId)}
                    className="rounded-lg p-1 text-terracotta hover:bg-terracotta/10"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <label className="text-xs text-wood-medium">
                    {`${t('componentQuantity')}${l.byContent && l.unit ? ` (${l.unit})` : ''}`}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.quantity}
                      onChange={(e) =>
                        patch(l.productId, { quantity: Math.max(0, Number(e.target.value)) })
                      }
                      className="input-wood mt-0.5 py-1.5"
                    />
                  </label>
                  <label className="text-xs text-wood-medium">
                    {`${t('unitCost')} (DA)`}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unitCost}
                      onChange={(e) => patch(l.productId, { unitCost: Number(e.target.value) })}
                      className="input-wood mt-0.5 py-1.5"
                    />
                  </label>
                  <div className="flex flex-col justify-end">
                    <span className="text-xs text-wood-medium">{t('subtotal')}</span>
                    <span className="text-mono py-1.5 font-bold text-wood-dark">
                      {formatMoney(round2(l.quantity * l.unitCost))}
                    </span>
                  </div>
                </div>

                {product && isDivisible(product) && (
                  <div className="mt-2 inline-flex rounded-lg border border-wood-light/40 bg-white/70 p-0.5">
                    {([
                      { v: true, l: `${t('useContent')} (${product.unit ?? ''})` },
                      { v: false, l: t('useWholeUnits') },
                    ] as const).map((o) => (
                      <button
                        key={String(o.v)}
                        type="button"
                        onClick={() => toggleMode(l, o.v)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                          !!l.byContent === o.v
                            ? 'bg-wood-btn text-white'
                            : 'text-wood-medium hover:bg-wood-cream'
                        }`}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                )}

                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-wood-medium">
                  {short && <AlertTriangle size={12} className="text-terracotta" />}
                  <span className={short ? 'font-semibold text-terracotta' : ''}>
                    {t('available')}: {available} {lineUnit}
                  </span>
                  {/* The batch removes exactly this much — in the product's own
                      measure unit when the recipe eats its content. */}
                  <span className="text-wood-warm">
                    · {t('deductedFromStock')}:{' '}
                    <b className="text-mono">
                      −{round2(l.quantity)} {lineUnit}
                    </b>
                  </span>
                </p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
