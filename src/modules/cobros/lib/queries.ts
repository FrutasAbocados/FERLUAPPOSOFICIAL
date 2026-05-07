import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type {
  Cliente,
  ClienteResumen,
  FormaPago,
  MetodoCobro,
  Movimiento,
  TipoMovimiento,
} from './types'
import { calcVencimiento, estadoMovimiento, importePendiente, isoDate, peorEstado } from './utils'

const KEYS = {
  clientes: ['cobros', 'clientes'] as const,
  movimientos: ['cobros', 'movimientos'] as const,
  cliente: (id: string) => ['cobros', 'cliente', id] as const,
  movimientosCliente: (id: string) => ['cobros', 'movimientos', 'cliente', id] as const,
}

// ─── Clientes ───────────────────────────────────────────────────

export function useClientes() {
  return useQuery({
    queryKey: KEYS.clientes,
    queryFn: async (): Promise<Cliente[]> => {
      const { data, error } = await supabase
        .from('cobros_clientes')
        .select('*')
        .order('nombre', { ascending: true })
      if (error) throw error
      return (data ?? []) as Cliente[]
    },
  })
}

export function useMovimientos() {
  return useQuery({
    queryKey: KEYS.movimientos,
    queryFn: async (): Promise<Movimiento[]> => {
      const { data, error } = await supabase
        .from('cobros_movimientos')
        .select('*')
        .order('fecha_factura', { ascending: false })
      if (error) throw error
      return (data ?? []) as Movimiento[]
    },
  })
}

export function useMovimientosCliente(clienteId: string | null | undefined) {
  return useQuery({
    queryKey: KEYS.movimientosCliente(clienteId ?? '-'),
    enabled: !!clienteId,
    queryFn: async (): Promise<Movimiento[]> => {
      const { data, error } = await supabase
        .from('cobros_movimientos')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('fecha_factura', { ascending: false })
      if (error) throw error
      return (data ?? []) as Movimiento[]
    },
  })
}

// ─── Resúmenes derivados (cliente -> totales) ───────────────────

export function useClientesResumen() {
  const clientes = useClientes()
  const movs = useMovimientos()

  const resumen: ClienteResumen[] = (() => {
    if (!clientes.data || !movs.data) return []
    const byCliente = new Map<string, Movimiento[]>()
    for (const m of movs.data) {
      const arr = byCliente.get(m.cliente_id) ?? []
      arr.push(m)
      byCliente.set(m.cliente_id, arr)
    }
    return clientes.data.map((c) => {
      const ms = byCliente.get(c.id) ?? []
      const pend = ms.filter((m) => !m.pagado)
      const total_pendiente = pend.reduce((s, m) => s + importePendiente(m), 0)
      const total_vencido = pend
        .filter((m) => estadoMovimiento(m) === 'Vencido')
        .reduce((s, m) => s + importePendiente(m), 0)
      const total_proximo = pend
        .filter((m) => estadoMovimiento(m) === 'Próximo')
        .reduce((s, m) => s + importePendiente(m), 0)
      const total_pizarra = pend
        .filter((m) => m.tipo === 'Pizarra')
        .reduce((s, m) => s + importePendiente(m), 0)
      const estado = peorEstado(pend.map((m) => estadoMovimiento(m)))
      return {
        ...c,
        total_pendiente,
        total_vencido,
        total_proximo,
        total_pizarra,
        estado,
        num_pendientes: pend.length,
      }
    })
  })()

  return { ...clientes, movs, resumen }
}

// ─── Mutaciones ─────────────────────────────────────────────────

type UpsertClienteInput = {
  id?: string
  nombre: string
  forma_pago: FormaPago
  metodo_cobro_preferido?: MetodoCobro | null
  notas?: string | null
  activo?: boolean
}

export function useUpsertCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpsertClienteInput): Promise<Cliente> => {
      const { data, error } = await supabase
        .from('cobros_clientes')
        .upsert(
          {
            id: input.id,
            nombre: input.nombre.trim(),
            forma_pago: input.forma_pago,
            metodo_cobro_preferido: input.metodo_cobro_preferido ?? null,
            notas: input.notas ?? null,
            activo: input.activo ?? true,
          },
          { onConflict: 'nombre' },
        )
        .select()
        .single()
      if (error) throw error
      return data as Cliente
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.clientes })
    },
  })
}

export function useDeleteCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cobros_clientes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobros'] })
    },
  })
}

type CreateMovimientoInput = {
  cliente_id: string
  forma_pago_cliente: FormaPago
  tipo: TipoMovimiento
  numero_factura?: string | null
  fecha_factura: Date | string
  importe: number
  fecha_vencimiento?: Date | string
  concepto?: string | null
  pagado?: boolean
  fecha_cobro?: Date | string | null
  importe_cobrado?: number | null
  metodo_cobro?: MetodoCobro | null
}

export function useCreateMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateMovimientoInput): Promise<Movimiento> => {
      const fechaFactura =
        input.fecha_factura instanceof Date
          ? isoDate(input.fecha_factura)
          : input.fecha_factura
      const fechaVenc =
        input.fecha_vencimiento instanceof Date
          ? isoDate(input.fecha_vencimiento)
          : (input.fecha_vencimiento ??
            isoDate(calcVencimiento(new Date(fechaFactura), input.forma_pago_cliente)))

      const { data, error } = await supabase
        .from('cobros_movimientos')
        .insert({
          cliente_id: input.cliente_id,
          tipo: input.tipo,
          numero_factura: input.numero_factura ?? null,
          fecha_factura: fechaFactura,
          importe: input.importe,
          pagado: input.pagado ?? false,
          fecha_cobro:
            input.fecha_cobro instanceof Date
              ? isoDate(input.fecha_cobro)
              : (input.fecha_cobro ?? null),
          importe_cobrado: input.importe_cobrado ?? null,
          metodo_cobro: input.metodo_cobro ?? null,
          fecha_vencimiento: fechaVenc,
          concepto: input.concepto ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data as Movimiento
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobros'] })
    },
  })
}

type CobrarInput = {
  id: string
  fecha_cobro: Date | string
  importe_cobrado: number
  metodo_cobro: MetodoCobro
  importe_total: number // para saber si es cobro completo o parcial
}

export function useCobrar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CobrarInput) => {
      const fc = input.fecha_cobro instanceof Date ? isoDate(input.fecha_cobro) : input.fecha_cobro
      const completo = Math.abs(input.importe_cobrado - input.importe_total) < 0.005
      const { error } = await supabase
        .from('cobros_movimientos')
        .update({
          pagado: completo,
          fecha_cobro: fc,
          importe_cobrado: input.importe_cobrado,
          metodo_cobro: input.metodo_cobro,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobros'] })
    },
  })
}

export function useDeleteMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cobros_movimientos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobros'] })
    },
  })
}

// ─── Importador en bloque ───────────────────────────────────────

export type ImportPayload = {
  clientes: UpsertClienteInput[]
  movimientos: Array<
    CreateMovimientoInput & { _cliente_nombre: string }
  >
}

export type ImportResult = {
  clientesUpserted: number
  movimientosNuevos: number
  movimientosDuplicados: number
  errores: string[]
}

export function useImportarExcel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ImportPayload): Promise<ImportResult> => {
      const errores: string[] = []
      let clientesUpserted = 0
      let movimientosNuevos = 0
      let movimientosDuplicados = 0

      // 1. Upsert clientes en bloque
      if (payload.clientes.length > 0) {
        const { data, error } = await supabase
          .from('cobros_clientes')
          .upsert(
            payload.clientes.map((c) => ({
              nombre: c.nombre.trim(),
              forma_pago: c.forma_pago,
              metodo_cobro_preferido: c.metodo_cobro_preferido ?? null,
              notas: c.notas ?? null,
              activo: c.activo ?? true,
            })),
            { onConflict: 'nombre' },
          )
          .select('id, nombre')
        if (error) {
          errores.push(`Clientes: ${error.message}`)
        } else {
          clientesUpserted = data?.length ?? 0
        }
      }

      // 2. Mapa nombre -> id (necesitamos releer porque upsert no devuelve los pre-existentes)
      const { data: clientesAll, error: cErr } = await supabase
        .from('cobros_clientes')
        .select('id, nombre')
      if (cErr) {
        errores.push(`Releer clientes: ${cErr.message}`)
        return { clientesUpserted, movimientosNuevos, movimientosDuplicados, errores }
      }
      const nombre2id = new Map<string, string>()
      for (const c of clientesAll ?? []) nombre2id.set((c as Cliente).nombre, (c as Cliente).id)

      // 3. Insertar movimientos en lotes (la UNIQUE constraint maneja duplicados)
      const rows = payload.movimientos
        .map((m) => {
          const id = nombre2id.get(m._cliente_nombre.trim())
          if (!id) {
            errores.push(`Cliente desconocido: ${m._cliente_nombre}`)
            return null
          }
          const fechaFactura =
            m.fecha_factura instanceof Date ? isoDate(m.fecha_factura) : m.fecha_factura
          const fechaVenc =
            m.fecha_vencimiento instanceof Date
              ? isoDate(m.fecha_vencimiento)
              : (m.fecha_vencimiento ??
                isoDate(calcVencimiento(new Date(fechaFactura), m.forma_pago_cliente)))
          return {
            cliente_id: id,
            tipo: m.tipo,
            numero_factura: m.numero_factura ?? null,
            fecha_factura: fechaFactura,
            importe: m.importe,
            pagado: m.pagado ?? false,
            fecha_cobro:
              m.fecha_cobro instanceof Date
                ? isoDate(m.fecha_cobro)
                : (m.fecha_cobro ?? null),
            importe_cobrado: m.importe_cobrado ?? null,
            metodo_cobro: m.metodo_cobro ?? null,
            fecha_vencimiento: fechaVenc,
            concepto: m.concepto ?? null,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      // Lotes de 500 con onConflict para idempotencia
      const BATCH = 500
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const { data, error } = await supabase
          .from('cobros_movimientos')
          .upsert(batch, {
            onConflict: 'cliente_id,numero_factura,fecha_factura',
            ignoreDuplicates: true,
          })
          .select('id')
        if (error) {
          errores.push(`Lote ${i}: ${error.message}`)
          continue
        }
        const inserted = data?.length ?? 0
        movimientosNuevos += inserted
        movimientosDuplicados += batch.length - inserted
      }

      return { clientesUpserted, movimientosNuevos, movimientosDuplicados, errores }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobros'] })
    },
  })
}

// ─── Restaurar backup JSON (idempotente por id) ──────────────────
// El JSON exportado por exportJSON contiene los uuids originales. Aquí
// preservamos esos ids al insertar para que re-importar el mismo backup
// no duplique movimientos: pre-fetch de los ids existentes + filtro.
// Los clientes se siguen upserteando por nombre (los ids del backup pueden
// no coincidir con la BBDD destino si fue creada en otro entorno).
export interface BackupCliente {
  id: string
  nombre: string
  forma_pago: FormaPago
  metodo_cobro_preferido: MetodoCobro | null
  notas: string | null
  activo: boolean
}
export interface BackupMovimiento {
  id: string
  cliente_id: string
  tipo: TipoMovimiento
  numero_factura: string | null
  fecha_factura: string
  importe: number
  pagado: boolean
  fecha_cobro: string | null
  importe_cobrado: number | null
  metodo_cobro: MetodoCobro | null
  fecha_vencimiento: string
  concepto: string | null
}
export interface RestoreResult {
  clientesUpserted: number
  movimientosNuevos: number
  movimientosDuplicados: number
  movimientosHuerfanos: number  // backup hace referencia a un cliente que no existe ni en backup ni en BBDD
  errores: string[]
}

export function useRestaurarBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      clientes: BackupCliente[]
      movimientos: BackupMovimiento[]
    }): Promise<RestoreResult> => {
      const errores: string[] = []
      let clientesUpserted = 0
      let movimientosHuerfanos = 0

      // 1) Upsert clientes por nombre (preserva los ya existentes en destino).
      if (input.clientes.length > 0) {
        const { data, error } = await supabase
          .from('cobros_clientes')
          .upsert(
            input.clientes.map((c) => ({
              nombre: c.nombre.trim(),
              forma_pago: c.forma_pago,
              metodo_cobro_preferido: c.metodo_cobro_preferido,
              notas: c.notas,
              activo: c.activo,
            })),
            { onConflict: 'nombre' },
          )
          .select('id')
        if (error) errores.push(`Clientes: ${error.message}`)
        else clientesUpserted = data?.length ?? 0
      }

      // 2) Mapas: backup_cliente_id → nombre y nombre → live_cliente_id.
      const backupIdToName = new Map<string, string>()
      for (const c of input.clientes) backupIdToName.set(c.id, c.nombre.trim())

      const { data: liveClientes, error: cErr } = await supabase
        .from('cobros_clientes')
        .select('id, nombre')
      if (cErr) {
        errores.push(`Releer clientes: ${cErr.message}`)
        return { clientesUpserted, movimientosNuevos: 0, movimientosDuplicados: 0, movimientosHuerfanos: 0, errores }
      }
      const nameToLiveId = new Map<string, string>()
      for (const c of liveClientes ?? []) nameToLiveId.set((c as Cliente).nombre, (c as Cliente).id)

      // 3) Pre-check de ids ya existentes (idempotencia estricta).
      const backupIds = input.movimientos.map((m) => m.id).filter(Boolean)
      const existing = new Set<string>()
      const CHUNK = 500
      for (let i = 0; i < backupIds.length; i += CHUNK) {
        const slice = backupIds.slice(i, i + CHUNK)
        const { data, error } = await supabase
          .from('cobros_movimientos')
          .select('id')
          .in('id', slice)
        if (error) {
          errores.push(`Lookup ids: ${error.message}`)
          continue
        }
        for (const row of data ?? []) existing.add((row as { id: string }).id)
      }

      // 4) Construir filas a insertar (con id explícito), saltando duplicados.
      const toInsert: Record<string, unknown>[] = []
      let duplicados = 0
      for (const m of input.movimientos) {
        if (existing.has(m.id)) { duplicados++; continue }
        const liveClienteId = nameToLiveId.get(backupIdToName.get(m.cliente_id) ?? '') ?? null
        if (!liveClienteId) {
          movimientosHuerfanos++
          errores.push(`Movimiento ${m.id} apunta a cliente desconocido`)
          continue
        }
        toInsert.push({
          id: m.id,                        // preservar uuid original — clave de idempotencia
          cliente_id: liveClienteId,
          tipo: m.tipo,
          numero_factura: m.numero_factura,
          fecha_factura: m.fecha_factura,
          importe: m.importe,
          pagado: m.pagado,
          fecha_cobro: m.fecha_cobro,
          importe_cobrado: m.importe_cobrado,
          metodo_cobro: m.metodo_cobro,
          fecha_vencimiento: m.fecha_vencimiento,
          concepto: m.concepto,
        })
      }

      // 5) Insert por lotes (sin upsert: ya filtramos duplicados arriba).
      let movimientosNuevos = 0
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const batch = toInsert.slice(i, i + CHUNK)
        const { data, error } = await supabase
          .from('cobros_movimientos')
          .insert(batch)
          .select('id')
        if (error) { errores.push(`Lote ${i}: ${error.message}`); continue }
        movimientosNuevos += data?.length ?? 0
      }

      return {
        clientesUpserted,
        movimientosNuevos,
        movimientosDuplicados: duplicados,
        movimientosHuerfanos,
        errores,
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobros'] })
    },
  })
}

// ─── Backups automáticos ─────────────────────────────────────────

export interface BackupLog {
  id: string
  fecha: string
  storage_path: string
  size_bytes: number | null
  num_clientes: number | null
  num_movimientos: number | null
  ok: boolean
  error_msg: string | null
  trigger_source: string
  created_at: string
}

const BACKUPS_KEY = ['cobros', 'backups'] as const

export function useBackupsList(limit = 30) {
  return useQuery({
    queryKey: [...BACKUPS_KEY, limit] as const,
    queryFn: async (): Promise<BackupLog[]> => {
      const { data, error } = await supabase.rpc('cobros_backups_lista', { p_limit: limit })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id:               String(r.id ?? ''),
        fecha:            String(r.fecha ?? ''),
        storage_path:     String(r.storage_path ?? ''),
        size_bytes:       r.size_bytes == null ? null : Number(r.size_bytes),
        num_clientes:     r.num_clientes == null ? null : Number(r.num_clientes),
        num_movimientos:  r.num_movimientos == null ? null : Number(r.num_movimientos),
        ok:               !!r.ok,
        error_msg:        r.error_msg == null ? null : String(r.error_msg),
        trigger_source:   String(r.trigger_source ?? ''),
        created_at:       String(r.created_at ?? ''),
      }))
    },
  })
}

export function useGenerarBackupAhora() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cobros-backup-diario', {
        body: { trigger: 'manual' },
      })
      if (error) throw error
      return data as { ok: boolean; storage_path?: string; error?: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BACKUPS_KEY })
    },
  })
}

export async function descargarBackup(storagePath: string): Promise<void> {
  const { data, error } = await supabase.storage
    .from('cobros-backups')
    .createSignedUrl(storagePath, 60 * 5)  // 5 min
  if (error) throw error
  if (!data?.signedUrl) throw new Error('Sin URL firmada')
  const a = document.createElement('a')
  a.href = data.signedUrl
  a.download = storagePath.split('/').pop() ?? 'backup.json'
  a.click()
}
