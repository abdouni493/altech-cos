import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  FlaskConical,
  ClipboardList,
  Undo2,
  Coins,
  TrendingUp,
  Package,
  Beaker,
  PlayCircle,
  Boxes,
} from 'lucide-react'
import { PageHeader, SearchInput, EmptyState } from '@/components/ui/Misc'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TechSheetModal } from './TechSheetModal'
import { ProductionModal } from './ProductionModal'
import { useProductionStore } from '@/store/useProductionStore'
import { useTranslation } from '@/i18n/useTranslation'
import { formatMoney, round2 } from '@/utils/helpers'
import { productionRemaining, productionUnitCost, productionStats } from '@/utils/calculations'
import { cardVariants, staggerContainer } from '@/utils/animations'
import type { Production, RecipeLine, TechSheet } from '@/types'

type Tab = 'sheets' | 'productions'

/** Recipe read-out shared by both "view details" modals. */
const RecipeTable = ({ lines }: { lines: RecipeLine[] }) => {
  const { t } = useTranslation()
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-wood-light/30 text-xs uppercase text-wood-medium">
          <th className="py-2 text-start">{t('productName')}</th>
          <th className="py-2 text-center">{t('componentQuantity')}</th>
          <th className="py-2 text-end">{t('unitCost')}</th>
          <th className="py-2 text-end">{t('subtotal')}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.productId} className="border-b border-wood-cream">
            <td className="py-2 font-medium text-wood-dark">
              <span className="flex items-center gap-1.5">
                {l.byContent && <Beaker size={13} className="shrink-0 text-wood-warm" />}
                {l.productName}
              </span>
            </td>
            <td className="py-2 text-center">
              {l.quantity} {l.byContent ? (l.unit ?? '') : ''}
            </td>
            <td className="text-mono py-2 text-end">{formatMoney(l.unitCost)}</td>
            <td className="text-mono py-2 text-end font-semibold">
              {formatMoney(round2(l.quantity * l.unitCost))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const StatTile = ({
  icon,
  label,
  value,
  accent,
  index,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: string
  index: number
}) => (
  <motion.div
    variants={cardVariants}
    custom={index}
    initial="initial"
    animate="animate"
    className="card-wood flex items-center gap-3 rounded-2xl p-3.5"
  >
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-wood ${accent}`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="truncate text-[11px] text-wood-medium">{label}</p>
      <p className="text-mono truncate text-lg font-bold text-wood-dark">{value}</p>
    </div>
  </motion.div>
)

/**
 * Production module — two screens under one roof:
 *   · Fiches techniques : the recipes, costed but never deducted from the stock
 *   · Productions       : the batches actually made, which DO move the stock
 */
export const ProductionPage = () => {
  const { t } = useTranslation()
  const {
    sheets,
    productions,
    deleteSheet,
    deleteProduction,
    recoverProduction,
  } = useProductionStore()

  const [tab, setTab] = useState<Tab>('sheets')
  const [search, setSearch] = useState('')

  const [sheetModal, setSheetModal] = useState(false)
  const [editingSheet, setEditingSheet] = useState<TechSheet | null>(null)
  const [viewingSheet, setViewingSheet] = useState<TechSheet | null>(null)
  const [deletingSheet, setDeletingSheet] = useState<TechSheet | null>(null)

  const [prodModal, setProdModal] = useState(false)
  const [presetSheet, setPresetSheet] = useState<TechSheet | null>(null)
  const [editingProd, setEditingProd] = useState<Production | null>(null)
  const [viewingProd, setViewingProd] = useState<Production | null>(null)
  const [deletingProd, setDeletingProd] = useState<Production | null>(null)
  const [recovering, setRecovering] = useState<Production | null>(null)

  const stats = useMemo(() => productionStats(productions), [productions])

  const filteredSheets = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sheets.filter((s) => !q || s.name.toLowerCase().includes(q) || s.outputName.toLowerCase().includes(q))
  }, [sheets, search])

  const filteredProductions = useMemo(() => {
    const q = search.trim().toLowerCase()
    return productions.filter(
      (p) =>
        !q ||
        p.reference.toLowerCase().includes(q) ||
        p.sheetName.toLowerCase().includes(q) ||
        p.outputName.toLowerCase().includes(q),
    )
  }, [productions, search])

  const openNewSheet = () => {
    setEditingSheet(null)
    setSheetModal(true)
  }
  const openNewProduction = () => {
    setEditingProd(null)
    setPresetSheet(null)
    setProdModal(true)
  }
  /** "Produce this sheet" straight from a fiche card. */
  const produceFrom = (sheet: TechSheet) => {
    setEditingProd(null)
    setPresetSheet(sheet)
    setTab('productions')
    setProdModal(true)
  }

  return (
    <div>
      <PageHeader
        title={t('production')}
        subtitle={`${sheets.length} ${t('techSheets').toLowerCase()} · ${productions.length} ${t('productions').toLowerCase()}`}
        actions={
          tab === 'sheets' ? (
            <Button onClick={openNewSheet}>
              <Plus size={18} />
              {t('newTechSheet')}
            </Button>
          ) : (
            <Button onClick={openNewProduction}>
              <Plus size={18} />
              {t('newProduction')}
            </Button>
          )
        }
      />

      {/* Production KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile index={0} icon={<Package size={18} />} label={t('producedUnits')} value={`${stats.producedUnits}`} accent="from-violet-500 to-purple-600" />
        <StatTile index={1} icon={<Coins size={18} />} label={t('productionCost')} value={formatMoney(stats.totalCost)} accent="from-wood-warm to-gold" />
        <StatTile index={2} icon={<TrendingUp size={18} />} label={t('expectedGain')} value={formatMoney(stats.expectedGain)} accent="from-sage to-green-600" />
        <StatTile index={3} icon={<Coins size={18} />} label={t('realisedGain')} value={formatMoney(stats.realisedGain)} accent="from-fuchsia-500 to-pink-600" />
        <StatTile index={4} icon={<Boxes size={18} />} label={t('remainingUnits')} value={`${stats.remainingUnits}`} accent="from-wood-medium to-wood-light" />
      </div>

      {/* Tabs + search */}
      <div className="card-wood mb-5 flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <div className="inline-flex rounded-xl border border-wood-light/40 bg-white/70 p-1">
          {([
            { k: 'sheets', l: t('techSheets'), icon: <ClipboardList size={15} /> },
            { k: 'productions', l: t('productions'), icon: <FlaskConical size={15} /> },
          ] as const).map((o) => (
            <button
              key={o.k}
              onClick={() => setTab(o.k)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                tab === o.k ? 'bg-wood-btn text-white shadow-wood' : 'text-wood-medium hover:bg-wood-cream'
              }`}
            >
              {o.icon}
              {o.l}
            </button>
          ))}
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={tab === 'sheets' ? t('searchTechSheet') : `${t('search')}…`}
          className="min-w-[220px] flex-1"
        />
      </div>

      <AnimatePresence mode="wait">
        {tab === 'sheets' ? (
          <motion.div key="sheets" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {filteredSheets.length === 0 ? (
              <EmptyState
                title={t('noTechSheet')}
                hint={t('noTechSheetHint')}
                icon={<ClipboardList size={40} />}
                action={<Button onClick={openNewSheet}><Plus size={18} />{t('newTechSheet')}</Button>}
              />
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {filteredSheets.map((s, i) => {
                  const cost = round2(s.lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0))
                  const revenue = round2(s.outputQuantity * s.outputUnitPrice)
                  const gain = round2(revenue - cost)
                  return (
                    <motion.div
                      key={s.id}
                      variants={cardVariants}
                      custom={i}
                      layout
                      whileHover={{ y: -4 }}
                      className="card-wood flex flex-col rounded-2xl p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate font-bold text-wood-dark">{s.name}</h3>
                          <p className="truncate text-xs text-wood-medium">
                            {s.outputQuantity} × {s.outputName || s.name}
                          </p>
                        </div>
                        <Badge tone={gain >= 0 ? 'sage' : 'unpaid'}>
                          {gain >= 0 ? '+' : ''}
                          {formatMoney(gain)}
                        </Badge>
                      </div>

                      {s.description && (
                        <p className="mt-2 line-clamp-2 text-xs text-wood-medium/80">{s.description}</p>
                      )}

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                        <div className="rounded-lg bg-wood-cream/40 py-1.5">
                          <p className="text-[10px] text-wood-medium">{t('usedProducts')}</p>
                          <p className="text-mono font-bold">{s.lines.length}</p>
                        </div>
                        <div className="rounded-lg bg-wood-cream/40 py-1.5">
                          <p className="text-[10px] text-wood-medium">{t('productionCost')}</p>
                          <p className="text-mono font-bold">{formatMoney(cost)}</p>
                        </div>
                        <div className="rounded-lg bg-sage/10 py-1.5">
                          <p className="text-[10px] text-wood-medium">{t('expectedRevenue')}</p>
                          <p className="text-mono font-bold text-sage">{formatMoney(revenue)}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-wood-light/20 pt-3">
                        <Button size="sm" variant="sage" className="flex-1" onClick={() => produceFrom(s)}>
                          <PlayCircle size={15} />
                          {t('launchProduction')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setViewingSheet(s)}><Eye size={15} /></Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditingSheet(s); setSheetModal(true) }}><Pencil size={15} /></Button>
                        <Button size="sm" variant="danger" onClick={() => setDeletingSheet(s)}><Trash2 size={15} /></Button>
                      </div>
                    </motion.div>
                  )
                })}
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div key="productions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {filteredProductions.length === 0 ? (
              <EmptyState
                title={t('noProduction')}
                hint={t('noProductionHint')}
                icon={<FlaskConical size={40} />}
                action={<Button onClick={openNewProduction}><Plus size={18} />{t('newProduction')}</Button>}
              />
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {filteredProductions.map((p, i) => {
                  const left = productionRemaining(p)
                  const recovered = p.status === 'recovered'
                  return (
                    <motion.div
                      key={p.id}
                      variants={cardVariants}
                      custom={i}
                      layout
                      whileHover={{ y: -4 }}
                      className={`card-wood flex flex-col rounded-2xl p-4 ${recovered ? 'opacity-70' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-mono font-bold text-wood-dark">{p.reference}</p>
                          <p className="truncate text-sm text-wood-medium">{p.outputName}</p>
                        </div>
                        <Badge tone={recovered ? 'partial' : p.gain >= 0 ? 'sage' : 'unpaid'}>
                          {recovered ? t('recovered') : `${p.gain >= 0 ? '+' : ''}${formatMoney(p.gain)}`}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-wood-medium">
                        {format(new Date(p.date), 'dd/MM/yyyy')} · {p.sheetName}
                      </p>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                        <div className="rounded-lg bg-wood-cream/40 py-1.5">
                          <p className="text-[10px] text-wood-medium">{t('producedUnits')}</p>
                          <p className="text-mono font-bold">{p.outputQuantity}</p>
                        </div>
                        <div className="rounded-lg bg-sage/10 py-1.5">
                          <p className="text-[10px] text-wood-medium">{t('soldUnits')}</p>
                          <p className="text-mono font-bold text-sage">{p.soldQuantity}</p>
                        </div>
                        <div className="rounded-lg bg-wood-cream/40 py-1.5">
                          <p className="text-[10px] text-wood-medium">{t('remainingUnits')}</p>
                          <p className="text-mono font-bold">{left}</p>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-wood-cream/40 py-1.5">
                          <p className="text-[10px] text-wood-medium">{t('productionCost')}</p>
                          <p className="text-mono font-bold">{formatMoney(p.totalCost)}</p>
                        </div>
                        <div className="rounded-lg bg-sage/10 py-1.5">
                          <p className="text-[10px] text-wood-medium">{t('expectedRevenue')}</p>
                          <p className="text-mono font-bold text-sage">{formatMoney(p.totalRevenue)}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-wood-light/20 pt-3">
                        <Button size="sm" variant="outline" onClick={() => setViewingProd(p)}><Eye size={15} /></Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditingProd(p); setPresetSheet(null); setProdModal(true) }}><Pencil size={15} /></Button>
                        {!recovered && (
                          <Button size="sm" variant="gold" onClick={() => setRecovering(p)} title={t('recoverProduction')}>
                            <Undo2 size={15} />
                            {t('recover')}
                          </Button>
                        )}
                        <Button size="sm" variant="danger" onClick={() => setDeletingProd(p)}><Trash2 size={15} /></Button>
                      </div>
                    </motion.div>
                  )
                })}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Modals ---------------------------------------------------- */}
      <TechSheetModal open={sheetModal} onClose={() => setSheetModal(false)} editing={editingSheet} />
      <ProductionModal
        open={prodModal}
        onClose={() => {
          setProdModal(false)
          setPresetSheet(null)
        }}
        editing={editingProd}
        presetSheet={presetSheet}
      />

      {/* Fiche technique details */}
      <Modal
        open={!!viewingSheet}
        onClose={() => setViewingSheet(null)}
        title={viewingSheet?.name}
        subtitle={viewingSheet ? `${viewingSheet.outputQuantity} × ${viewingSheet.outputName}` : undefined}
        size="lg"
      >
        {viewingSheet && (
          <div className="space-y-4">
            {viewingSheet.description && (
              <p className="text-sm text-wood-medium">{viewingSheet.description}</p>
            )}
            <RecipeTable lines={viewingSheet.lines} />
            {(() => {
              const cost = round2(viewingSheet.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0))
              const revenue = round2(viewingSheet.outputQuantity * viewingSheet.outputUnitPrice)
              const gain = round2(revenue - cost)
              const unit = viewingSheet.outputQuantity > 0 ? round2(cost / viewingSheet.outputQuantity) : 0
              return (
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div className="rounded-xl bg-wood-cream/40 p-3"><p className="text-xs text-wood-medium">{t('productionCost')}</p><p className="text-mono font-bold">{formatMoney(cost)}</p></div>
                  <div className="rounded-xl bg-wood-cream/40 p-3"><p className="text-xs text-wood-medium">{t('unitCost')}</p><p className="text-mono font-bold">{formatMoney(unit)}</p></div>
                  <div className="rounded-xl bg-sage/10 p-3"><p className="text-xs text-wood-medium">{t('expectedRevenue')}</p><p className="text-mono font-bold text-sage">{formatMoney(revenue)}</p></div>
                  <div className="rounded-xl bg-wood-btn p-3 text-white"><p className="text-xs opacity-90">{t('expectedGain')}</p><p className="text-mono font-bold">{formatMoney(gain)}</p></div>
                </div>
              )
            })()}
            <div className="flex justify-end">
              <Button variant="sage" onClick={() => { const s = viewingSheet; setViewingSheet(null); produceFrom(s) }}>
                <PlayCircle size={15} />
                {t('launchProduction')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Production details */}
      <Modal
        open={!!viewingProd}
        onClose={() => setViewingProd(null)}
        title={viewingProd?.reference}
        subtitle={viewingProd ? `${viewingProd.outputQuantity} × ${viewingProd.outputName}` : undefined}
        size="lg"
      >
        {viewingProd && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-wood-medium">
              <Badge tone={viewingProd.status === 'recovered' ? 'partial' : 'sage'}>
                {viewingProd.status === 'recovered' ? t('recovered') : t('production')}
              </Badge>
              <span>{format(new Date(viewingProd.date), 'dd/MM/yyyy')}</span>
              <span>· {viewingProd.sheetName}</span>
            </div>
            <RecipeTable lines={viewingProd.lines} />
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-xl bg-wood-cream/40 p-3"><p className="text-xs text-wood-medium">{t('productionCost')}</p><p className="text-mono font-bold">{formatMoney(viewingProd.totalCost)}</p></div>
              <div className="rounded-xl bg-wood-cream/40 p-3"><p className="text-xs text-wood-medium">{t('unitCost')}</p><p className="text-mono font-bold">{formatMoney(productionUnitCost(viewingProd))}</p></div>
              <div className="rounded-xl bg-sage/10 p-3"><p className="text-xs text-wood-medium">{t('expectedRevenue')}</p><p className="text-mono font-bold text-sage">{formatMoney(viewingProd.totalRevenue)}</p></div>
              <div className="rounded-xl bg-wood-btn p-3 text-white"><p className="text-xs opacity-90">{t('expectedGain')}</p><p className="text-mono font-bold">{formatMoney(viewingProd.gain)}</p></div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl bg-wood-cream/40 p-3"><p className="text-xs text-wood-medium">{t('producedUnits')}</p><p className="text-mono font-bold">{viewingProd.outputQuantity}</p></div>
              <div className="rounded-xl bg-sage/10 p-3"><p className="text-xs text-wood-medium">{t('soldUnits')}</p><p className="text-mono font-bold text-sage">{viewingProd.soldQuantity}</p></div>
              <div className="rounded-xl bg-wood-cream/40 p-3"><p className="text-xs text-wood-medium">{t('remainingUnits')}</p><p className="text-mono font-bold">{productionRemaining(viewingProd)}</p></div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deletingSheet}
        onClose={() => setDeletingSheet(null)}
        onConfirm={() => {
          if (deletingSheet) {
            deleteSheet(deletingSheet.id)
            toast.success(t('deleted'))
          }
        }}
      />
      <ConfirmDialog
        open={!!deletingProd}
        onClose={() => setDeletingProd(null)}
        onConfirm={() => {
          if (deletingProd) {
            deleteProduction(deletingProd.id)
            toast.success(t('deleted'))
          }
        }}
      />
      <ConfirmDialog
        open={!!recovering}
        onClose={() => setRecovering(null)}
        title={t('recoverProduction')}
        message={t('recoverHint')}
        confirmLabel={t('recover')}
        tone="gold"
        icon={Undo2}
        onConfirm={() => {
          if (recovering) {
            recoverProduction(recovering.id)
            toast.success(t('productionRecovered'))
          }
        }}
      />
    </div>
  )
}
