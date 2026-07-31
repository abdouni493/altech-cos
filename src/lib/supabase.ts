import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase connection.
 *
 * The credentials are also hard-coded as a fallback so the production build
 * (`dist/`, opened straight from the desktop shortcut) keeps working even when
 * no `.env` file sits next to it. The anon key is a public key — it is meant to
 * ship with the client; every table is protected by RLS (see supabase_schema.sql).
 */
const FALLBACK_URL = 'https://iaodxcutsajckdjjqhnk.supabase.co'
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlhb2R4Y3V0c2FqY2tkampxaG5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0OTQzOTUsImV4cCI6MjEwMTA3MDM5NX0.TcVTDAVojlhJ5dGw2tJfSMJFju9KjNpcvsbfLwQiT30'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'cosmetics-supabase-auth',
  },
  realtime: { params: { eventsPerSecond: 10 } },
})

export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/** True when the failure is a connectivity problem rather than a real API error. */
export const isNetworkError = (error: unknown): boolean => {
  const message = (error as { message?: string } | null)?.message ?? String(error ?? '')
  return /fetch|network|timeout|Failed to fetch|ERR_INTERNET/i.test(message)
}

/** Human-readable message for a Supabase/Postgres error. */
export const cloudErrorMessage = (error: unknown): string => {
  const raw = (error as { message?: string } | null)?.message ?? String(error ?? '')
  if (/ADMIN_ALREADY_EXISTS/.test(raw)) return "Un compte administrateur existe déjà"
  if (/ADMIN_ONLY/.test(raw)) return 'Action réservée à l’administrateur'
  if (/NOT_AUTHORIZED/.test(raw)) return 'Session expirée, reconnectez-vous'
  if (/PASSWORD_TOO_SHORT/.test(raw)) return 'Mot de passe trop court (4 caractères minimum)'
  if (/EMAIL_REQUIRED/.test(raw)) return 'Email obligatoire'
  if (/WORKER_NOT_FOUND/.test(raw)) return 'Employé introuvable'
  if (/Invalid login credentials/i.test(raw)) return 'Email ou mot de passe incorrect'
  if (/duplicate key|already registered/i.test(raw)) return 'Cet email est déjà utilisé'
  if (/Could not find the function|schema cache|does not exist/i.test(raw))
    return 'Base de données non initialisée — exécutez supabase_schema.sql'
  if (isNetworkError(raw)) return 'Connexion au serveur impossible — mode hors ligne'
  return raw || 'Erreur inconnue'
}
