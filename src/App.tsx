import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/shared/auth/AuthContext'
import { ProtectedRoute } from '@/shared/auth/ProtectedRoute'
import { AppShell } from '@/shared/components/AppShell'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { Toaster } from '@/shared/components/Toaster'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'

const LoginPage         = lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })))
const HomePage          = lazy(() => import('@/pages/HomePage').then(m => ({ default: m.HomePage })))
const NotFoundPage      = lazy(() => import('@/pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })))
const ManagerPage       = lazy(() => import('@/modules/manager/ManagerPage').then(m => ({ default: m.ManagerPage })))
const CashPage          = lazy(() => import('@/modules/cash/CashPage').then(m => ({ default: m.CashPage })))
const TareasPage        = lazy(() => import('@/modules/tareas/TareasPage').then(m => ({ default: m.TareasPage })))
const TrabajadoresOpPage = lazy(() => import('@/modules/trabajadores/TrabajadoresOpPage').then(m => ({ default: m.TrabajadoresOpPage })))
const CobrosPage        = lazy(() => import('@/modules/cobros/CobrosPage').then(m => ({ default: m.CobrosPage })))
const AgentePage        = lazy(() => import('@/modules/agente/AgentePage').then(m => ({ default: m.AgentePage })))
const TrabajadoresPage  = lazy(() => import('@/modules/trabajadores/TrabajadoresPage').then(m => ({ default: m.TrabajadoresPage })))
const SueldosPage       = lazy(() => import('@/modules/sueldos/SueldosPage').then(m => ({ default: m.SueldosPage })))
const PedidosWaPage     = lazy(() => import('@/modules/pedidos-wa/PedidosWaPage').then(m => ({ default: m.PedidosWaPage })))
const GastosPage        = lazy(() => import('@/modules/gastos/GastosPage').then(m => ({ default: m.GastosPage })))
const ClientesPage      = lazy(() => import('@/modules/clientes/ClientesPage').then(m => ({ default: m.ClientesPage })))

function PageFallback() {
  return (
    <div
      className="flex items-center justify-center min-h-40 text-sm"
      style={{ color: 'var(--color-muted, #6b7280)' }}
    >
      Cargando…
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Suspense fallback={<PageFallback />}><LoginPage /></Suspense>} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route index element={<Suspense fallback={<PageFallback />}><HomePage /></Suspense>} />
                  <Route element={<ProtectedRoute module="manager" />}>
                    <Route path="manager" element={<Suspense fallback={<PageFallback />}><ManagerPage /></Suspense>} />
                  </Route>
                  <Route element={<ProtectedRoute module="cash" />}>
                    <Route path="cash" element={<Suspense fallback={<PageFallback />}><CashPage /></Suspense>} />
                  </Route>
                  <Route element={<ProtectedRoute module="trabajadores" />}>
                    <Route path="trabajadores" element={<Suspense fallback={<PageFallback />}><TrabajadoresOpPage /></Suspense>} />
                  </Route>
                  <Route element={<ProtectedRoute module="tareas" />}>
                    <Route path="tareas" element={<Suspense fallback={<PageFallback />}><TareasPage /></Suspense>} />
                  </Route>
                  <Route element={<ProtectedRoute module="turnos" />}>
                    <Route path="turnos" element={<Navigate to="/trabajadores?tab=turnos" replace />} />
                  </Route>
                  <Route element={<ProtectedRoute module="cobros" />}>
                    <Route path="cobros" element={<Suspense fallback={<PageFallback />}><CobrosPage /></Suspense>} />
                  </Route>
                  <Route element={<ProtectedRoute module="agente" />}>
                    <Route path="agente" element={<Suspense fallback={<PageFallback />}><AgentePage /></Suspense>} />
                  </Route>
                  <Route element={<ProtectedRoute module="bbdd_trabajadores" />}>
                    <Route path="bbdd-trabajadores" element={<Suspense fallback={<PageFallback />}><TrabajadoresPage /></Suspense>} />
                  </Route>
                  <Route element={<ProtectedRoute module="sueldos" />}>
                    <Route path="sueldos" element={<Suspense fallback={<PageFallback />}><SueldosPage /></Suspense>} />
                  </Route>
                  <Route element={<ProtectedRoute module="pedidos_wa" />}>
                    <Route path="pedidos-wa" element={<Suspense fallback={<PageFallback />}><PedidosWaPage /></Suspense>} />
                  </Route>
                  <Route element={<ProtectedRoute module="gastos" />}>
                    <Route path="gastos" element={<Suspense fallback={<PageFallback />}><GastosPage /></Suspense>} />
                  </Route>
                  <Route element={<ProtectedRoute module="clientes" />}>
                    <Route path="clientes" element={<Suspense fallback={<PageFallback />}><ClientesPage /></Suspense>} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFoundPage /></Suspense>} />
            </Routes>
          </BrowserRouter>
          <Toaster />
          <ConfirmDialog />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
