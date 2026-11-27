import { useQuery } from '@tanstack/react-query'
import { Loader2, Percent } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'
import { errorMessage } from '@/shared/lib/errors'
import { euros } from '@/shared/lib/format'

type FilaIva = { tipo: 'VENTA' | 'COMPRA'; iva_pct: number; documentos: number; base: number; cuota: number }

function useResumenIva(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['gestoria', 'resumen-iva', desde, hasta] as const,
    enabled: Boolean(desde && hasta && desde <= hasta),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FilaIva[]> => {
      const { data, error } = await supabase.rpc('gestoria_resumen_iva', { p_desde: desde, p_hasta: hasta })
      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        tipo: r.tipo as FilaIva['tipo'],
        iva_pct: Number(r.iva_pct ?? 0),
        documentos: Number(r.documentos ?? 0),
        base: Number(r.base ?? 0),
        cuota: Number(r.cuota ?? 0),
      }))
    },
  })
}

function Bloque({ titulo, filas }: { titulo: string; filas: FilaIva[] }) {
  const base = filas.reduce((s, f) => s + f.base, 0)
  const cuota = filas.reduce((s, f) => s + f.cuota, 0)
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-[var(--ink-mute)]">
        <tr>
          <th className="py-1">{titulo}</th>
          <th className="py-1 text-right">Docs</th>
          <th className="py-1 text-right">Base</th>
          <th className="py-1 text-right">Cuota</th>
        </tr>
      </thead>
      <tbody className="text-[var(--ink-dim)]">
        {filas.map((f) => (
          <tr key={f.iva_pct} className="border-t border-[var(--line)]">
            <td className="py-1">{f.iva_pct.toLocaleString('es-ES')} %</td>
            <td className="py-1 text-right tabular-nums">{f.documentos}</td>
            <td className="py-1 text-right tabular-nums">{euros(f.base)}</td>
            <td className="py-1 text-right tabular-nums">{euros(f.cuota)}</td>
          </tr>
        ))}
        <tr className="border-t border-[var(--line)] font-semibold text-[var(--ink)]">
          <td className="py-1">Total</td>
          <td />
          <td className="py-1 text-right tabular-nums">{euros(base)}</td>
          <td className="py-1 text-right tabular-nums">{euros(cuota)}</td>
        </tr>
      </tbody>
    </table>
  )
}

export function ResumenIvaPanel({ desde, hasta }: { desde: string; hasta: string }) {
  const query = useResumenIva(desde, hasta)
  const ventas = (query.data ?? []).filter((f) => f.tipo === 'VENTA')
  const compras = (query.data ?? []).filter((f) => f.tipo === 'COMPRA')
  const resultado = ventas.reduce((s, f) => s + f.cuota, 0) - compras.reduce((s, f) => s + f.cuota, 0)

  return (
    <section className="ao-panel space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Percent className="h-4 w-4 text-[var(--mint)]" />
        <h2 className="text-sm font-semibold text-[var(--ink)]">IVA del periodo, para comparar con el modelo 303</h2>
      </div>
      {query.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-[var(--ink-mute)]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando…</div>
      ) : query.error ? (
        <div className="text-xs text-[var(--amber)]">{errorMessage(query.error)}</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Bloque titulo="IVA repercutido (ventas)" filas={ventas} />
            <Bloque titulo="IVA soportado (compras)" filas={compras} />
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-[var(--line)] pt-2 text-xs">
            <span className="text-[var(--ink-mute)]">
              Datos de Holded y compras locales. Sin gastos que no pasan por Holded, rectificativas con el signo de Holded y sin borradores.
            </span>
            <span className="text-sm font-semibold tabular-nums text-[var(--ink)]">
              {resultado >= 0 ? 'A ingresar' : 'A compensar'}: {euros(Math.abs(resultado))}
            </span>
          </div>
        </>
      )}
    </section>
  )
}
