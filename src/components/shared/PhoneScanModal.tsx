import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import {
  Camera,
  Check,
  Copy,
  Link2,
  Loader2,
  RefreshCw,
  ScanLine,
  Smartphone,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CameraScanner } from './CameraScanner'
import { getScanBaseUrl, isLocalOnlyOrigin, setScanBaseUrl } from '@/lib/scanSession'
import type { PhoneScanState } from '@/lib/usePhoneScan'
import { useTranslation } from '@/i18n/useTranslation'

export interface ScanFeedItem {
  id: string
  barcode: string
  label: string
  found: boolean
  source: 'phone' | 'local'
}

interface Props {
  open: boolean
  onClose: () => void
  phone: PhoneScanState
  /** Called by the built-in camera of this device. */
  onLocalBarcode: (barcode: string) => void
  feed: ScanFeedItem[]
}

type Tab = 'phone' | 'local'

export const PhoneScanModal = ({ open, onClose, phone, onLocalBarcode, feed }: Props) => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('phone')
  const [qr, setQr] = useState('')
  const [baseUrl, setBase] = useState(getScanBaseUrl())
  const [editBase, setEditBase] = useState(false)

  // Open the pairing session as soon as the modal is shown
  useEffect(() => {
    if (open && phone.status === 'off') phone.start()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!phone.url) {
      setQr('')
      return
    }
    QRCode.toDataURL(phone.url, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#3B0764', light: '#FFFFFFFF' },
    })
      .then(setQr)
      .catch(() => setQr(''))
  }, [phone.url])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phone.url)
      toast.success(t('linkCopied'))
    } catch {
      toast.error(phone.url)
    }
  }

  const saveBase = () => {
    setScanBaseUrl(baseUrl)
    setBase(getScanBaseUrl())
    setEditBase(false)
    phone.stop()
    phone.start()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('scanWithPhone')}
      subtitle={t('scanWithPhoneHint')}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => { phone.stop(); onClose() }}>
            <X size={16} />
            {t('close')}
          </Button>
          <Button onClick={onClose}>
            <Check size={16} />
            {t('keepScanning')}
          </Button>
        </>
      }
    >
      {/* Tabs */}
      <div className="mb-4 flex gap-2 rounded-xl bg-wood-cream/50 p-1">
        {(
          [
            { key: 'phone' as Tab, label: t('myPhone'), icon: <Smartphone size={16} /> },
            { key: 'local' as Tab, label: t('thisDeviceCamera'), icon: <Camera size={16} /> },
          ]
        ).map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === item.key ? 'bg-wood-btn text-white shadow-wood' : 'text-wood-medium hover:bg-white/70'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'phone' ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* QR */}
          <div className="flex flex-col items-center">
            <div className="relative flex h-[248px] w-[248px] items-center justify-center rounded-2xl border border-wood-light/30 bg-white p-3 shadow-wood">
              {phone.status === 'starting' && <Loader2 className="animate-spin text-wood-warm" size={28} />}
              {phone.status === 'error' && (
                <div className="px-4 text-center">
                  <TriangleAlert className="mx-auto mb-2 text-terracotta" size={26} />
                  <p className="text-xs text-terracotta">{phone.error}</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => phone.start()}>
                    <RefreshCw size={14} />
                    {t('retry')}
                  </Button>
                </div>
              )}
              {qr && phone.status !== 'error' && (
                <motion.img
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  src={qr}
                  alt="QR"
                  className="h-full w-full"
                />
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  phone.status === 'connected'
                    ? 'bg-sage animate-pulse'
                    : phone.status === 'waiting'
                      ? 'bg-gold animate-pulse'
                      : 'bg-wood-light/60'
                }`}
              />
              <p className="text-sm font-medium text-wood-dark">
                {phone.status === 'connected'
                  ? `${t('phoneConnected')} · ${phone.count}`
                  : phone.status === 'waiting'
                    ? t('waitingPhone')
                    : phone.status === 'starting'
                      ? t('loading')
                      : t('scannerOff')}
              </p>
            </div>

            {phone.url && (
              <div className="mt-3 w-full">
                <div className="flex items-center gap-2 rounded-xl border border-wood-light/30 bg-wood-cream/30 px-3 py-2">
                  <Link2 size={15} className="shrink-0 text-wood-warm" />
                  <span className="truncate text-xs text-wood-medium" title={phone.url}>
                    {phone.url}
                  </span>
                  <button onClick={copy} className="ms-auto shrink-0 text-wood-warm hover:text-wood-dark">
                    <Copy size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="space-y-3">
            <ol className="space-y-2.5 text-sm text-wood-medium">
              {[t('scanStep1'), t('scanStep2'), t('scanStep3')].map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-wood-btn text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>

            {isLocalOnlyOrigin() && (
              <div className="rounded-xl border border-gold/40 bg-gold/10 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-wood-dark">
                  <TriangleAlert size={14} className="text-gold" />
                  {t('localhostWarnTitle')}
                </p>
                <p className="mt-1 text-xs text-wood-medium">{t('localhostWarnHint')}</p>
                {editBase ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={baseUrl}
                      onChange={(e) => setBase(e.target.value)}
                      placeholder="http://192.168.1.10:5175"
                      className="input-wood py-1.5 text-xs"
                    />
                    <Button size="sm" onClick={saveBase}>
                      <Check size={14} />
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => setEditBase(true)}>
                    {t('setPhoneAddress')}
                  </Button>
                )}
              </div>
            )}

            {/* Live feed */}
            <div className="rounded-xl border border-wood-light/25 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-wood-dark">
                <ScanLine size={14} className="text-wood-warm" />
                {t('lastScans')}
              </p>
              {feed.length === 0 ? (
                <p className="py-3 text-center text-xs text-wood-medium/70">{t('noScanYet')}</p>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  <AnimatePresence initial={false}>
                    {feed.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                          item.found ? 'bg-sage/10 text-wood-dark' : 'bg-terracotta/10 text-terracotta'
                        }`}
                      >
                        <span className="truncate font-medium">{item.label}</span>
                        <span className="text-mono shrink-0 opacity-70">{item.barcode}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <CameraScanner
            active={open && tab === 'local'}
            onDetect={onLocalBarcode}
            className="h-64 w-full"
            hint={t('pointAtBarcode')}
          />
          <p className="text-center text-xs text-wood-medium">{t('localCameraHint')}</p>
          {feed.length > 0 && (
            <div className="space-y-1.5">
              {feed.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                    item.found ? 'bg-sage/10 text-wood-dark' : 'bg-terracotta/10 text-terracotta'
                  }`}
                >
                  <span className="truncate font-medium">{item.label}</span>
                  <span className="text-mono opacity-70">{item.barcode}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
