import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { Plus, Check, Loader2, KeyRound } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { useWorkerStore } from '@/store/useWorkerStore'
import { useTranslation } from '@/i18n/useTranslation'
import { authErrorMessage } from '@/store/useAuthStore'
import type { Worker, SalaryType } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  worker?: Worker | null
}

const emptyForm = () => ({
  fullName: '',
  birthDate: '',
  idCard: '',
  phone: '',
  role: '',
  hasSalary: true,
  salaryType: 'monthly' as SalaryType,
  salaryAmount: 0,
  hasAccount: false,
  email: '',
  username: '',
  password: '',
  startDate: format(new Date(), 'yyyy-MM-dd'),
  active: true,
})

export const WorkerFormModal = ({ open, onClose, worker }: Props) => {
  const { t } = useTranslation()
  const { roles, addRole, addWorker, updateWorker, provisionAccount, revokeAccount } = useWorkerStore()
  const [form, setForm] = useState(emptyForm())
  const [showAddRole, setShowAddRole] = useState(false)
  const [newRole, setNewRole] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (worker) {
      setForm({
        fullName: worker.fullName,
        birthDate: worker.birthDate,
        idCard: worker.idCard,
        phone: worker.phone,
        role: worker.role,
        hasSalary: worker.hasSalary,
        salaryType: worker.salaryType,
        salaryAmount: worker.salaryAmount,
        hasAccount: worker.hasAccount,
        email: worker.email,
        username: worker.username,
        password: worker.password,
        startDate: format(new Date(worker.startDate), 'yyyy-MM-dd'),
        active: worker.active,
      })
    } else {
      setForm({ ...emptyForm(), role: roles[0] ?? '' })
    }
  }, [open, worker]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    if (!form.fullName.trim()) {
      toast.error(t('required'))
      return
    }
    if (form.hasAccount && !form.email.trim()) {
      toast.error(t('accountEmailRequired'))
      return
    }
    if (form.hasAccount && !worker?.hasAccount && form.password.trim().length < 4) {
      toast.error(t('accountPasswordRequired'))
      return
    }

    setSaving(true)
    try {
      const payload = { ...form, startDate: new Date(form.startDate).toISOString() }
      const workerId = worker
        ? (updateWorker(worker.id, payload), worker.id)
        : addWorker({ ...payload, permissions: {} }).id

      // The login account is stored in the local database — the employee
      // signs in with this email/password and gets their own permissions.
      if (form.hasAccount && form.password.trim()) {
        try {
          await provisionAccount(workerId, form.password.trim())
          toast.success(t('workerAccountReady'))
        } catch (e) {
          toast.error(authErrorMessage(e))
        }
      } else if (!form.hasAccount && worker?.hasAccount) {
        try {
          await revokeAccount(worker.id)
        } catch (e) {
          toast.error(authErrorMessage(e))
        }
      }

      toast.success(t('saved'))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={worker ? t('editWorker') : t('newWorker')}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label={t('fullName')} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
          <Input label={t('phone')} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input label={t('birthDate')} type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
          <Input label={t('idCard')} value={form.idCard} onChange={(e) => set('idCard', e.target.value)} />
        </div>

        {/* Role */}
        <div>
          <div className="flex items-end gap-2">
            <Select label={t('role')} value={form.role} onChange={(e) => set('role', e.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
            <Button type="button" variant="outline" size="icon" onClick={() => setShowAddRole((v) => !v)}><Plus size={18} /></Button>
          </div>
          {showAddRole && (
            <div className="mt-2 flex gap-2">
              <input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder={t('createRole')} className="input-wood" />
              <Button type="button" size="sm" onClick={() => { if (newRole.trim()) { addRole(newRole.trim()); set('role', newRole.trim()); setNewRole(''); setShowAddRole(false) } }}><Check size={15} /></Button>
            </div>
          )}
        </div>

        {/* Salary */}
        <div className="rounded-xl border border-wood-light/25 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-wood-dark">
            <input type="checkbox" checked={form.hasSalary} onChange={(e) => set('hasSalary', e.target.checked)} className="accent-wood-warm" />
            {t('hasSalary')}
          </label>
          {form.hasSalary && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Select label={t('salaryType')} value={form.salaryType} onChange={(e) => set('salaryType', e.target.value as SalaryType)}>
                <option value="monthly">{t('monthly')}</option>
                <option value="daily">{t('daily')}</option>
              </Select>
              <Input label={`${t('amount')} (DA)`} type="number" value={form.salaryAmount} onChange={(e) => set('salaryAmount', Number(e.target.value))} />
            </div>
          )}
        </div>

        {/* Account */}
        <div className="rounded-xl border border-wood-light/25 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-wood-dark">
            <input type="checkbox" checked={form.hasAccount} onChange={(e) => set('hasAccount', e.target.checked)} className="accent-wood-warm" />
            {t('hasAccount')}
          </label>
          {form.hasAccount && (
            <>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input label={t('email')} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
                <Input label={t('username')} value={form.username} onChange={(e) => set('username', e.target.value)} />
                <Input
                  label={worker?.hasAccount ? t('newPassword') : t('password')}
                  type="text"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  hint={worker?.hasAccount ? t('leaveEmptyToKeep') : undefined}
                />
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-wood-medium">
                <KeyRound size={13} className="mt-0.5 shrink-0 text-wood-warm" />
                {t('workerAccountHint')}
              </p>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label={t('startDate')} type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          <Select label={t('status')} value={form.active ? '1' : '0'} onChange={(e) => set('active', e.target.value === '1')}>
            <option value="1">{t('active')}</option>
            <option value="0">{t('inactive')}</option>
          </Select>
        </div>
      </div>
    </Modal>
  )
}
