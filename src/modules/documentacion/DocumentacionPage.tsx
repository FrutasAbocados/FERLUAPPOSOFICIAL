import { useMemo, useState } from 'react'
import {
  Download,
  Eye,
  FolderLock,
  Loader2,
  Mail,
  Pencil,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { confirm } from '@/shared/lib/confirm'
import { errorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import {
  useBorrarDocumento,
  useDocumentos,
  useEditarDocumento,
  useSubirDocumento,
  urlDocumento,
} from './lib/queries'
import {
  CATEGORIAS,
  ESTADOS,
  PERIODOS,
  formatBytes,
  gmailUrl,
  periodoLabel,
  type Categoria,
  type DocumentoEditable,
  type DocumentoEmpresa,
  type Estado,
} from './lib/types'

const selectClass = cn(
  'h-10 w-full rounded-[var(--radius)] border border-[var(--line)]',
  'bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none',
)

const estadoInfo = (e: Estado) => ESTADOS.find((x) => x.key === e) ?? ESTADOS[5]
const catLabel = (c: Categoria) => CATEGORIAS.find((x) => x.key === c)?.label ?? c

const ORDEN_PERIODO: Record<string, number> = { '0A': 0, '4T': 1, '3T': 2, '2T': 3, '1T': 4 }
const ordenPeriodo = (p: string | null) => (p == null ? 99 : ORDEN_PERIODO[p] ?? 20 - Number(p))

function EstadoChip({ estado }: { estado: Estado }) {
  const info = estadoInfo(estado)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        info.tone === 'mint' && 'border-[color:var(--mint)]/40 bg-[color:var(--mint)]/10 text-[var(--mint)]',
        info.tone === 'amber' && 'border-[color:var(--amber)]/40 bg-[color:var(--amber)]/10 text-[var(--amber)]',
        info.tone === 'dim' && 'border-[var(--line-2)] text-[var(--ink-dim)]',
      )}
    >
      {info.label}
    </span>
  )
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ao-panel px-4 py-3">
      <div className="micro-caps text-[var(--ink-mute)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--ink)]">{value}</div>
    </div>
  )
}

/** Cuadro ejercicio × modelo: qué declaraciones están archivadas y en qué estado. */
function CoberturaFiscal({ docs }: { docs: DocumentoEmpresa[] }) {
  const columnas = [
    { key: '303-1T', label: '303 1T' },
    { key: '303-2T', label: '303 2T' },
    { key: '303-3T', label: '303 3T' },
    { key: '303-4T', label: '303 4T' },
    { key: '390-0A', label: '390' },
    { key: '200-0A', label: '200' },
    { key: '202', label: '202' },
  ]
  const fiscales = docs.filter((d) => d.modelo && ['303', '390', '200', '202'].includes(d.modelo) && d.ejercicio)
  const ejercicios = [...new Set(fiscales.map((d) => d.ejercicio as number))].sort((a, b) => b - a)
  if (!ejercicios.length) return null
  const celda = (ej: number, key: string) => {
    const [modelo, periodo] = key.split('-')
    const m = fiscales.filter((d) => d.ejercicio === ej && d.modelo === modelo && (!periodo || d.periodo === periodo))
    if (!m.length) return <span className="text-[var(--ink-mute)]">—</span>
    const presentado = m.some((d) => d.estado === 'presentado')
    return (
      <span className={presentado ? 'text-[var(--mint)]' : 'text-[var(--amber)]'}>
        {presentado ? '✓' : 'borrador'}
        {modelo === '202' && <span className="ml-1 tabular-nums">×{m.length}</span>}
      </span>
    )
  }
  return (
    <section className="ao-panel overflow-hidden">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Cobertura fiscal archivada</h2>
        <p className="mt-0.5 text-xs text-[var(--ink-mute)]">
          ✓ con justificante de presentación · «borrador» sin justificante · — no archivado
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border-b border-[var(--line-2)] px-3 py-2 text-left font-semibold text-[var(--ink-dim)]">Ejercicio</th>
              {columnas.map((c) => (
                <th key={c.key} className="border-b border-[var(--line-2)] px-3 py-2 text-center font-semibold text-[var(--ink-dim)]">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ejercicios.map((ej) => (
              <tr key={ej}>
                <td className="border-b border-[var(--line)] px-3 py-2 font-medium tabular-nums text-[var(--ink)]">{ej}</td>
                {columnas.map((c) => (
                  <td key={c.key} className="border-b border-[var(--line)] px-3 py-2 text-center">
                    {celda(ej, c.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const VACIO: DocumentoEditable = {
  categoria: 'otros',
  tipo: '',
  modelo: null,
  titulo: '',
  ejercicio: new Date().getFullYear(),
  periodo: null,
  fecha_documento: null,
  estado: 'original',
  csv_aeat: null,
  justificante: null,
  notas: null,
}

function FormularioDocumento({
  inicial,
  conArchivo,
  enviando,
  onCancel,
  onSubmit,
}: {
  inicial: DocumentoEditable
  conArchivo: boolean
  enviando: boolean
  onCancel: () => void
  onSubmit: (datos: DocumentoEditable, file: File | null) => void
}) {
  const [d, setD] = useState<DocumentoEditable>(inicial)
  const [file, setFile] = useState<File | null>(null)
  const set = <K extends keyof DocumentoEditable>(k: K, v: DocumentoEditable[K]) => setD((p) => ({ ...p, [k]: v }))
  const texto = (v: string) => (v.trim() === '' ? null : v.trim())
  const valido = d.titulo.trim() !== '' && d.tipo.trim() !== '' && (!conArchivo || file != null)

  const campo = (label: string, children: React.ReactNode, wide = false) => (
    <label className={cn('space-y-1.5', wide && 'sm:col-span-2')}>
      <span className="micro-caps block text-[var(--ink-mute)]">{label}</span>
      {children}
    </label>
  )

  return (
    <form
      className="space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (valido) onSubmit({ ...d, titulo: d.titulo.trim(), tipo: d.tipo.trim() }, file)
      }}
    >
      <h2 className="text-base font-semibold text-[var(--ink)]">{conArchivo ? 'Subir documento original' : 'Editar documento'}</h2>
      {conArchivo && (
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc"
          className="block w-full text-sm text-[var(--ink-dim)] file:mr-3 file:rounded-[var(--radius)] file:border-0 file:bg-[var(--mint)] file:px-3 file:py-2 file:text-[#0a1310]"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setFile(f)
            if (f && !d.titulo) set('titulo', f.name.replace(/\.[^.]+$/, ''))
          }}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {campo('Categoría', (
          <select className={selectClass} value={d.categoria} onChange={(e) => set('categoria', e.target.value as Categoria)}>
            {CATEGORIAS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        ))}
        {campo('Estado', (
          <select className={selectClass} value={d.estado} onChange={(e) => set('estado', e.target.value as Estado)}>
            {ESTADOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        ))}
        {campo('Título', <Input value={d.titulo} onChange={(e) => set('titulo', e.target.value)} required />, true)}
        {campo('Tipo', <Input value={d.tipo} placeholder="Escritura, Modelo 303, Certificado…" onChange={(e) => set('tipo', e.target.value)} required />)}
        {campo('Modelo AEAT', <Input value={d.modelo ?? ''} placeholder="036, 303, 200…" onChange={(e) => set('modelo', texto(e.target.value))} />)}
        {campo('Ejercicio', (
          <Input
            type="number"
            min={2000}
            max={2100}
            value={d.ejercicio ?? ''}
            onChange={(e) => set('ejercicio', e.target.value === '' ? null : Number(e.target.value))}
          />
        ))}
        {campo('Periodo', (
          <select className={selectClass} value={d.periodo ?? ''} onChange={(e) => set('periodo', e.target.value || null)}>
            <option value="">—</option>
            {PERIODOS.map((p) => <option key={p} value={p}>{periodoLabel(p)}</option>)}
          </select>
        ))}
        {campo('Fecha del documento', (
          <Input type="date" value={d.fecha_documento ?? ''} onChange={(e) => set('fecha_documento', e.target.value || null)} />
        ))}
        {campo('CSV AEAT', <Input value={d.csv_aeat ?? ''} onChange={(e) => set('csv_aeat', texto(e.target.value))} />)}
        {campo('Nº justificante', <Input value={d.justificante ?? ''} onChange={(e) => set('justificante', texto(e.target.value))} />)}
        {campo('Notas', (
          <textarea
            className={cn(selectClass, 'h-20 py-2')}
            value={d.notas ?? ''}
            onChange={(e) => set('notas', texto(e.target.value))}
          />
        ), true)}
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={!valido || enviando}>
          {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
          {conArchivo ? 'Subir' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}

export function DocumentacionPage() {
  const query = useDocumentos()
  const subir = useSubirDocumento()
  const editar = useEditarDocumento()
  const borrar = useBorrarDocumento()

  const [categoria, setCategoria] = useState<Categoria | 'todas'>('todas')
  const [ejercicio, setEjercicio] = useState<string>('todos')
  const [estado, setEstado] = useState<Estado | 'todos'>('todos')
  const [texto, setTexto] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [editando, setEditando] = useState<DocumentoEmpresa | null>(null)

  const docs = useMemo(() => query.data ?? [], [query.data])

  const conteo = useMemo(() => {
    const m = new Map<string, number>()
    docs.forEach((d) => m.set(d.categoria, (m.get(d.categoria) ?? 0) + 1))
    return m
  }, [docs])

  const ejercicios = useMemo(
    () => [...new Set(docs.map((d) => d.ejercicio).filter((e): e is number => e != null))].sort((a, b) => b - a),
    [docs],
  )

  const filtrados = useMemo(() => {
    const q = texto.trim().toLocaleLowerCase('es')
    return docs.filter((d) =>
      (categoria === 'todas' || d.categoria === categoria) &&
      (ejercicio === 'todos' || (ejercicio === 'sin' ? d.ejercicio == null : d.ejercicio === Number(ejercicio))) &&
      (estado === 'todos' || d.estado === estado) &&
      (!q || [d.titulo, d.tipo, d.modelo, d.nombre_original, d.notas, d.csv_aeat].some((v) => v?.toLocaleLowerCase('es').includes(q))),
    )
  }, [docs, categoria, ejercicio, estado, texto])

  // Categoría → ejercicio → documentos ordenados por periodo y fecha.
  const grupos = useMemo(() => {
    const out: { categoria: Categoria; ejercicios: { ejercicio: number | null; docs: DocumentoEmpresa[] }[] }[] = []
    for (const c of CATEGORIAS) {
      const enCat = filtrados.filter((d) => d.categoria === c.key)
      if (!enCat.length) continue
      const ejs = [...new Set(enCat.map((d) => d.ejercicio))].sort((a, b) => (b ?? -1) - (a ?? -1))
      out.push({
        categoria: c.key,
        ejercicios: ejs.map((ej) => ({
          ejercicio: ej,
          docs: enCat
            .filter((d) => d.ejercicio === ej)
            .sort((a, b) => ordenPeriodo(a.periodo) - ordenPeriodo(b.periodo) || (b.fecha_documento ?? '').localeCompare(a.fecha_documento ?? '')),
        })),
      })
    }
    return out
  }, [filtrados])

  const abrir = async (d: DocumentoEmpresa, descargar: boolean) => {
    try {
      const url = await urlDocumento(d, descargar)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      toast({ title: 'No se pudo abrir el documento', description: errorMessage(e), variant: 'error' })
    }
  }

  const eliminar = async (d: DocumentoEmpresa) => {
    const ok = await confirm({
      title: `¿Eliminar «${d.titulo}»?`,
      description: 'Se borra el archivo del almacenamiento de AbocadosOS. El correo de origen no se toca.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    borrar.mutate(d, {
      onSuccess: () => toast({ title: 'Documento eliminado', variant: 'success' }),
      onError: (e) => toast({ title: 'No se pudo eliminar', description: errorMessage(e), variant: 'error' }),
    })
  }

  const borradores = docs.filter((d) => d.estado === 'borrador').length

  return (
    <div>
      <PageTopbar
        breadcrumb="Ferlu Project S.L. · B22560510"
        title="Documentación"
        subtitle="Escrituras, censales, impuestos, contabilidad y certificados de la empresa"
        actions={
          <Button onClick={() => setSubiendo(true)}>
            <Upload className="h-4 w-4" /> Subir documento
          </Button>
        }
      />

      <div className="ao-page space-y-4">
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--line-2)] px-4 py-3 text-xs text-[var(--ink-dim)]">
          <FolderLock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mint)]" />
          <p>Archivo privado: solo el titular autorizado (Luis). Ni administración operativa, ni equipo, ni gestoría. Los enlaces de consulta y descarga caducan a los 5 minutos.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Documentos" value={docs.length} />
          <Kpi label="Categorías con documentos" value={conteo.size} />
          <Kpi label="Ejercicios" value={ejercicios.length ? `${ejercicios[ejercicios.length - 1]}–${ejercicios[0]}` : '—'} />
          <Kpi label="Borradores sin justificante" value={borradores} />
        </div>

        <CoberturaFiscal docs={docs} />

        <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav className="ao-panel h-fit p-2">
            {[{ key: 'todas' as const, label: 'Todas', hint: '' }, ...CATEGORIAS].map((c) => {
              const n = c.key === 'todas' ? docs.length : conteo.get(c.key) ?? 0
              return (
                <button
                  key={c.key}
                  type="button"
                  title={c.hint}
                  onClick={() => setCategoria(c.key)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-[var(--radius)] px-3 py-2 text-left text-sm',
                    categoria === c.key ? 'bg-[var(--mint-glow)] text-[var(--mint)]' : 'text-[var(--ink-dim)] hover:bg-white/[.03]',
                    n === 0 && categoria !== c.key && 'opacity-50',
                  )}
                >
                  <span className="truncate">{c.label}</span>
                  <span className="ml-2 tabular-nums text-xs">{n}</span>
                </button>
              )
            })}
          </nav>

          <section className="ao-panel overflow-hidden">
            <div className="grid gap-3 border-b border-[var(--line)] p-3 sm:grid-cols-[1fr_150px_170px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--ink-mute)]" />
                <Input className="pl-9" placeholder="Buscar título, modelo, CSV…" value={texto} onChange={(e) => setTexto(e.target.value)} />
              </div>
              <select className={selectClass} value={ejercicio} onChange={(e) => setEjercicio(e.target.value)}>
                <option value="todos">Todos los ejercicios</option>
                {ejercicios.map((e) => <option key={e} value={e}>{e}</option>)}
                <option value="sin">Sin ejercicio</option>
              </select>
              <select className={selectClass} value={estado} onChange={(e) => setEstado(e.target.value as Estado | 'todos')}>
                <option value="todos">Todos los estados</option>
                {ESTADOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>

            {query.isLoading ? (
              <div className="px-4 py-10 text-center text-sm text-[var(--ink-mute)]">Cargando documentación…</div>
            ) : query.isError ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-[var(--coral)]">{errorMessage(query.error)}</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => void query.refetch()}>Reintentar</Button>
              </div>
            ) : !grupos.length ? (
              <div className="px-4 py-10 text-center text-sm text-[var(--ink-mute)]">No hay documentos para estos filtros.</div>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                {grupos.map((g) => (
                  <div key={g.categoria}>
                    <div className="sticky top-0 z-10 border-b border-[var(--line-2)] bg-[var(--panel)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--mint)]">
                      {catLabel(g.categoria)}
                    </div>
                    {g.ejercicios.map((e) => (
                      <table key={e.ejercicio ?? 'sin'} className="min-w-full border-collapse text-xs">
                        <thead>
                          <tr>
                            <th colSpan={7} className="border-b border-[var(--line)] bg-white/[.015] px-4 py-1.5 text-left font-semibold tabular-nums text-[var(--ink-dim)]">
                              {e.ejercicio ?? 'Sin ejercicio'} <span className="font-normal text-[var(--ink-mute)]">· {e.docs.length}</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.docs.map((d) => {
                            const gm = gmailUrl(d.origen_ref)
                            return (
                              <tr key={d.id} className="hover:bg-white/[.025]">
                                <td className="w-14 border-b border-[var(--line)] px-4 py-2 tabular-nums text-[var(--ink-dim)]">{periodoLabel(d.periodo)}</td>
                                <td className="border-b border-[var(--line)] px-2 py-2">
                                  <div className="font-medium text-[var(--ink)]">{d.titulo}</div>
                                  <div className="text-[11px] text-[var(--ink-mute)]">
                                    {d.tipo}{d.modelo ? ` · Modelo ${d.modelo}` : ''}{d.csv_aeat ? ` · CSV ${d.csv_aeat}` : ''}
                                  </div>
                                </td>
                                <td className="w-24 border-b border-[var(--line)] px-2 py-2 tabular-nums text-[var(--ink-dim)]">{d.fecha_documento ?? '—'}</td>
                                <td className="w-32 border-b border-[var(--line)] px-2 py-2"><EstadoChip estado={d.estado} /></td>
                                <td className="w-16 border-b border-[var(--line)] px-2 py-2 text-right tabular-nums text-[var(--ink-mute)]">{formatBytes(d.bytes)}</td>
                                <td className="w-8 border-b border-[var(--line)] px-1 py-2">
                                  {gm && (
                                    <a href={gm} target="_blank" rel="noopener noreferrer" title={`Origen: ${d.origen_ref?.asunto ?? ''} · ${d.origen_ref?.remitente ?? ''} · ${d.origen_ref?.fecha ?? ''}`}>
                                      <Mail className="h-4 w-4 text-[var(--ink-mute)] hover:text-[var(--mint)]" />
                                    </a>
                                  )}
                                </td>
                                <td className="w-36 border-b border-[var(--line)] px-2 py-2">
                                  <div className="flex justify-end gap-1">
                                    <Button size="sm" variant="ghost" title="Ver" onClick={() => void abrir(d, false)}><Eye className="h-4 w-4" /></Button>
                                    <Button size="sm" variant="ghost" title="Descargar original" onClick={() => void abrir(d, true)}><Download className="h-4 w-4" /></Button>
                                    <Button size="sm" variant="ghost" title="Editar" onClick={() => setEditando(d)}><Pencil className="h-4 w-4" /></Button>
                                    <Button size="sm" variant="ghost" title="Eliminar" onClick={() => void eliminar(d)}><Trash2 className="h-4 w-4" /></Button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {subiendo && (
        <Modal onClose={() => setSubiendo(false)} size="xl" ariaLabel="Subir documento">
          <FormularioDocumento
            inicial={{ ...VACIO, categoria: categoria === 'todas' ? 'otros' : categoria }}
            conArchivo
            enviando={subir.isPending}
            onCancel={() => setSubiendo(false)}
            onSubmit={(datos, file) => {
              if (!file) return
              subir.mutate({ file, datos }, {
                onSuccess: () => { toast({ title: 'Documento archivado', variant: 'success' }); setSubiendo(false) },
                onError: (e) => toast({ title: 'No se pudo subir', description: errorMessage(e), variant: 'error' }),
              })
            }}
          />
        </Modal>
      )}

      {editando && (
        <Modal onClose={() => setEditando(null)} size="xl" ariaLabel="Editar documento">
          <FormularioDocumento
            inicial={{
              categoria: editando.categoria,
              tipo: editando.tipo,
              modelo: editando.modelo,
              titulo: editando.titulo,
              ejercicio: editando.ejercicio,
              periodo: editando.periodo,
              fecha_documento: editando.fecha_documento,
              estado: editando.estado,
              csv_aeat: editando.csv_aeat,
              justificante: editando.justificante,
              notas: editando.notas,
            }}
            conArchivo={false}
            enviando={editar.isPending}
            onCancel={() => setEditando(null)}
            onSubmit={(cambios) => {
              editar.mutate({ id: editando.id, cambios }, {
                onSuccess: () => { toast({ title: 'Cambios guardados', variant: 'success' }); setEditando(null) },
                onError: (e) => toast({ title: 'No se pudo guardar', description: errorMessage(e), variant: 'error' }),
              })
            }}
          />
        </Modal>
      )}
    </div>
  )
}
