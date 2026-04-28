import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/shared/auth/AuthContext'
import { ProtectedRoute } from '@/shared/auth/ProtectedRoute'
import { AppShell } from '@/shared/components/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ManagerPage } from '@/modules/manager/ManagerPage'
import { CashPage } from '@/modules/cash/CashPage'
import { TareasPage } from '@/modules/tareas/TareasPage'
import { TurnosPage } from '@/modules/turnos/TurnosPage'
import { TesoreriaPage } from '@/modules/tesoreria/TesoreriaPage'

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
                <Route element={<ProtectedRoute module="tareas" />}>
                  <Route path="tareas" element={<TareasPage />} />
                </Route>
                <Route element={<ProtectedRoute module="turnos" />}>
                  <Route path="turnos" element={<TurnosPage />} />
                </Route>
                <Route element={<ProtectedRoute module="tesoreria" />}>
                  <Route path="tesoreria" element={<TesoreriaPage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
