import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'

export function TurnosPage() {
  return (
    <ModulePlaceholder
      title="Turnos"
      subtitle="Planning del equipo"
      description="Vista semanal de turnos, asignación por empleado, tipos de turno (compra, mañana, libre, power). Es el primer módulo que migramos en serio — tabla `turnos` + `empleados` en Supabase."
    />
  )
}
