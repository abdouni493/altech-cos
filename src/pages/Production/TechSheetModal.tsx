import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, FlaskConical, Info, Coins, TrendingUp } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { RecipeEditor, recipeCost } from './RecipeEditor'
import { useProductionStore } from '@/store/useProductionStore'
import { useTranslation } from '@/i18n/useTranslation'
import { formatMoney, round2 } from '@/utils/helpers'
import type { RecipeLine, TechSheet } from '@/types'

interface TechSheetModalProps {
  open: boolean
  onClose: () => void
  editing?: TechSheet | null
}

const blank = () => ({
  name: '',
  description: '',
  outputName: '',
  outputQuantity: 1,
  outputUnitPrice: 0,
})

/**
 * Create / edit a "fiche technique" — the recipe of a finished article.
 * Saving one never moves the stock: it only describes what a batch consumes.
 */
export const TechSheetModal = ({ open, onClose, editing }: TechSheetModalProps) => {
  const { t } = useTranslation()
  const { addSheet, updateSheet } = useProductionStore()

  const [form, setForm] = useState(blank())
  const [lines, setLines] = useState<RecipeLine[]>([])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name: editing.name,
        description: editing.description ?? '',
        outputName: editing.outputName || editing.name,
        outputQuantity: editing.outputQuantity,
        outputUnitPrice: editing.outputUnitPrice,
      })
      setLines(editing.lines.map((l) => ({ ...l })))
    } else {
      setForm(blank())
      setLines([])
    }
  }, [open, editing])

  const totalCost = recipeCost(lines)
  const outputQty = Math.max(0, form.outputQuantity)
  const revenue = round2(outputQty * form.outputUnitPrice)
  const gain = round2(revenue - totalCost)
  const unitCost = outputQty > 0 ? round2(totalCost / outputQty) : 0
  const marginPct = revenue > 0 ? (gain / revenue) * 100 : 0

  const submit = () => {
    if (!form.name.trim()) {
      toast.error(t('required'))
      return
    }
    if (lines.length === 0) {
      toast.error(t('emptyRecipe'))
      return
    }
    if (outputQty <= 0) {
      toast.error(`${t('outputQuantity')} — ${t('required')}`)
      return
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      outputName: (form.outputName || form.name).trim(),
      outputQuantity: outputQty,
      outputUnitPrice: form.outputUnitPrice,
      lines,
    }
    if (editing) updateSheet(editing.id, payload)
    else addSheet(payload)
    toast.success(t('saved'))
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('editTechSheet') : t('newTechSheet')}
      subtitle={t('techSheetsHint')}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={submit}>
            <Check size={16} />
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Recipe */}
        <div className="lg:col-span-2">
          <div className="mb-3 space-y-3">
            <Input
              label={t('techSheetName')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Textarea
              label={t('description')}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <h4 className="mb-2 flex items-center gap-2 font-bold text-wood-dark">
            <FlaskConical size={18} className="text-wood-warm" />
            {t('usedProducts')}
          </h4>
          <RecipeEditor lines={lines} onChange={setLines} />
        </div>

        {/* Output & economics */}
        <div className="space-y-4">
          <div className="rounded-xl border border-wood-light/25 p-3">
            <h4 className="mb-2 font-bold text-wood-dark">{t('outputQuantity')}</h4>
            <div className="space-y-2">
              <Input
                label={t('outputName')}
                value={form.outputName}
                onChange={(e) => setForm({ ...form, outputName: e.target.value })}
                placeholder={form.name}
              />
              <Input
                label={t('outputQuantity')}
                type="number"
                min={0}
                step="0.01"
                value={form.outputQuantity}
                onChange={(e) => setForm({ ...form, outputQuantity: Number(e.target.value) })}
              />
              <Input
                label={`${t('outputUnitPrice')} (DA)`}
                type="number"
                min={0}
                step="0.01"
                value={form.outputUnitPrice}
                onChange={(e) => setForm({ ...form, outputUnitPrice: Number(e.target.value) })}
              />
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
                <span className="text-mono font-bold text-sage">{formatMoney(revenue)}</span>
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
              {revenue > 0 && (
                <p className="text-end text-xs text-wood-medium">
                  {t('marginRate')}: <b className="text-mono">{marginPct.toFixed(1)} %</b>
                </p>
              )}
            </div>
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-wood-light/30 bg-wood-cream/40 px-3 py-2.5 text-xs text-wood-medium">
            <Info size={14} className="mt-0.5 shrink-0 text-wood-warm" />
            {t('techSheetsHint')}
          </p>
        </div>
      </div>
    </Modal>
  )
}
