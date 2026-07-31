import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { CameraOff, Loader2, SwitchCamera, Zap, ZapOff } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */

// The native Barcode Detection API is not in TypeScript's DOM lib yet.
interface NativeDetector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}
interface NativeDetectorCtor {
  new (options?: { formats?: string[] }): NativeDetector
  getSupportedFormats?: () => Promise<string[]>
}

const NATIVE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'itf',
  'codabar',
  'qr_code',
]

/** Short confirmation beep — no asset needed. */
export const beep = (ok = true) => {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = ok ? 880 : 220
    gain.gain.value = 0.14
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + (ok ? 0.09 : 0.22))
    osc.onended = () => ctx.close()
  } catch {
    /* audio not available — ignore */
  }
}

export const vibrate = (pattern: number | number[] = 45) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not supported */
  }
}

interface Props {
  active: boolean
  onDetect: (barcode: string) => void
  /** Minimum delay before the same code can be read again (ms). */
  cooldown?: number
  className?: string
  hint?: string
}

/**
 * Live camera barcode reader.
 *
 * Uses the native BarcodeDetector API when the browser exposes it (Chrome /
 * Edge / Android), and falls back to the ZXing WASM-free decoder everywhere
 * else (iOS Safari, Firefox).
 */
export const CameraScanner = ({ active, onDetect, cooldown = 1400, className, hint }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const stopFnRef = useRef<(() => void) | null>(null)
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  const onDetectRef = useRef(onDetect)
  onDetectRef.current = onDetect

  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle')
  const [error, setError] = useState('')
  const [engine, setEngine] = useState<'native' | 'zxing' | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)

  const emit = useCallback(
    (code: string) => {
      const value = code.trim()
      if (!value) return
      const now = Date.now()
      if (lastRef.current.code === value && now - lastRef.current.at < cooldown) return
      lastRef.current = { code: value, at: now }
      onDetectRef.current(value)
    },
    [cooldown],
  )

  useEffect(() => {
    let cancelled = false

    const stopAll = () => {
      stopFnRef.current?.()
      stopFnRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setTorchOn(false)
      setTorchAvailable(false)
    }

    const start = async () => {
      setStatus('starting')
      setError('')
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('CAMERA_UNSUPPORTED')
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.setAttribute('playsinline', 'true')
          await video.play().catch(() => undefined)
        }

        const track = stream.getVideoTracks()[0]
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean }
        setTorchAvailable(!!caps.torch)

        const Detector = (window as any).BarcodeDetector as NativeDetectorCtor | undefined

        if (Detector) {
          // ---- native engine -------------------------------------------------
          setEngine('native')
          let formats = NATIVE_FORMATS
          try {
            const supported = (await Detector.getSupportedFormats?.()) ?? []
            if (supported.length) formats = NATIVE_FORMATS.filter((f) => supported.includes(f))
          } catch {
            /* keep the default list */
          }
          const detector = new Detector({ formats })
          let raf = 0
          let busy = false
          const tick = async () => {
            if (cancelled) return
            const el = videoRef.current
            if (el && el.readyState >= 2 && !busy) {
              busy = true
              try {
                const found = await detector.detect(el)
                if (found.length) emit(found[0].rawValue)
              } catch {
                /* transient decode failure */
              }
              busy = false
            }
            raf = requestAnimationFrame(tick)
          }
          raf = requestAnimationFrame(tick)
          stopFnRef.current = () => cancelAnimationFrame(raf)
        } else {
          // ---- ZXing fallback -------------------------------------------------
          setEngine('zxing')
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          if (cancelled) return
          const reader = new BrowserMultiFormatReader()
          const controls = await reader.decodeFromStream(
            stream,
            videoRef.current ?? undefined,
            (result) => {
              if (result) emit(result.getText())
            },
          )
          stopFnRef.current = () => controls.stop()
        }

        if (!cancelled) setStatus('running')
      } catch (e: any) {
        if (cancelled) return
        stopAll()
        setStatus('error')
        const name = e?.name ?? ''
        if (name === 'NotAllowedError')
          setError("Accès à la caméra refusé. Autorisez la caméra dans votre navigateur.")
        else if (name === 'NotFoundError') setError('Aucune caméra détectée sur cet appareil.')
        else if (e?.message === 'CAMERA_UNSUPPORTED')
          setError('La caméra nécessite une connexion sécurisée (HTTPS) ou localhost.')
        else setError(e?.message ?? 'Impossible de démarrer la caméra')
      }
    }

    if (active) start()
    else {
      stopAll()
      setStatus('idle')
    }

    return () => {
      cancelled = true
      stopAll()
    }
  }, [active, facing, emit])

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] })
      setTorchOn((v) => !v)
    } catch {
      setTorchAvailable(false)
    }
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-charcoal ${className ?? ''}`}>
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />

      {/* Aiming frame */}
      {status === 'running' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-28 w-4/5 max-w-xs rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(42,17,64,0.35)]">
            <motion.div
              initial={{ top: '0%' }}
              animate={{ top: ['0%', '100%', '0%'] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute left-0 h-0.5 w-full bg-gradient-to-r from-transparent via-wood-light to-transparent"
            />
          </div>
        </div>
      )}

      {/* Controls */}
      {status === 'running' && (
        <div className="absolute bottom-3 end-3 flex gap-2">
          {torchAvailable && (
            <button
              type="button"
              onClick={toggleTorch}
              className="rounded-xl bg-white/20 p-2 text-white backdrop-blur transition hover:bg-white/30"
              aria-label="Torche"
            >
              {torchOn ? <ZapOff size={18} /> : <Zap size={18} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            className="rounded-xl bg-white/20 p-2 text-white backdrop-blur transition hover:bg-white/30"
            aria-label="Changer de caméra"
          >
            <SwitchCamera size={18} />
          </button>
        </div>
      )}

      {status === 'starting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/90">
          <Loader2 className="animate-spin" size={26} />
          <p className="text-sm">Démarrage de la caméra…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white/90">
          <CameraOff size={26} />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {status === 'running' && hint && (
        <p className="absolute inset-x-0 top-3 text-center text-xs font-medium text-white/90 drop-shadow">
          {hint}
          {engine === 'zxing' && <span className="ms-1 opacity-60">·</span>}
        </p>
      )}
    </div>
  )
}
