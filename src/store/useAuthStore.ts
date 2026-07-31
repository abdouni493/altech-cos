import { create } from 'zustand'
import type { AppUser, Permissions } from '@/types'
import { supabase, isNetworkError } from '@/lib/supabase'
import { setCloudSignedIn } from '@/lib/cloud'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

const profileToUser = (p: Row): AppUser => ({
  id: p.id,
  fullName: p.full_name ?? '',
  username: p.username ?? '',
  email: p.email ?? '',
  password: '',
  role: p.role === 'admin' ? 'Administrateur' : p.job_title || 'Employé',
  permissions: p.permissions === 'ALL' ? 'ALL' : ((p.permissions ?? {}) as Permissions),
})

const loadProfile = async (userId: string, fallbackEmail: string): Promise<AppUser> => {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  if (!data) {
    // signed in but no profile row yet (project half-initialised)
    return {
      id: userId,
      fullName: fallbackEmail,
      username: '',
      email: fallbackEmail,
      password: '',
      role: 'Employé',
      permissions: {},
    }
  }
  return profileToUser(data)
}

interface AuthState {
  /** The signed-in member, read from Supabase — never from localStorage. */
  currentUser: AppUser | null
  /** false while the Supabase session is being restored on boot. */
  ready: boolean
  /** true when the last cloud call succeeded. */
  online: boolean
  /** true while the shop is being downloaded from Supabase. */
  syncing: boolean

  init: () => Promise<void>
  /** Downloads the whole shop again. */
  refresh: () => Promise<void>
  login: (identifier: string, password: string) => Promise<AppUser | null>
  createAdmin: (data: {
    fullName: string
    username: string
    email: string
    password: string
  }) => Promise<AppUser>
  adminExists: () => Promise<boolean>
  logout: () => Promise<void>
  updateAccount: (
    data: Partial<Pick<AppUser, 'fullName' | 'username' | 'email' | 'password'>>,
  ) => Promise<void>
}

/** Pulls the shop from Supabase into the stores, flagging the sync state. */
const downloadShop = async (set: (partial: Partial<AuthState>) => void) => {
  set({ syncing: true })
  try {
    const { syncFromCloud } = await import('@/lib/sync')
    await syncFromCloud()
    set({ online: true })
  } catch (e) {
    set({ online: !isNetworkError(e) })
    console.warn('[auth] download', e)
    throw e
  } finally {
    set({ syncing: false })
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  currentUser: null,
  ready: false,
  online: true,
  syncing: false,

  // -------------------------------------------------------------------------
  // Boot: restore the Supabase session, then download the shop
  // -------------------------------------------------------------------------
  init: async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (session?.user) {
        setCloudSignedIn(true)
        const user = await loadProfile(session.user.id, session.user.email ?? '')
        set({ currentUser: user, online: true })
        await downloadShop(set).catch(() => undefined)
      } else {
        setCloudSignedIn(false)
        set({ currentUser: null, online: true })
      }
    } catch (e) {
      set({ online: !isNetworkError(e), currentUser: null })
      console.warn('[auth] init', e)
    } finally {
      set({ ready: true })
    }
  },

  refresh: async () => {
    if (!get().currentUser) return
    await downloadShop(set)
  },

  // -------------------------------------------------------------------------
  // Login — accepts an email OR a username, both resolved server-side
  // -------------------------------------------------------------------------
  login: async (identifier, password) => {
    const id = identifier.trim()
    let email = id
    if (!id.includes('@')) {
      const { data } = await supabase.rpc('resolve_login_email', { p_identifier: id })
      if (data) email = data as string
    }

    const { data: auth, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    })
    if (error) {
      // wrong email/password → null (the screen shows "identifiants incorrects");
      // anything else (offline, project down) bubbles up with its real message
      if (/invalid login credentials|email not confirmed/i.test(error.message)) return null
      set({ online: !isNetworkError(error) })
      throw error
    }
    if (!auth.user) return null

    setCloudSignedIn(true)
    const user = await loadProfile(auth.user.id, auth.user.email ?? '')
    set({ currentUser: user, online: true })
    await downloadShop(set)
    return user
  },

  // -------------------------------------------------------------------------
  // Login page → "Créer mon compte Admin" (real row in auth.users)
  // -------------------------------------------------------------------------
  createAdmin: async ({ fullName, username, email, password }) => {
    const { error } = await supabase.rpc('create_admin_account', {
      p_full_name: fullName,
      p_username: username,
      p_email: email,
      p_password: password,
    })
    if (error) throw error

    const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (signInError) throw signInError
    if (!auth.user) throw new Error('SIGNIN_FAILED')

    setCloudSignedIn(true)
    const user = await loadProfile(auth.user.id, auth.user.email ?? email)
    set({ currentUser: user, online: true })
    await downloadShop(set)
    return user
  },

  // -------------------------------------------------------------------------
  // Drives the visibility of the "Créer un compte Admin" button
  // -------------------------------------------------------------------------
  adminExists: async () => {
    const { data, error } = await supabase.rpc('admin_exists')
    if (error) {
      set({ online: !isNetworkError(error) })
      throw error
    }
    set({ online: true })
    return !!data
  },

  logout: async () => {
    try {
      await supabase.auth.signOut()
    } catch (e) {
      console.warn('[auth] signOut', e)
    }
    setCloudSignedIn(false)
    set({ currentUser: null })
    const { clearShopState } = await import('@/lib/sync')
    clearShopState()
  },

  updateAccount: async (data) => {
    const current = get().currentUser
    if (!current) return

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: data.fullName ?? current.fullName,
        username: (data.username ?? current.username) || null,
        email: data.email ?? current.email,
      })
      .eq('id', current.id)
    if (error) throw error

    if (data.password) {
      const { error: pwError } = await supabase.rpc('change_my_password', {
        p_password: data.password,
      })
      if (pwError) throw pwError
    }
    if (data.email && data.email !== current.email) {
      await supabase.auth.updateUser({ email: data.email })
    }

    // re-read the row so the screen shows exactly what the server stored
    set({ currentUser: await loadProfile(current.id, current.email), online: true })
  },
}))

// Keep the cloud writer in sync with the Supabase session lifecycle.
supabase.auth.onAuthStateChange((event, session) => {
  setCloudSignedIn(!!session)
  if (event === 'SIGNED_OUT') useAuthStore.setState({ currentUser: null })
})
