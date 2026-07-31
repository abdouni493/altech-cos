import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Gem, Loader2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { useAuthStore } from '@/store/useAuthStore'
import { installCloudGuards, subscribeShopRealtime } from '@/lib/cloudBootstrap'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { StockPage } from '@/pages/Stock/StockPage'
import { PurchasePage } from '@/pages/Purchase/PurchasePage'
import { ProductionPage } from '@/pages/Production/ProductionPage'
import { POSPage } from '@/pages/POS/POSPage'
import { SalesPage } from '@/pages/Sales/SalesPage'
import { ClientsPage } from '@/pages/Clients/ClientsPage'
import { SuppliersPage } from '@/pages/Suppliers/SuppliersPage'
import { WorkersPage } from '@/pages/Workers/WorkersPage'
import { ExpensesPage } from '@/pages/Expenses/ExpensesPage'
import { CaissePage } from '@/pages/Caisse/CaissePage'
import { ReportsPage } from '@/pages/Reports/ReportsPage'
import { SettingsPage } from '@/pages/Settings/SettingsPage'
import { ScanPage } from '@/pages/Scan/ScanPage'

const RequireAuth = () => {
  const currentUser = useAuthStore((s) => s.currentUser)
  return currentUser ? <Outlet /> : <Navigate to="/login" replace />
}

/** Splash shown while the Supabase session is restored and the shop downloaded. */
const Splash = ({ label }: { label: string }) => (
  <div className="wood-grain flex min-h-screen flex-col items-center justify-center gap-4 bg-wood-sidebar">
    <div className="flex h-20 w-20 animate-bloom items-center justify-center rounded-2xl bg-gold-shine shadow-gold">
      <Gem size={38} className="text-wood-dark" />
    </div>
    <p className="flex items-center gap-2 text-sm font-medium text-white/85">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </p>
  </div>
)

export default function App() {
  const init = useAuthStore((s) => s.init)
  const ready = useAuthStore((s) => s.ready)
  const syncing = useAuthStore((s) => s.syncing)
  const currentUser = useAuthStore((s) => s.currentUser)

  useEffect(() => {
    installCloudGuards()
    init()
  }, [init])

  // Live updates from the database while a member is signed in.
  useEffect(() => {
    if (!currentUser) return
    return subscribeShopRealtime()
  }, [currentUser])

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'linear-gradient(145deg, #FFFFFF 0%, #FDF6FE 100%)',
            color: '#2A1140',
            border: '1px solid rgba(192, 38, 211, 0.22)',
            boxShadow: '0 8px 30px rgba(59, 7, 100, 0.18)',
            fontWeight: 500,
          },
          success: { iconTheme: { primary: '#3F9E84', secondary: '#fff' } },
          error: { iconTheme: { primary: '#E24A6A', secondary: '#fff' } },
        }}
      />
      <Routes>
        {/* Phone barcode scanner — public, paired by the QR code shown on the POS */}
        <Route path="/scan/:sessionId" element={<ScanPage />} />

        {!ready ? (
          <Route path="*" element={<Splash label="Connexion à la boutique…" />} />
        ) : (
          <>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route element={syncing ? <Splash label="Synchronisation des données…" /> : <Layout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/stock" element={<StockPage />} />
                <Route path="/purchase" element={<PurchasePage />} />
                <Route path="/production" element={<ProductionPage />} />
                <Route path="/pos" element={<POSPage />} />
                <Route path="/sales" element={<SalesPage />} />
                <Route path="/clients" element={<ClientsPage />} />
                <Route path="/suppliers" element={<SuppliersPage />} />
                <Route path="/workers" element={<WorkersPage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/caisse" element={<CaissePage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  )
}
