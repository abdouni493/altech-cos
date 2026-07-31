import toast from 'react-hot-toast'
import { supabase, cloudErrorMessage } from './supabase'
import { setCloudErrorHandler, msSinceLastWrite } from './cloud'
import { useAuthStore } from '@/store/useAuthStore'

/* eslint-disable @typescript-eslint/no-explicit-any */

let resyncTimer: number | undefined
let lastToastAt = 0

/** Re-downloads the shop, coalescing bursts of triggers. */
const scheduleResync = (delay = 700) => {
  window.clearTimeout(resyncTimer)
  resyncTimer = window.setTimeout(async () => {
    try {
      const { syncFromCloud } = await import('./sync')
      await syncFromCloud()
      useAuthStore.setState({ online: true })
    } catch (e) {
      console.warn('[cloud] resync failed', e)
    }
  }, delay)
}

const toastThrottled = (message: string) => {
  const now = Date.now()
  if (now - lastToastAt < 4000) return
  lastToastAt = now
  toast.error(message)
}

/**
 * Installs the guard that keeps the screens honest: if Supabase rejects a
 * write, the cashier is warned and the shop is re-downloaded, so what is
 * displayed always matches what the database actually stored.
 */
export const installCloudGuards = () => {
  setCloudErrorHandler((_context, message, offline) => {
    useAuthStore.setState({ online: !offline })
    toastThrottled(cloudErrorMessage(offline ? new Error('Failed to fetch') : new Error(message)))
    // A refused write must not stay on screen — realign with the database.
    if (!offline && useAuthStore.getState().currentUser) scheduleResync()
  })
}

/**
 * Live updates: any change made on another device (or by the phone scanner)
 * is picked up and the shop is refreshed. Self-inflicted echoes are ignored.
 */
export const subscribeShopRealtime = (): (() => void) => {
  const channel = supabase
    .channel('shop-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, (payload: any) => {
      // handled by their own channels / not displayed
      if (payload?.table === 'scan_events' || payload?.table === 'activity_log') return
      // Right after our own write the echo is most likely ours and the screen is
      // already up to date — still refresh, just later, in case it came from
      // another till working at the same moment.
      scheduleResync(msSinceLastWrite() < 2500 ? 4000 : 1200)
    })
    .subscribe()

  // Coming back to the tab is the cheapest moment to make sure nothing is stale.
  const onFocus = () => {
    if (document.visibilityState === 'visible' && useAuthStore.getState().currentUser) {
      scheduleResync(200)
    }
  }
  document.addEventListener('visibilitychange', onFocus)

  return () => {
    document.removeEventListener('visibilitychange', onFocus)
    window.clearTimeout(resyncTimer)
    supabase.removeChannel(channel)
  }
}
