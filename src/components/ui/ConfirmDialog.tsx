import { AlertTriangle, type LucideIcon } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { useTranslation } from '@/i18n/useTranslation'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message?: string
  /** Wording of the confirm button — defaults to "Supprimer". */
  confirmLabel?: string
  /** `danger` (delete) or `gold` for a reversible action such as a recovery. */
  tone?: 'danger' | 'gold'
  icon?: LucideIcon
}

export const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  tone = 'danger',
  icon: Icon = AlertTriangle,
}: ConfirmDialogProps) => {
  const { t } = useTranslation()
  const danger = tone === 'danger'
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ring-8 ${danger ? 'bg-terracotta/10 ring-terracotta/5' : 'bg-gold/15 ring-gold/5'}`}>
          <Icon className={danger ? 'text-terracotta' : 'text-[#B45309]'} size={28} />
        </div>
        <h3 className="text-display text-xl font-bold text-wood-dark">{title ?? t('confirmDelete')}</h3>
        <p className="text-sm text-wood-medium">{message ?? t('confirmDeleteMsg')}</p>
        <div className="mt-2 flex w-full gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant={tone}
            className="flex-1"
            autoFocus
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel ?? t('delete')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
