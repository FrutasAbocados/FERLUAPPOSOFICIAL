type Page<T> = {
  data: T[] | null
  count: number | null
  error: { message: string } | null
}

// No devolver una suma parcial si PostgREST limita las filas o falla una página.
export async function fetchAllCobrosPages<T extends { id: string }>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const rows: T[] = []
  const ids = new Set<string>()
  const pageSize = 500
  let expected: number | null = null

  while (true) {
    const { data, count, error } = await fetchPage(rows.length, rows.length + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || count == null || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('No se pudo verificar el recuento completo de Cobros.')
    }
    if (expected != null && count !== expected) {
      throw new Error('Los registros de Cobros han cambiado durante la carga. Vuelve a intentarlo.')
    }
    expected = count
    for (const row of data) {
      if (!row.id || ids.has(row.id)) {
        throw new Error('La carga de Cobros contiene registros repetidos. Vuelve a intentarlo.')
      }
      ids.add(row.id)
      rows.push(row)
    }
    if (rows.length === expected) return rows
    if (data.length === 0 || rows.length > expected) {
      throw new Error('La carga de Cobros está incompleta. Vuelve a intentarlo.')
    }
  }
}
