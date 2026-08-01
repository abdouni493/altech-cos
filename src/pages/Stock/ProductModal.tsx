import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useReactToPrint } from 'react-to-print'
import { useRef } from 'react'
import toast from 'react-hot-toast'
import { Plus, RefreshCw, Printer, Check, Boxes, Info, Beaker, Coins, CalendarClock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Barcode } from '@/components/shared/BarcodeGenerator'
import { useProductStore } from '@/store/useProductStore'
import { useTranslation } from '@/i18n/useTranslation'
import { generateEAN13, round2 } from '@/utils/helpers'
import type { Product } from '@/types'

// Creating a product captures its identity: pricing, alert threshold and
// expiration start empty and are filled in by the first purchase. Editing an
// existing product unlocks every field — quantity, prices, alert and expiry.
// Retail selling (a 100 ml bottle sold by 10 ml portions) is configured here so
// the purchase screen already knows the article is divisible.
const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  barcode: z.string().optional(),
  brand: z.string().min(1),
  category: z.string().min(1),
  quantity: z.coerce.number().min(0),
  purchasePrice: z.coerce.number().min(0).optional(),
  salePrice: z.coerce.number().min(0).optional(),
  minQuantity: z.coerce.number().min(0).optional(),
  hasExpiration: z.boolean().optional(),
  expirationDate: z.string().optional(),
  isDivisible: z.boolean().optional(),
  unit: z.string().optional(),
  capacity: z.coerce.number().min(0).optional(),
  retailStep: z.coerce.number().min(0).optional(),
  retailPrice: z.coerce.number().min(0).optional(),
})
type FormData = z.infer<typeof schema>

/** Units every shop needs — the list grows with whatever the user creates. */
const DEFAULT_UNITS = ['ml', 'L', 'g', 'kg', 'cm', 'm', 'pcs']

interface ProductModalProps {
  open: boolean
  onClose: () => void
  product?: Product | null
  onSaved?: (product: Product) => void
  presetName?: string
}

export const ProductModal = ({ open, onClose, product, onSaved, presetName }: ProductModalProps) => {
  const { t } = useTranslation()
  const { brands, categories, units, addProduct, updateProduct, addBrand, addCategory, addUnit } =
    useProductStore()
  const printRef = useRef<HTMLDivElement>(null)

  const [showAddBrand, setShowAddBrand] = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const [showAddUnit, setShowAddUnit] = useState(false)
  const [newBrand, setNewBrand] = useState('')
  const [newCat, setNewCat] = useState('')
  const [newUnit, setNewUnit] = useState('')

  // Shop units first, then the built-in ones that are still missing.
  const unitOptions = [...units, ...DEFAULT_UNITS.filter((u) => !units.includes(u))]

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      barcode: '',
      brand: brands[0] ?? '',
      category: categories[0] ?? '',
      quantity: 0,
      purchasePrice: 0,
      salePrice: 0,
      minQuantity: 0,
      hasExpiration: false,
      expirationDate: '',
      isDivisible: false,
      unit: 'ml',
      capacity: 0,
      retailStep: 0,
      retailPrice: 0,
    },
  })

  useEffect(() => {
    if (!open) return
    if (product) {
      reset({
        name: product.name,
        description: product.description ?? '',
        barcode: product.barcode ?? '',
        brand: product.brand,
        category: product.category,
        quantity: product.quantity,
        purchasePrice: product.purchasePrice ?? 0,
        salePrice: product.salePrice ?? 0,
        minQuantity: product.minQuantity ?? 0,
        hasExpiration: !!product.hasExpiration,
        expirationDate: (product.expirationDate ?? '').slice(0, 10),
        isDivisible: !!product.isDivisible,
        unit: product.unit || 'ml',
        capacity: product.capacity ?? 0,
        retailStep: product.retailStep ?? 0,
        retailPrice: product.retailPrice ?? 0,
      })
    } else {
      reset({
        name: presetName ?? '',
        description: '',
        barcode: '', // empty by default — generate on demand
        brand: brands[0] ?? '',
        category: categories[0] ?? '',
        quantity: 0,
        purchasePrice: 0,
        salePrice: 0,
        minQuantity: 0,
        hasExpiration: false,
        expirationDate: '',
        isDivisible: false,
        unit: unitOptions[0] ?? 'ml',
        capacity: 0,
        retailStep: 0,
        retailPrice: 0,
      })
    }
  }, [open, product, presetName]) // eslint-disable-line react-hooks/exhaustive-deps

  const barcode = watch('barcode')
  const isDivisible = watch('isDivisible')
  const hasExpiration = watch('hasExpiration')
  const unit = watch('unit')
  const quantity = Number(watch('quantity') ?? 0)
  const capacity = Number(watch('capacity') ?? 0)
  const retailStep = Number(watch('retailStep') ?? 0)
  const retailPrice = Number(watch('retailPrice') ?? 0)

  const handlePrint = useReactToPrint({ content: () => printRef.current })

  /**
   * The retail block only makes sense once the content of one unit is known.
   * `openRemaining` is never typed in: it is the leftover the till and the
   * production module keep updating on their own, so it is only carried over.
   */
  const retailFields = (data: FormData) => ({
    isDivisible: !!data.isDivisible,
    unit: data.isDivisible ? (data.unit ?? '') : '',
    capacity: data.isDivisible ? (data.capacity ?? 0) : 0,
    retailStep: data.isDivisible ? (data.retailStep ?? 0) : 0,
    retailPrice: data.isDivisible ? (data.retailPrice ?? 0) : 0,
    openRemaining: data.isDivisible ? (product?.openRemaining ?? 0) : 0,
  })

  const onSubmit = (data: FormData) => {
    if (data.isDivisible && (data.capacity ?? 0) <= 0) {
      toast.error(`${t('totalCapacity')} — ${t('required')}`)
      return
    }
    if (product) {
      // Edit: every field of the product is editable, pricing and expiry included.
      const patch = {
        name: data.name,
        description: data.description ?? '',
        barcode: data.barcode ?? '',
        brand: data.brand,
        category: data.category,
        quantity: data.quantity,
        purchasePrice: data.purchasePrice ?? 0,
        salePrice: data.salePrice ?? 0,
        minQuantity: data.minQuantity ?? 0,
        hasExpiration: !!data.hasExpiration,
        expirationDate: data.hasExpiration ? data.expirationDate || undefined : undefined,
        ...retailFields(data),
      }
      updateProduct(product.id, patch)
      toast.success(t('saved'))
      onSaved?.({ ...product, ...patch })
    } else {
      // New product: pricing, alert threshold and expiration start empty and are
      // filled in automatically when the first purchase of this product is saved.
      const created = addProduct({
        name: data.name,
        description: data.description ?? '',
        barcode: data.barcode ?? '',
        brand: data.brand,
        category: data.category,
        quantity: data.quantity,
        purchasePrice: 0,
        salePrice: 0,
        minQuantity: 0,
        hasExpiration: false,
        expirationDate: undefined,
        ...retailFields(data),
      })
      toast.success(t('saved'))
      onSaved?.(created)
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? t('editProduct') : t('newProduct')}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit(onSubmit)}>
            <Check size={16} />
            {t('save')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label={t('productName')} {...register('name')} error={errors.name && t('required')} />
        <Textarea label={t('description')} {...register('description')} />

        {/* Brand + Category */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="flex items-end gap-2">
              <Select label={t('brand')} {...register('brand')} error={errors.brand && t('required')}>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setShowAddBrand((v) => !v)}>
                <Plus size={18} />
              </Button>
            </div>
            {showAddBrand && (
              <div className="mt-2 flex gap-2">
                <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder={t('newBrand')} className="input-wood" />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (newBrand.trim()) {
                      addBrand(newBrand.trim())
                      setValue('brand', newBrand.trim())
                      setNewBrand('')
                      setShowAddBrand(false)
                    }
                  }}
                >
                  <Check size={15} />
                </Button>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-end gap-2">
              <Select label={t('category')} {...register('category')} error={errors.category && t('required')}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setShowAddCat((v) => !v)}>
                <Plus size={18} />
              </Button>
            </div>
            {showAddCat && (
              <div className="mt-2 flex gap-2">
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder={t('newCategory')} className="input-wood" />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (newCat.trim()) {
                      addCategory(newCat.trim())
                      setValue('category', newCat.trim())
                      setNewCat('')
                      setShowAddCat(false)
                    }
                  }}
                >
                  <Check size={15} />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Retail selling — a 100 ml bottle sold by 10 ml portions.
            Order asked by the shop: unit → total quantity → sold quantity & price. */}
        <div className="rounded-xl border border-wood-light/30 bg-gradient-to-br from-fuchsia-50/60 to-white p-4">
          <label className="flex cursor-pointer items-center gap-2">
            <span className="relative inline-flex">
              <input type="checkbox" className="peer sr-only" {...register('isDivisible')} />
              <span className="h-5 w-9 rounded-full bg-wood-light/40 transition peer-checked:bg-wood-warm" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4 rtl:peer-checked:-translate-x-4" />
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-wood-dark">
              <Beaker size={15} className="text-wood-warm" />
              {t('enableRetail')}
            </span>
          </label>

          {isDivisible && (
            <div className="mt-3 space-y-3">
              <p className="flex items-start gap-2 text-xs text-wood-medium">
                <Info size={13} className="mt-0.5 shrink-0 text-wood-warm" />
                {t('retailHint')}
              </p>

              {/* 1 — measure unit */}
              <div>
                <div className="flex items-end gap-2">
                  <Select label={`1. ${t('measureUnit')}`} {...register('unit')}>
                    {unitOptions.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </Select>
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowAddUnit((v) => !v)}>
                    <Plus size={18} />
                  </Button>
                </div>
                {showAddUnit && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                      placeholder={t('newUnit')}
                      className="input-wood"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const name = newUnit.trim()
                        if (!name) return
                        addUnit(name)
                        setValue('unit', name)
                        setNewUnit('')
                        setShowAddUnit(false)
                      }}
                    >
                      <Check size={15} />
                    </Button>
                  </div>
                )}
              </div>

              {/* 2 — total quantity held by one unit */}
              <div>
                <label className="label-wood">{`2. ${t('totalCapacity')} (${unit || ''})`}</label>
                <input type="number" min={0} step="0.01" className="input-wood" {...register('capacity')} />
              </div>

              {/* 3 — quantity sold at the counter and its price */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label-wood">{`3. ${t('portionSize')} (${unit || ''})`}</label>
                  <input type="number" min={0} step="0.01" className="input-wood" {...register('retailStep')} />
                </div>
                <div>
                  <label className="label-wood">{`4. ${t('portionPrice')} (DA)`}</label>
                  <input type="number" min={0} step="0.01" className="input-wood" {...register('retailPrice')} />
                </div>
              </div>

              <div className="rounded-xl bg-wood-cream/50 px-3 py-2 text-xs text-wood-medium">
                {retailStep > 0 && retailPrice > 0 ? (
                  <>
                    {t('pricePerUnit')} {unit}:{' '}
                    <b className="text-mono text-wood-dark">
                      {(retailPrice / retailStep).toFixed(2)} DA
                    </b>
                    {capacity > 0 && (
                      <>
                        {' · '}
                        {t('totalContent')}:{' '}
                        <b className="text-mono text-wood-dark">
                          {round2(quantity * capacity + (product?.openRemaining ?? 0))} {unit}
                        </b>
                      </>
                    )}
                  </>
                ) : (
                  t('retailNotConfigured')
                )}
              </div>
            </div>
          )}
        </div>

        {/* Stock — and, when editing, every price / alert / expiry field */}
        <div className="rounded-xl border border-wood-light/30 bg-wood-cream/30 p-4">
          <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-wood-dark">
            <Boxes size={15} className="text-wood-warm" />
            {product ? t('stockAndPricing') : t('currentStock')}
          </h4>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label-wood">
                {isDivisible ? `${t('currentStock')} — ${t('sealedUnits')}` : t('currentStock')}
              </label>
              <input type="number" min={0} className="input-wood" {...register('quantity')} />
            </div>

            {product && (
              <>
                <div>
                  <label className="label-wood">{t('minQuantity')}</label>
                  <input type="number" min={0} className="input-wood" {...register('minQuantity')} />
                </div>
                <div>
                  <label className="label-wood flex items-center gap-1.5">
                    <Coins size={14} className="text-wood-warm" />
                    {`${t('purchasePrice')} (DA)`}
                  </label>
                  <input type="number" min={0} step="0.01" className="input-wood" {...register('purchasePrice')} />
                </div>
                <div>
                  <label className="label-wood flex items-center gap-1.5">
                    <Coins size={14} className="text-sage" />
                    {`${t('salePrice')} (DA)`}
                  </label>
                  <input type="number" min={0} step="0.01" className="input-wood" {...register('salePrice')} />
                </div>
              </>
            )}
          </div>

          {product && (
            <div className="mt-3 space-y-2">
              <label className="flex cursor-pointer items-center gap-2">
                <span className="relative inline-flex">
                  <input type="checkbox" className="peer sr-only" {...register('hasExpiration')} />
                  <span className="h-5 w-9 rounded-full bg-wood-light/40 transition peer-checked:bg-wood-warm" />
                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4 rtl:peer-checked:-translate-x-4" />
                </span>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-wood-dark">
                  <CalendarClock size={15} className="text-wood-warm" />
                  {t('enableExpiration')}
                </span>
              </label>
              {hasExpiration && (
                <div className="sm:max-w-[50%]">
                  <label className="label-wood">{t('expirationDate')}</label>
                  <input type="date" className="input-wood" {...register('expirationDate')} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Barcode (optional) */}
        <div className="rounded-xl border border-wood-light/30 bg-wood-cream/40 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input label={`${t('barcode')} (${t('optional')})`} className="font-mono" {...register('barcode')} />
            <Button type="button" variant="outline" onClick={() => setValue('barcode', generateEAN13())}>
              <RefreshCw size={15} />
              {t('generateBarcode')}
            </Button>
            <Button type="button" variant="gold" onClick={handlePrint} disabled={!barcode}>
              <Printer size={15} />
              {t('printBarcode')}
            </Button>
          </div>
          {barcode ? (
            <div className="mt-3 flex justify-center rounded-lg bg-white p-2">
              <Barcode value={barcode} />
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-wood-medium/80">
              <Info size={13} /> {t('barcodeOptionalHint')}
            </p>
          )}
          {/* print template */}
          <div className="hidden">
            <div ref={printRef} className="print-area flex flex-col items-center p-6">
              <p className="mb-2 text-center text-lg font-bold">{watch('name')}</p>
              {barcode && <Barcode value={barcode} height={80} />}
            </div>
          </div>
        </div>

        {/* Creation: prices come with the first purchase. Edition: everything is editable. */}
        <div className="flex items-start gap-2 rounded-xl border border-wood-light/30 bg-gradient-to-br from-wood-cream/60 to-white px-4 py-3 text-xs text-wood-medium">
          <Info size={15} className="mt-0.5 shrink-0 text-wood-warm" />
          <span>{product ? t('editProductHint') : t('pricingLaterHint')}</span>
        </div>
      </form>
    </Modal>
  )
}
