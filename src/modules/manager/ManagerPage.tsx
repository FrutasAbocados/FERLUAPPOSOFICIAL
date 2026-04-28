import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'

export function ManagerPage() {
  return (
    <ModulePlaceholder
      title="Manager"
      subtitle="Análisis de ventas, márgenes y pedidos"
      description="Aquí va el dashboard analítico — ventas por categoría, márgenes por producto, evolución de pedidos. Es la última pieza que migramos: primero alimentamos el core de datos desde los demás módulos y luego construimos los gráficos."
    />
  )
}
