import { useState } from 'react'
import { BadgeCheck, Building2, Loader2, Plus, Save, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/shared/auth/useAuth'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { errorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import {
  type CanalEntregaFiscal,
  type ClienteFiscal,
  type ClienteFiscalPatch,
  type EstadoValidacionFiscal,
  type ModalidadFiscal,
  type TipoIdentificacionFiscal,
  useClientesFiscales,
  useCrearClienteFiscal,
  useSetClienteFiscal,
  useValidarClienteFiscal,
} from '../lib/hooks'

const TIPOS_ID: Array<{ value: TipoIdentificacionFiscal; label: string }> = [
  { value: 'NIF', label: 'NIF' },
  { value: 'NIE', label: 'NIE' },
  { value: 'VAT_UE', label: 'VAT UE' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'OTRO', label: 'Otro' },
]

const CANALES: Array<{ value: CanalEntregaFiscal; label: string }> = [
  { value: 'pendiente', label: 'Sin decidir' },
  { value: 'email', label: 'Email' },
  { value: 'descarga', label: 'Descarga' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'otro', label: 'Otro' },
]

const MODALIDADES: Array<{ value: ModalidadFiscal; label: string }> = [
  { value: 'factura_inmediata', label: 'Factura inmediata' },
  { value: 'albaran', label: 'Albarán' },
  { value: 'mixta', label: 'Mixta' },
  { value: 'sin_factura', label: 'Sin factura' },
]

const ESTADOS: Record<EstadoValidacionFiscal, { label: string; className: string }> = {
  incompleto: { label: 'INCOMPLETO', className: 'border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]' },
  pendiente_revision: { label: 'PENDIENTE DE REVISAR', className: 'ao-chip-amber' },
  validado: { label: 'VALIDADO', className: 'border-[var(--mint)]/40 bg-[var(--mint-glow)] text-[var(--mint)]' },
  inactivo: { label: 'INACTIVO', className: 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-ink-3)]' },
}

type Form = {
  nombre_fiscal: string
  nombre_comercial: string
  tipo_identificacion: TipoIdentificacionFiscal
  numero_identificacion: string
  direccion: string
  codigo_postal: string
  poblacion: string
  provincia: string
  pais_codigo: string
  email_facturacion: string
  canal_entrega: CanalEntregaFiscal
  modalidad_habitual: ModalidadFiscal
  activo: boolean
}

function fromCliente(cliente: ClienteFiscal): Form {
  return {
    nombre_fiscal: cliente.nombre_fiscal,
    nombre_comercial: cliente.nombre_comercial ?? '',
    tipo_identificacion: cliente.tipo_identificacion,
    numero_identificacion: cliente.numero_identificacion ?? '',
    direccion: cliente.direccion ?? '',
    codigo_postal: cliente.codigo_postal ?? '',
    poblacion: cliente.poblacion ?? '',
    provincia: cliente.provincia ?? '',
    pais_codigo: cliente.pais_codigo,
    email_facturacion: cliente.email_facturacion ?? '',
    canal_entrega: cliente.canal_entrega,
    modalidad_habitual: cliente.modalidad_habitual,
    activo: cliente.activo,
  }
}

function missingFields(form: Form): string[] {
  if (!form.activo) return []
  const missing: string[] = []
  if (!form.nombre_fiscal.trim()) missing.push('razón social')
  if (!form.numero_identificacion.trim()) missing.push('identificación')
  if (!form.direccion.trim()) missing.push('dirección')
  if (!form.codigo_postal.trim()) missing.push('CP')
  if (!form.poblacion.trim()) missing.push('población')
  if (form.pais_codigo.trim().toUpperCase() === 'ES' && !form.provincia.trim()) missing.push('provincia')
  return missing
}

export function FiscalCard({ name, contactIds }: { name: string; contactIds: string[] }) {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin_full' || profile?.role === 'admin_op'
  const fiscales = useClientesFiscales(contactIds)
  const crear = useCrearClienteFiscal()
  const rows = fiscales.data ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (contactIds.length === 0) {
    return <EmptyCard message="Este cliente no tiene contacto Holded asociado; vincúlalo antes de crear su ficha fiscal." />
  }

  if (fiscales.isLoading) {
    return <div className="ao-card h-44 animate-pulse bg-[var(--color-surface-2)]" />
  }

  if (fiscales.error) {
    return <EmptyCard message={`No se pudo cargar la ficha fiscal: ${errorMessage(fiscales.error)}`} tone="error" />
  }

  if (rows.length === 0) {
    return (
      <div className="ao-card flex items-center justify-between gap-3 p-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
            <Building2 className="h-4 w-4 text-[var(--color-primary)]" />
            Sin ficha fiscal propia
          </div>
          <p className="mt-1 text-xs text-[var(--color-ink-3)]">Puedes crearla desde el contacto Holded ya vinculado.</p>
        </div>
        {canManage && (
          <Button
            size="sm"
            disabled={crear.isPending}
            onClick={async () => {
              try {
                await crear.mutateAsync({ holded_contact_id: contactIds[0], nombre_fiscal: name })
                toast({ title: 'Ficha fiscal creada', variant: 'success' })
              } catch (error) {
                toast({ title: 'No se pudo crear', description: errorMessage(error), variant: 'error' })
              }
            }}
          >
            {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crear ficha
          </Button>
        )}
      </div>
    )
  }

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0]

  return (
    <div className="space-y-2">
      {rows.length > 1 && (
        <label className="flex items-center gap-2 px-1 text-xs text-[var(--color-ink-3)]">
          <span>Identidad fiscal:</span>
          <select
            value={selected.id}
            onChange={(event) => setSelectedId(event.target.value)}
            className="h-8 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-ink)]"
          >
            {rows.map((row) => <option key={row.id} value={row.id}>{row.nombre_fiscal}</option>)}
          </select>
        </label>
      )}
      <FiscalCardInner key={`${selected.id}-${selected.updated_at}`} cliente={selected} canManage={canManage} />
    </div>
  )
}

function FiscalCardInner({ cliente, canManage }: { cliente: ClienteFiscal; canManage: boolean }) {
  const guardar = useSetClienteFiscal()
  const validar = useValidarClienteFiscal()
  const [form, setForm] = useState<Form>(() => fromCliente(cliente))
  const [dirty, setDirty] = useState(false)
  const missing = missingFields(form)
  const estado = ESTADOS[cliente.estado_validacion]

  const update = (patch: Partial<Form>) => {
    setForm((current) => ({ ...current, ...patch }))
    setDirty(true)
  }

  const save = async () => {
    if (!form.nombre_fiscal.trim()) {
      toast({ title: 'La razón social es obligatoria', variant: 'error' })
      return
    }
    const country = form.pais_codigo.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(country)) {
      toast({ title: 'País inválido', description: 'Usa el código de dos letras, por ejemplo ES.', variant: 'error' })
      return
    }
    if (form.email_facturacion.trim() && !/^\S+@\S+\.\S+$/.test(form.email_facturacion.trim())) {
      toast({ title: 'Email de facturación inválido', variant: 'error' })
      return
    }

    const patch: ClienteFiscalPatch = {
      nombre_fiscal: form.nombre_fiscal.trim(),
      nombre_comercial: form.nombre_comercial.trim() || null,
      tipo_identificacion: form.tipo_identificacion,
      numero_identificacion: form.numero_identificacion.trim().toUpperCase() || null,
      direccion: form.direccion.trim() || null,
      codigo_postal: form.codigo_postal.trim() || null,
      poblacion: form.poblacion.trim() || null,
      provincia: form.provincia.trim() || null,
      pais_codigo: country,
      email_facturacion: form.email_facturacion.trim().toLowerCase() || null,
      canal_entrega: form.canal_entrega,
      modalidad_habitual: form.modalidad_habitual,
      activo: form.activo,
    }

    try {
      await guardar.mutateAsync({ id: cliente.id, patch })
      setDirty(false)
      toast({ title: 'Datos fiscales guardados', description: 'Cualquier cambio fiscal requiere una nueva validación.', variant: 'success' })
    } catch (error) {
      toast({ title: 'No se pudo guardar', description: errorMessage(error), variant: 'error' })
    }
  }

  const validate = async () => {
    try {
      await validar.mutateAsync(cliente.id)
      toast({ title: 'Ficha fiscal validada', variant: 'success' })
    } catch (error) {
      toast({ title: 'No se pudo validar', description: errorMessage(error), variant: 'error' })
    }
  }

  const disabled = !canManage || guardar.isPending || validar.isPending

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Ficha fiscal</h3>
          <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold', estado.className)}>{estado.label}</span>
          {dirty && <span className="text-[10px] font-medium text-[var(--amber)]">CAMBIOS SIN GUARDAR</span>}
        </div>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty || disabled} onClick={save}>
              {guardar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              Guardar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={dirty || cliente.estado_validacion !== 'pendiente_revision' || disabled}
              onClick={validate}
              className="border border-[var(--mint)]/40 text-[var(--mint)]"
            >
              {validar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1 h-3.5 w-3.5" />}
              Validar
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-6">
        <Field className="md:col-span-3" label="Razón social *">
          <Input value={form.nombre_fiscal} disabled={disabled} onChange={(event) => update({ nombre_fiscal: event.target.value })} />
        </Field>
        <Field className="md:col-span-3" label="Nombre comercial">
          <Input value={form.nombre_comercial} disabled={disabled} onChange={(event) => update({ nombre_comercial: event.target.value })} />
        </Field>

        <Field className="md:col-span-2" label="Tipo identificación">
          <Select value={form.tipo_identificacion} disabled={disabled} onChange={(value) => update({ tipo_identificacion: value as TipoIdentificacionFiscal })}>
            {TIPOS_ID.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
        </Field>
        <Field className="md:col-span-2" label="NIF / identificación *">
          <Input value={form.numero_identificacion} disabled={disabled} onChange={(event) => update({ numero_identificacion: event.target.value })} className="font-mono uppercase" />
        </Field>
        <Field className="md:col-span-2" label="País *">
          <Input value={form.pais_codigo} maxLength={2} disabled={disabled} onChange={(event) => update({ pais_codigo: event.target.value.toUpperCase() })} placeholder="ES" className="font-mono uppercase" />
        </Field>

        <Field className="md:col-span-6" label="Dirección fiscal *">
          <Input value={form.direccion} disabled={disabled} onChange={(event) => update({ direccion: event.target.value })} />
        </Field>
        <Field className="md:col-span-2" label="Código postal *">
          <Input value={form.codigo_postal} disabled={disabled} onChange={(event) => update({ codigo_postal: event.target.value })} inputMode="numeric" />
        </Field>
        <Field className="md:col-span-2" label="Población *">
          <Input value={form.poblacion} disabled={disabled} onChange={(event) => update({ poblacion: event.target.value })} />
        </Field>
        <Field className="md:col-span-2" label={form.pais_codigo === 'ES' ? 'Provincia *' : 'Provincia / región'}>
          <Input value={form.provincia} disabled={disabled} onChange={(event) => update({ provincia: event.target.value })} />
        </Field>

        <Field className="md:col-span-3" label="Email de facturación">
          <Input type="email" value={form.email_facturacion} disabled={disabled} onChange={(event) => update({ email_facturacion: event.target.value })} placeholder="facturas@cliente.es" />
        </Field>
        <Field className="md:col-span-3" label="Canal de entrega">
          <Select value={form.canal_entrega} disabled={disabled} onChange={(value) => update({ canal_entrega: value as CanalEntregaFiscal })}>
            {CANALES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
        </Field>
        <Field className="md:col-span-3" label="Modalidad habitual">
          <Select value={form.modalidad_habitual} disabled={disabled} onChange={(value) => update({ modalidad_habitual: value as ModalidadFiscal })}>
            {MODALIDADES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm md:col-span-3">
          <input type="checkbox" checked={form.activo} disabled={disabled} onChange={(event) => update({ activo: event.target.checked })} className="h-4 w-4" />
          <span className="text-[var(--color-ink)]">Cliente fiscal activo</span>
        </label>

        <div className="md:col-span-6">
          {missing.length > 0 ? (
            <p className="text-xs text-[var(--coral)]">Faltan: {missing.join(', ')}. No podrá validarse ni emitir una factura completa.</p>
          ) : cliente.estado_validacion === 'pendiente_revision' ? (
            <p className="text-xs text-[var(--amber)]">Datos completos: un administrador debe revisarlos y pulsar Validar.</p>
          ) : cliente.estado_validacion === 'validado' ? (
            <p className="flex items-center gap-1 text-xs text-[var(--mint)]">
              <BadgeCheck className="h-3.5 w-3.5" />
              Revisado {cliente.revisado_at ? new Date(cliente.revisado_at).toLocaleDateString('es-ES') : ''}. Cualquier cambio fiscal anulará esta validación.
            </p>
          ) : null}
          <p className="mt-1 font-mono text-[9px] text-[var(--color-ink-3)]">Holded legacy: {cliente.holded_contact_id ?? 'sin vínculo'}</p>
        </div>
      </div>
    </div>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Select({ value, onChange, disabled, children }: { value: string; onChange: (value: string) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
    >
      {children}
    </select>
  )
}

function EmptyCard({ message, tone = 'muted' }: { message: string; tone?: 'muted' | 'error' }) {
  return (
    <div className={cn('ao-card p-3 text-sm', tone === 'error' ? 'text-[var(--coral)]' : 'text-[var(--color-ink-3)]')}>
      {message}
    </div>
  )
}
