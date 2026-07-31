import { supabase } from './supabase'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ScanSession {
  id: string
  expiresAt: string
}

export interface ScanSessionInfo {
  valid: boolean
  label?: string
  shop?: string
  expiresAt?: string
}

export interface PushScanResult {
  ok: boolean
  found: boolean
  reason?: string
  product?: { id: string; name: string; salePrice: number; quantity: number } | null
}

const SCAN_BASE_KEY = 'cosmetics-scan-base'

/**
 * Address the phone must open. Defaults to the address the cash register is
 * itself served from; when the app runs on `localhost` the phone cannot reach
 * it, so the cashier can store the PC's LAN address (or a deployed URL) once.
 */
export const getScanBaseUrl = (): string => {
  const override = localStorage.getItem(SCAN_BASE_KEY)
  if (override) return override.replace(/\/+$/, '')
  const env = import.meta.env.VITE_SCAN_BASE_URL as string | undefined
  if (env) return env.replace(/\/+$/, '')
  return window.location.origin
}

export const setScanBaseUrl = (url: string): void => {
  const clean = url.trim().replace(/\/+$/, '')
  if (clean) localStorage.setItem(SCAN_BASE_KEY, clean)
  else localStorage.removeItem(SCAN_BASE_KEY)
}

export const isLocalOnlyOrigin = (): boolean =>
  /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(new URL(getScanBaseUrl()).hostname)

export const scanUrlFor = (sessionId: string): string => `${getScanBaseUrl()}/scan/${sessionId}`

// ----------------------------------------------------------------------------
// Cash register side
// ----------------------------------------------------------------------------

/** POS → "Scanner avec mon téléphone": opens the pairing session. */
export const openScanSession = async (label = 'POS'): Promise<ScanSession> => {
  const { data, error } = await supabase.rpc('open_scan_session', { p_label: label })
  if (error) throw error
  return { id: (data as any).id, expiresAt: (data as any).expires_at }
}

export const closeScanSession = async (sessionId: string): Promise<void> => {
  await supabase.rpc('close_scan_session', { p_session_id: sessionId })
}

/**
 * Streams every barcode filmed by the paired phone.
 *
 * Uses Supabase Realtime and *also* polls every 1.5 s, so the register keeps
 * receiving scans on shop networks where websockets are blocked. Each event id
 * is delivered once.
 */
export const subscribeScans = (
  sessionId: string,
  onBarcode: (barcode: string, eventId: number) => void,
): (() => void) => {
  const seen = new Set<number>()
  let lastId = 0
  let stopped = false

  const deliver = (id: number, barcode: string) => {
    if (stopped || seen.has(id)) return
    seen.add(id)
    if (id > lastId) lastId = id
    onBarcode(barcode, id)
  }

  const channel = supabase
    .channel(`scan-${sessionId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'scan_events', filter: `session_id=eq.${sessionId}` },
      (payload) => {
        const row = payload.new as { id: number; barcode: string }
        deliver(Number(row.id), row.barcode)
      },
    )
    .subscribe()

  const poll = async () => {
    if (stopped) return
    try {
      const { data, error } = await supabase.rpc('pull_scans', {
        p_session_id: sessionId,
        p_after: lastId,
      })
      if (!error && Array.isArray(data)) {
        data.forEach((row: any) => deliver(Number(row.id), row.barcode))
      }
    } catch {
      /* offline tick — retry on the next interval */
    }
  }

  poll()
  const timer = window.setInterval(poll, 1500)

  return () => {
    stopped = true
    window.clearInterval(timer)
    supabase.removeChannel(channel)
  }
}

// ----------------------------------------------------------------------------
// Phone side (anonymous)
// ----------------------------------------------------------------------------

export const fetchScanSessionInfo = async (sessionId: string): Promise<ScanSessionInfo> => {
  const { data, error } = await supabase.rpc('scan_session_info', { p_session_id: sessionId })
  if (error) throw error
  const d = data as any
  return { valid: !!d?.valid, label: d?.label, shop: d?.shop, expiresAt: d?.expires_at }
}

export const pushScan = async (sessionId: string, barcode: string): Promise<PushScanResult> => {
  const { data, error } = await supabase.rpc('push_scan', {
    p_session_id: sessionId,
    p_barcode: barcode,
  })
  if (error) throw error
  const d = data as any
  return { ok: !!d?.ok, found: !!d?.found, reason: d?.reason, product: d?.product ?? null }
}
