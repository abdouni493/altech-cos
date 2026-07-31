import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import {
  Gem,
  Globe,
  UserPlus,
  LogIn,
  ChevronDown,
  Loader2,
  ShieldCheck,
  CloudOff,
  Cloud,
} from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { useTranslation } from '@/i18n/useTranslation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { cloudErrorMessage } from '@/lib/supabase'

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
})
type LoginForm = z.infer<typeof loginSchema>

export const Login = () => {
  const { t, toggleLang, lang } = useTranslation()
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const createAdmin = useAuthStore((s) => s.createAdmin)
  const adminExists = useAuthStore((s) => s.adminExists)
  const online = useAuthStore((s) => s.online)

  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [creating, setCreating] = useState(false)
  /** null while the check is running — the button only appears once we know. */
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null)

  // Ask Supabase whether an administrator already exists. As soon as one does,
  // the "Créer un compte Admin" button is gone — for every device, for good.
  const [checkError, setCheckError] = useState('')

  useEffect(() => {
    let alive = true
    adminExists()
      .then((exists) => alive && setHasAdmin(exists))
      .catch((e) => {
        if (!alive) return
        // the database is unreachable / not installed → say so instead of
        // pretending no admin exists
        setCheckError(cloudErrorMessage(e))
        setHasAdmin(false)
      })
    return () => {
      alive = false
    }
  }, [adminExists])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onLogin = async (data: LoginForm) => {
    setSubmitting(true)
    try {
      const user = await login(data.identifier, data.password)
      if (user) {
        toast.success(`${t('welcomeBack')}, ${user.fullName}`)
        navigate('/dashboard')
      } else {
        toast.error(t('wrongCredentials'))
      }
    } catch (e) {
      toast.error(cloudErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  // create-account form
  const createSchema = z
    .object({
      fullName: z.string().min(2),
      username: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(4),
      confirm: z.string().min(4),
    })
    .refine((d) => d.password === d.confirm, { path: ['confirm'], message: t('passwordMismatch') })
  type CreateForm = z.infer<typeof createSchema>

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) })

  const onCreate = async (data: CreateForm) => {
    setCreating(true)
    try {
      const user = await createAdmin({
        fullName: data.fullName,
        username: data.username,
        email: data.email,
        password: data.password,
      })
      // the admin now exists → the button disappears permanently
      setHasAdmin(true)
      setShowCreate(false)
      toast.success(`${t('accountCreated')} — ${user.fullName}`)
      navigate('/dashboard')
    } catch (e) {
      const message = cloudErrorMessage(e)
      toast.error(message)
      if (/administrateur existe déjà/i.test(message)) setHasAdmin(true)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="wood-grain relative flex min-h-screen items-center justify-center overflow-hidden bg-wood-sidebar p-4">
      {/* decorative blobs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gold/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-wood-light/20 blur-3xl" />

      {/* Language toggle */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleLang}
        className="glass absolute end-5 top-5 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
      >
        <Globe size={16} />
        {lang === 'fr' ? 'العربية' : 'Français'}
      </motion.button>

      {/* Cloud status */}
      <div className="glass absolute start-5 top-5 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-white/90">
        {online ? <Cloud size={14} className="text-sage" /> : <CloudOff size={14} className="text-gold-light" />}
        {online ? t('cloudConnected') : t('cloudOffline')}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: 'spring', damping: 12 }}
          className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gold-shine shadow-gold"
        >
          <Gem size={38} className="text-wood-dark" />
        </motion.div>
        <div className="mb-6 text-center">
          <h1 className="text-display text-4xl font-bold text-white">{t('appName')}</h1>
          <p className="mt-1 text-sm text-wood-blonde/80">{t('appTagline')}</p>
        </div>

        {/* Card */}
        <div className="glass rounded-3xl p-7 shadow-wood-lg">
          <p className="mb-5 text-center text-sm text-white/80">{t('loginSubtitle')}</p>

          <form onSubmit={handleSubmit(onLogin)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/90">
                {t('email')} / {t('username')}
              </label>
              <input
                {...register('identifier')}
                placeholder="admin@belle-cosmetiques.com"
                autoComplete="username"
                className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-gold focus:ring-2 focus:ring-gold/30"
              />
              {errors.identifier && <p className="mt-1 text-xs text-terracotta">{t('required')}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/90">{t('password')}</label>
              <input
                type="password"
                {...register('password')}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-gold focus:ring-2 focus:ring-gold/30"
              />
              {errors.password && <p className="mt-1 text-xs text-terracotta">{t('required')}</p>}
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
              {t('login')}
            </Button>
          </form>

          {/* ---- Create the administrator account (first run only) ---------- */}
          {hasAdmin === null && (
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-white/60">
              <Loader2 size={13} className="animate-spin" />
              {t('checkingAdmin')}
            </p>
          )}

          {checkError && (
            <p className="mt-4 rounded-xl border border-terracotta/40 bg-terracotta/15 px-3 py-2 text-center text-xs text-white">
              {checkError}
            </p>
          )}

          {hasAdmin === false && (
            <>
              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-white/15" />
                <span className="text-xs uppercase tracking-wide text-white/50">{t('firstRun')}</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>

              <Button
                type="button"
                variant="gold"
                size="lg"
                className="w-full"
                onClick={() => setShowCreate((v) => !v)}
              >
                <UserPlus size={18} />
                {t('createAdmin')}
                <ChevronDown size={16} className={`transition ${showCreate ? 'rotate-180' : ''}`} />
              </Button>
              <p className="mt-2 text-center text-xs text-white/60">{t('createAdminHint')}</p>
            </>
          )}

          <AnimatePresence>
            {showCreate && hasAdmin === false && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={createForm.handleSubmit(onCreate)}
                className="mt-4 space-y-3 overflow-hidden border-t border-white/15 pt-4"
              >
                <Input label={<span className="text-white/90">{t('fullName')}</span>} {...createForm.register('fullName')} error={createForm.formState.errors.fullName && t('required')} className="bg-white/90" />
                <Input label={<span className="text-white/90">{t('username')}</span>} {...createForm.register('username')} error={createForm.formState.errors.username && t('required')} className="bg-white/90" />
                <Input label={<span className="text-white/90">{t('email')}</span>} type="email" {...createForm.register('email')} error={createForm.formState.errors.email && t('required')} className="bg-white/90" />
                <div className="grid grid-cols-2 gap-3">
                  <Input label={<span className="text-white/90">{t('password')}</span>} type="password" {...createForm.register('password')} error={createForm.formState.errors.password && t('required')} className="bg-white/90" />
                  <Input label={<span className="text-white/90">{t('confirmPassword')}</span>} type="password" {...createForm.register('confirm')} error={createForm.formState.errors.confirm?.message} className="bg-white/90" />
                </div>
                <Button type="submit" variant="sage" size="lg" className="w-full" disabled={creating}>
                  {creating ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                  {t('createMyAdmin')}
                </Button>
              </motion.form>
            )}
          </AnimatePresence>

          {hasAdmin === true && (
            <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-white/55">
              <ShieldCheck size={13} className="text-sage" />
              {t('adminAlreadyCreated')}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  )
}
