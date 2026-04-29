import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/shared/auth/AuthContext'
import { ProtectedRoute } from '@/shared/auth/ProtectedRoute'
import { AppShell } from '@/shared/components/AppShell'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { Toaster } from '@/shared/components/Toaster'
import { LoginPage } from '@/pages/LoginPage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ManagerPage } from '@/modules/manager/ManagerPage'
import { CashPage } from '@/modules/cash/CashPage'
import { TareasPage } from '@/modules/tareas/TareasPage'
import { TrabajadoresOpPage } from '@/modules/trabajadores/TrabajadoresOpPage'
import { TurnosPage } from '@/modules/turnos/TurnosPage'
import { CobrosPage } from '@/modules/cobros/CobrosPage'
import { AgentePage } from '@/modules/agente/AgentePage'
import { TrabajadoresPage } from '@/modules/trabajadores/TrabajadoresPage'
import { SueldosPage } from '@/modules/sueldos/SueldosPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
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
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route index element={<HomePage />} />
                  <Route element={<ProtectedRoute module="manager" />}>
                    <Route path="manager" element={<ManagerPage />} />
                  </Route>
                  <Route element={<ProtectedRoute module="cash" />}>
                    <Route path="cash" element={<CashPage />} />
                  </Route>
                  <Route element={<ProtectedRoute module="trabajadores" />}>
                    <Route path="trabajadores" element={<TrabajadoresOpPage />} />
                    <Route path="tareas" element={<TareasPage />} />
                  </Route>
                  <Route element={<ProtectedRoute module="turnos" />}>
                    <Route path="turnos" element={<TurnosPage />} />
                  </Route>
                  <Route element={<ProtectedRoute module="cobros" />}>
                    <Route path="cobros" element={<CobrosPage />} />
                  </Route>
                  <Route element={<ProtectedRoute module="agente" />}>
                    <Route path="agente" element={<AgentePage />} />
                  </Route>
                  <Route element={<ProtectedRoute module="bbdd_trabajadores" />}>
                    <Route path="bbdd-trabajadores" element={<TrabajadoresPage />} />
                  </Route>
                  <Route element={<ProtectedRoute module="sueldos" />}>
                    <Route path="sueldos" element={<SueldosPage />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
