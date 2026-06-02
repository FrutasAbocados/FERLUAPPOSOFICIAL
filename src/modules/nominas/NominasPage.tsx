import { useMemo, useRef, useState } from 'react'
import { Download, FileText, Trash2, Upload } from 'lucide-react'
import { useAuth } from '@/shared/auth/useAuth'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import {
  descargarNomina,
  useBorrarNomina,
  useEmpleadosActivos,
  useMisNominas,
  useNominasAdmin,
  useSubirNomina,
  type NominaRow,
} from './lib/queries'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function periodoLabel(periodo: string) {
  const [y, m] = periodo.split('-')
  const idx = Number(m) - 1
  return `${MESES[idx] ?? m} ${y}`
}

function sizeLabel(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function NominasPage() {
  const { profile } = useAuth()
  const esAdmin = profile?.role === 'admin_full' || profile?.role === 'admin_op'

  return esAdmin ? <NominasAdmin /> : <NominasEmpleado />
}

/* ════════════════ Vista empleado ════════════════ */
function NominasEmpleado() {
  const { data, isLoading } = useMisNominas()

  const onDescargar = async (path: string, label: string) => {
    try {
      await descargarNomina(path, `Nomina ${label}.pdf`)
    } catch (e) {
      toast({ title: 'No se pudo descargar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-28 md:px-6 md:py-8">
      <Header subtitulo="Tus nóminas en PDF" />

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-sm text-[var(--color-ink-3)]">
          Cargando…
        </div>
      ) : !data || data.length === 0 ? (
        <div className="ao-panel mt-5 p-8 text-center text-sm text-[var(--color-ink-2)]">
          Todavía no hay nóminas disponibles. Cuando administración suba una, aparecerá aquí.
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {data.map(n => (
            <div key={n.id} className="ao-panel flex items-center justify-between gap-3 p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--mint-glow)]">
                  <FileText className="h-5 w-5 text-[var(--mint)]" strokeWidth={1.6} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--ink)]">
                    {n.titulo || periodoLabel(n.periodo)}
                  </div>
                  <div className="text-xs text-[var(--color-ink-3)]">
                    {n.titulo ? periodoLabel(n.periodo) : 'Nómina'} {sizeLabel(n.size_bytes) && `· ${sizeLabel(n.size_bytes)}`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDescargar(n.storage_path, periodoLabel(n.periodo))}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--mint)] px-3 py-1.5 text-xs font-semibold text-[#0a1310] hover:bg-[var(--mint-2)]"
              >
                <Download className="h-4 w-4" /> Descargar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ════════════════ Vista admin ════════════════ */
function NominasAdmin() {
  const { data: empleados } = useEmpleadosActivos()
  const { data: nominas, isLoading } = useNominasAdmin()
  const subir = useSubirNomina()
  const borrar = useBorrarNomina()
  const fileRef = useRef<HTMLInputElement>(null)

  const hoy = new Date()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

  const [empleadoId, setEmpleadoId] = useState('')
  const [mes, setMes] = useState(mesActual)        // 'YYYY-MM' (input month)
  const [titulo, setTitulo] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [filtroEmpleado, setFiltroEmpleado] = useState('')

  const nominasFiltradas = useMemo(() => {
    if (!nominas) return []
    return filtroEmpleado ? nominas.filter(n => n.empleado_id === filtroEmpleado) : nominas
  }, [nominas, filtroEmpleado])

  const onSubir = async () => {
    if (!empleadoId) { toast({ title: 'Selecciona un empleado', variant: 'error' }); return }
    if (!file) { toast({ title: 'Selecciona el PDF de la nómina', variant: 'error' }); return }
    if (file.type !== 'application/pdf') { toast({ title: 'El archivo debe ser PDF', variant: 'error' }); return }
    try {
      await subir.mutateAsync({
        empleadoId,
        periodo: `${mes}-01`,
        titulo: titulo.trim() || null,
        file,
      })
      toast({ title: 'Nómina subida', variant: 'success' })
      setTitulo('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      toast({ title: 'No se pudo subir', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  const onDescargar = async (n: NominaRow) => {
    try {
      await descargarNomina(n.storage_path, `Nomina ${n.empleado_nombre ?? ''} ${periodoLabel(n.periodo)}.pdf`)
    } catch (e) {
      toast({ title: 'No se pudo descargar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  const onBorrar = async (n: NominaRow) => {
    const ok = await confirm({
      title: '¿Borrar esta nómina?',
      description: `${n.empleado_nombre ?? 'Empleado'} · ${periodoLabel(n.periodo)}. El empleado dejará de verla.`,
      variant: 'danger',
      confirmLabel: 'Borrar',
    })
    if (!ok) return
    try {
      await borrar.mutateAsync({ id: n.id, storage_path: n.storage_path })
      toast({ title: 'Nómina borrada', variant: 'success' })
    } catch (e) {
      toast({ title: 'No se pudo borrar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 pb-28 md:px-6 md:py-8">
      <Header subtitulo="Sube las nóminas en PDF; cada empleado solo ve las suyas" />

      {/* Formulario de subida */}
      <section className="ao-panel mt-5 p-4 md:p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">
          Subir nómina
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--color-ink-2)]">Empleado</span>
            <select
              value={empleadoId}
              onChange={e => setEmpleadoId(e.target.value)}
              className="rounded-md border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="">— Selecciona —</option>
              {empleados?.map(e => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--color-ink-2)]">Periodo (mes)</span>
            <input
              type="month"
              value={mes}
              onChange={e => setMes(e.target.value)}
              className="rounded-md border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--color-ink-2)]">Título (opcional)</span>
            <input
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ej. Paga extra verano"
              className="rounded-md border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--ink)]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--color-ink-2)]">Archivo PDF</span>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="rounded-md border border-[var(--line)] bg-[var(--panel-2)] px-3 py-1.5 text-sm text-[var(--color-ink-2)] file:mr-3 file:rounded file:border-0 file:bg-[var(--mint-glow)] file:px-2 file:py-1 file:text-xs file:font-semibold file:text-[var(--mint)]"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={onSubir}
          disabled={subir.isPending}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[var(--mint)] px-4 py-2 text-sm font-semibold text-[#0a1310] hover:bg-[var(--mint-2)] disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {subir.isPending ? 'Subiendo…' : 'Subir nómina'}
        </button>
      </section>

      {/* Listado */}
      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">
            Nóminas subidas
          </h2>
          <select
            value={filtroEmpleado}
            onChange={e => setFiltroEmpleado(e.target.value)}
            className="rounded-md border border-[var(--line)] bg-[var(--panel-2)] px-2.5 py-1.5 text-xs text-[var(--ink)]"
          >
            <option value="">Todos los empleados</option>
            {empleados?.map(e => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-[var(--color-ink-3)]">
            Cargando…
          </div>
        ) : nominasFiltradas.length === 0 ? (
          <div className="ao-panel p-8 text-center text-sm text-[var(--color-ink-2)]">
            No hay nóminas {filtroEmpleado ? 'para este empleado' : 'subidas todavía'}.
          </div>
        ) : (
          <div className="space-y-2">
            {nominasFiltradas.map(n => (
              <div key={n.id} className="ao-panel flex items-center justify-between gap-3 p-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--mint-glow)]">
                    <FileText className="h-5 w-5 text-[var(--mint)]" strokeWidth={1.6} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--ink)]">
                      {n.empleado_nombre ?? '—'}
                    </div>
                    <div className="text-xs text-[var(--color-ink-3)]">
                      {n.titulo ? `${n.titulo} · ` : ''}{periodoLabel(n.periodo)}{sizeLabel(n.size_bytes) && ` · ${sizeLabel(n.size_bytes)}`}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onDescargar(n)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[rgba(255,255,255,.04)]"
                  >
                    <Download className="h-4 w-4" /> PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => onBorrar(n)}
                    className="inline-flex items-center justify-center rounded-md border border-[var(--line)] p-1.5 text-[var(--coral)] hover:bg-[rgba(255,255,255,.04)]"
                    aria-label="Borrar nómina"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Header({ subtitulo }: { subtitulo: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-[var(--mint-glow)]">
        <FileText className="h-5 w-5 text-[var(--mint)]" strokeWidth={1.6} />
      </div>
      <div>
        <h1 className="text-lg font-bold text-[var(--ink)]">Nóminas</h1>
        <p className="text-xs text-[var(--ink-mute)]">{subtitulo}</p>
      </div>
    </div>
  )
}
