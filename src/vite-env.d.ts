/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Address the phone must open for the POS scanner (defaults to window.location.origin). */
  readonly VITE_SCAN_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
