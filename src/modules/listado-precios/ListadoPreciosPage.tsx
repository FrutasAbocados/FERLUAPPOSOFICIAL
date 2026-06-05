import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/auth/useAuth'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import {
  CATALOG_CSS,
  buildPageMarkup,
  countItems,
  emptyBlock,
  emptyCat,
  emptyItem,
  type ListadoDoc,
  type PrecioCat,
} from './lib/catalogo'
import { enviarWhatsApp, exportarPdf } from './lib/exportar'

const EDIT_PW = '2905'
const ADMIN_ROLES = ['admin_full', 'admin_op']

function useListado() {
  return useQuery({
    queryKey: ['listado-precios'] as const,
    queryFn: async (): Promise<ListadoDoc> => {
      const { data, error } = await supabase
        .from('listado_precios')
        .select('vigencia, data')
        .eq('id', 1)
        .single()
      if (error) throw error
      return {
        vigencia: String(data?.vigencia ?? ''),
        data: (data?.data ?? []) as PrecioCat[],
      }
    },
    staleTime: 60_000,
  })
}

// ── Botón de acción reutilizable del topbar ──
function ActionBtn({
  onClick,
  icon: Icon,
  label,
  busy,
  primary,
  disabled,
}: {
  onClick: () => void
  icon: React.ComponentType<{ className?: string; size?: number }>
  label: string
  busy?: boolean
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 36,
        padding: '0 14px',
        borderRadius: 'var(--radius, 10px)',
        border: primary ? 'none' : '1px solid var(--line)',
        background: primary ? 'oklch(62% .15 150)' : 'rgba(255,255,255,.03)',
        color: primary ? '#06140d' : 'var(--ink)',
        fontWeight: 600,
        fontSize: 13,
        cursor: busy || disabled ? 'default' : 'pointer',
        opacity: busy || disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
      {label}
    </button>
  )
}

// ── Input compacto del editor ──
function EditInput({
  value,
  onChange,
  placeholder,
  width,
  align,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  width?: number | string
  align?: 'left' | 'right'
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: width ?? '100%',
        background: 'rgba(255,255,255,.04)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        color: 'var(--ink)',
        font: 'inherit',
        fontSize: 13,
        padding: '6px 9px',
        textAlign: align ?? 'left',
      }}
    />
  )
}

export function ListadoPreciosPage() {
  const { profile } = useAuth()
  const isAdmin = !!profile && ADMIN_ROLES.includes(profile.role)
  const { data: doc, isLoading, isError, refetch } = useListado()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ListadoDoc | null>(null)
  const [saving, setSaving] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [waBusy, setWaBusy] = useState(false)

  // Inyecta el CSS de marca una sola vez.
  useEffect(() => {
    const id = 'catalogo-precios-css'
    if (document.getElementById(id)) return
    const el = document.createElement('style')
    el.id = id
    el.textContent = CATALOG_CSS
    document.head.appendChild(el)
  }, [])

  const view = editing && draft ? draft : doc

  const html = useMemo(() => (view ? buildPageMarkup(view) : ''), [view])

  function startEdit() {
    if (!doc) return
    const pw = window.prompt('Introduce la contraseña para modificar el listado de precios:')
    if (pw === null) return
    if (pw !== EDIT_PW) {
      toast({ variant: 'error', title: 'Contraseña incorrecta', description: 'No se puede modificar el listado.' })
      return
    }
    setDraft(structuredClone(doc))
    setEditing(true)
  }

  async function cancelEdit() {
    if (draft && JSON.stringify(draft) !== JSON.stringify(doc)) {
      const ok = await confirm({
        title: '¿Salir sin guardar?',
        description: 'Se perderán los cambios no guardados.',
        confirmLabel: 'Salir',
        variant: 'danger',
      })
      if (!ok) return
    }
    setEditing(false)
    setDraft(null)
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('listado_precios')
        .update({ vigencia: draft.vigencia.trim() || 'Sin fecha', data: draft.data, updated_at: new Date().toISOString() })
        .eq('id', 1)
      if (error) throw error
      toast({ variant: 'success', title: 'Listado guardado', description: `${countItems(draft.data)} productos actualizados.` })
      setEditing(false)
      setDraft(null)
      await refetch()
    } catch (e) {
      toast({ variant: 'error', title: 'No se pudo guardar', description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function doPdf() {
    if (!view) return
    setPdfBusy(true)
    try {
      await exportarPdf(view)
      toast({ variant: 'success', title: 'PDF generado', description: 'Se ha descargado el catálogo.' })
    } catch (e) {
      toast({ variant: 'error', title: 'Error generando PDF', description: (e as Error).message })
    } finally {
      setPdfBusy(false)
    }
  }

  async function doWhatsApp() {
    if (!view) return
    setWaBusy(true)
    try {
      const res = await enviarWhatsApp(view)
      if (res === 'shared') {
        toast({ variant: 'success', title: 'Compartiendo por WhatsApp', description: 'Elige el contacto en el selector.' })
      } else {
        toast({ variant: 'success', title: 'PDF descargado', description: 'Adjúntalo en el chat de WhatsApp Web.' })
      }
    } catch (e) {
      toast({ variant: 'error', title: 'Error al enviar', description: (e as Error).message })
    } finally {
      setWaBusy(false)
    }
  }

  // ── Mutadores del borrador ──
  function patch(mut: (d: ListadoDoc) => void) {
    setDraft((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      mut(next)
      return next
    })
  }

  const total = view ? countItems(view.data) : 0

  return (
    <div className="flex flex-col h-full min-w-0">
      <PageTopbar
        breadcrumb="Comercial"
        title="Listado de Precios"
        subtitle={view ? `${view.vigencia} · ${total} productos` : 'Catálogo mayorista'}
        actions={
          editing ? (
            <>
              <ActionBtn onClick={cancelEdit} icon={X} label="Cancelar" />
              <ActionBtn onClick={save} icon={Save} label="Guardar" busy={saving} primary />
            </>
          ) : (
            <>
              {isAdmin && <ActionBtn onClick={startEdit} icon={Pencil} label="Modificar" />}
              <ActionBtn onClick={doPdf} icon={FileText} label="Exportar PDF" busy={pdfBusy} />
              <ActionBtn onClick={doWhatsApp} icon={Download} label="Enviar WhatsApp" busy={waBusy} primary />
            </>
          )
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 60px' }}>
        {isLoading && <p style={{ color: 'var(--ink-dim)' }}>Cargando catálogo…</p>}
        {isError && (
          <p style={{ color: 'var(--red, #e5484d)' }}>
            No se pudo cargar el listado. <button onClick={() => refetch()} style={{ textDecoration: 'underline' }}>Reintentar</button>
          </p>
        )}

        {!editing && view && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 980 }} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )}

        {editing && draft && (
          <Editor
            draft={draft}
            onVigencia={(v) => patch((d) => { d.vigencia = v })}
            patch={patch}
          />
        )}
      </div>
    </div>
  )
}

// ────────────────────────────── EDITOR ──────────────────────────────
function Editor({
  draft,
  onVigencia,
  patch,
}: {
  draft: ListadoDoc
  onVigencia: (v: string) => void
  patch: (mut: (d: ListadoDoc) => void) => void
}) {
  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,.02)',
    border: '1px solid var(--line)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
  }
  const label: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-mute)', marginBottom: 6 }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={label}>Vigencia (mes/año)</div>
          <EditInput value={draft.vigencia} onChange={onVigencia} width={220} placeholder="Mayo 2026" />
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginLeft: 'auto' }}>
          Toca cualquier campo para editarlo. Los cambios se guardan al pulsar «Guardar».
        </div>
      </div>

      {draft.data.map((cat, ci) => (
        <div key={cat.id} style={card}>
          {/* Cabecera categoría */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <EditInput value={cat.icono} onChange={(v) => patch((d) => { d.data[ci].icono = v })} width={52} align="left" />
            <EditInput value={cat.titulo} onChange={(v) => patch((d) => { d.data[ci].titulo = v })} />
            <button
              type="button"
              title="Eliminar categoría"
              onClick={() => patch((d) => { d.data.splice(ci, 1) })}
              style={delBtn}
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Bloques */}
          {cat.blocks.map((blk, bi) => (
            <div key={blk.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <EditInput value={blk.icono} onChange={(v) => patch((d) => { d.data[ci].blocks[bi].icono = v })} width={52} />
                <EditInput value={blk.titulo} onChange={(v) => patch((d) => { d.data[ci].blocks[bi].titulo = v })} />
                <span style={{ fontSize: 12, color: 'var(--ink-mute)', whiteSpace: 'nowrap' }}>{blk.items.length} prod.</span>
                <button
                  type="button"
                  title="Eliminar bloque"
                  onClick={() => patch((d) => { d.data[ci].blocks.splice(bi, 1) })}
                  style={delBtn}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Cabecera columnas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 130px 34px', gap: 8, padding: '0 2px 6px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-mute)' }}>
                <span>Producto</span><span>Formato</span><span>Precio</span><span />
              </div>

              {blk.items.map((it, ii) => (
                <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 130px 34px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <EditInput value={it.producto} onChange={(v) => patch((d) => { d.data[ci].blocks[bi].items[ii].producto = v })} />
                  <EditInput value={it.formato} onChange={(v) => patch((d) => { d.data[ci].blocks[bi].items[ii].formato = v })} />
                  <EditInput value={it.precio} onChange={(v) => patch((d) => { d.data[ci].blocks[bi].items[ii].precio = v })} align="right" />
                  <button
                    type="button"
                    title="Eliminar fila"
                    onClick={() => patch((d) => { d.data[ci].blocks[bi].items.splice(ii, 1) })}
                    style={delBtn}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => patch((d) => { d.data[ci].blocks[bi].items.push(emptyItem()) })}
                style={addBtn}
              >
                <Plus size={14} /> Añadir producto
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => patch((d) => { d.data[ci].blocks.push(emptyBlock()) })}
            style={{ ...addBtn, borderColor: 'var(--line)' }}
          >
            <Plus size={14} /> Añadir bloque
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => patch((d) => { d.data.push(emptyCat()) })}
        style={{ ...addBtn, height: 40, fontSize: 13, marginTop: 4 }}
      >
        <Plus size={15} /> Añadir categoría
      </button>
    </div>
  )
}

const delBtn: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 30,
  height: 30,
  flexShrink: 0,
  borderRadius: 8,
  border: '1px solid var(--line)',
  background: 'rgba(229,72,77,.08)',
  color: 'var(--red, #e5484d)',
  cursor: 'pointer',
}

const addBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px dashed var(--line)',
  background: 'transparent',
  color: 'var(--ink-dim)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}
