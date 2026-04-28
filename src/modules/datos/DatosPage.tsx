import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'

export function DatosPage() {
  return (
    <ModulePlaceholder
      title="Datos"
      subtitle="Importación de Excels + integración Drive"
      description="Hub de ingestión de datos: subir Excels (drag&drop), parsearlos con SheetJS, mapearlos a tablas Supabase. Más adelante: sync nativo con Google Drive. Es la fuente que alimenta los análisis de Manager."
    />
  )
}
