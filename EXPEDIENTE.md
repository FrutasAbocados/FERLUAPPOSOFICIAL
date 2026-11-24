# Expediente · AbocadosOS

> Memoria única del proyecto. Si contradice al código o a producción, mandan ellos.

## En curso
- (nadie registrado en este expediente)

## Ficha
| | |
|---|---|
| Cliente | Ferlu Project S.L. |
| Estado técnico | Aplicación en producción; esta consulta no evalúa su salud general. |
| Producción | https://abocadosos.vercel.app |
| Código | `/Users/luis/Developer/AbocadosOS`; GitHub `FrutasAbocados/FERLUAPPOSOFICIAL` |
| Datos | Supabase Ferlu `ucjkyjhvvdofyaizzdbk`, esquema `public` |
| Publicar | No autorizado en esta consulta. |
| Copias | No revisadas en esta consulta. |
| Vigilancia | No revisada en esta consulta. |

## Objetivo
Aplicación interna de Ferlu; mantener separado el perímetro LumoTech.

## Funcionalidades
| Funcionalidad | Estado | Evidencia |
|---|---|---|
| Caja: cierres diarios | Código y tabla verificados, sin cambios | `src/modules/cash/lib/queries.ts`, tabla pública `cierres` |
| Tesorería: movimientos e historial | Tablas verificadas mediante consultas de lectura, sin cambios | `tesoreria_movimientos`, `tesoreria_historial` |
| Manager: clientes excluidos de ventas | En producción desde 2026-11-24 | `manager_clientes_excluidos` filtrada en `manager_ventas_efectivas`; migración `20261124120000_…`; Alcalde fuera de vista (0 docs), informe 23-nov recalculado |
| Coste fijo HUEVOS L | 1,99 EUR/docena en producción desde 2026-11-24 | `manager_costes_manuales_nombre` (`huevos l docena`, `docena huevos l`) |

## Decisiones (con motivo)
- 2026-11-24 (Luis): las ventas a FRUTAS PEREZ ALCALDE S.L. no entran en AbocadosOS; es proveedor y la venta fue reventa a coste. Holded y Cobros no se tocan.
- 2026-11-24 (Luis): el coste real de los huevos L es 1,99 EUR/docena (antes se tomaba 2,35 de compras por nombre).
- Expediente iniciado el 2026-11-15 con alcance limitado a lo contrastado en esta consulta; no sustituye una auditoría de funcionalidades.

## Pendiente del cliente / de Luis (no tocar sin respuesta)
- Ninguno añadido por esta consulta.

## Pendiente técnico (orden)
- No evaluado en esta consulta.

## Pruebas
- 2026-11-24: `informe_margen_diario('2026-11-23')` pasa de 28,6 % a 35,7 % (434,40 / 1.217,56 €), cuadrado al céntimo; Dashboard, top clientes y top productos de Manager por debajo de 0,5 s tras `ANALYZE` de la tabla nueva.
- Consultas SQL de solo lectura al esquema real de Ferlu; no se modifica código ni datos productivos.
- 2026-11-15: consulta de retirada de colaborador de septiembre completada sobre movimientos actuales, historial, cierres, gastos y pluses. No se identifica registro del pago consultado; esto no acredita impago. Tesorería comienza el 2026-09-16 y el historial el 2026-11-10; no permite descartar borrados anteriores al historial.

## Riesgos
- Tras tocar `manager_clientes_excluidos`, hacer `ANALYZE`: sin estadísticas el planificador estima 1 fila y el informe de margen da timeout (visto el 2026-11-24).
- El repositorio contiene WIP previo en varios módulos y migraciones sin seguimiento; se preserva.
- La ausencia de un pago identificado en los registros no demuestra que no se haya realizado fuera del sistema.
