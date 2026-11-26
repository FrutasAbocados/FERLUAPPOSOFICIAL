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
| Documentación de la empresa `/documentacion` | En producción desde 2026-11-26 (PR #2, merge `e641d49`) | Migración `20261125210000_documentacion_empresa.sql` aplicada; 47 fichas = 47 objetos en el bucket privado `documentacion-empresa`, 47 SHA-256 distintos, 0 huérfanos, 19.162.237 bytes iguales a los originales; acceso verificado: Luis 1, admin_op/empleado/gestores 0 |
| Coste fijo HUEVOS L | 1,99 EUR/docena en producción desde 2026-11-24 | `manager_costes_manuales_nombre` (`huevos l docena`, `docena huevos l`) |

## Decisiones (con motivo)
- 2026-11-26 (Luis): la Documentación la ve SOLO Luis: ni Álvaro (admin_op), ni trabajadores, ni gestorías, ni nadie de LumoTech. Se controla con la lista `documentacion_acceso` (vacía en el repo; alta como dato) y `puede_ver_documentacion()`; en el menú solo aparece a `admin_full`.
- 2026-11-25: bucket propio `documentacion-empresa`, no `gestoria-documentos` (el gestor Gedofu lee ese).
- 2026-11-25: solo se archiva Ferlu (B22560510). Quedan fuera la antigua S.C. J19748698, lo personal de los socios y los certificados `.p12`. Inventario y originales: `~/Desktop/EMPRESAS/ABOCADOS/DOCUMENTACION FERLU/`.
- 2026-11-24 (Luis): las ventas a FRUTAS PEREZ ALCALDE S.L. no entran en AbocadosOS; es proveedor y la venta fue reventa a coste. Holded y Cobros no se tocan.
- 2026-11-24 (Luis): el coste real de los huevos L es 1,99 EUR/docena (antes se tomaba 2,35 de compras por nombre).
- Expediente iniciado el 2026-11-15 con alcance limitado a lo contrastado en esta consulta; no sustituye una auditoría de funcionalidades.

## Pendiente del cliente / de Luis (no tocar sin respuesta)
- Decidir si se archivan los documentos de la S.C. J19748698 (entidad anterior) y los presupuestos de seguro de BBVA.
- Faltan en Gmail: modelo 202, cuentas anuales depositadas, 115 2T/3T 2026; pedir a Gedofu si existen.

## Pendiente técnico (orden)
- No evaluado en esta consulta.

## Pruebas
- 2026-11-26 `/documentacion`: Vercel `success` para `e641d49`; el bundle servido contiene `DocumentacionPage`; con la sesión de Luis la página muestra 47 documentos y 9 categorías; el Modelo 200 descargado por URL firmada coincide en SHA-256 con el original; anónimo recibe 401. Tras desplegar, la PWA puede mostrar 404 hasta que se actualiza su service worker (recargar).
- 2026-11-24: `informe_margen_diario('2026-11-23')` pasa de 28,6 % a 35,7 % (434,40 / 1.217,56 €), cuadrado al céntimo; Dashboard, top clientes y top productos de Manager por debajo de 0,5 s tras `ANALYZE` de la tabla nueva.
- Consultas SQL de solo lectura al esquema real de Ferlu; no se modifica código ni datos productivos.
- 2026-11-15: consulta de retirada de colaborador de septiembre completada sobre movimientos actuales, historial, cierres, gastos y pluses. No se identifica registro del pago consultado; esto no acredita impago. Tesorería comienza el 2026-09-16 y el historial el 2026-11-10; no permite descartar borrados anteriores al historial.

## Riesgos
- `/documentacion`: dar acceso a otra persona es un INSERT en `documentacion_acceso`, no un cambio de rol. No añadir a nadie sin orden de Luis.
- Tras tocar `manager_clientes_excluidos`, hacer `ANALYZE`: sin estadísticas el planificador estima 1 fila y el informe de margen da timeout (visto el 2026-11-24).
- El repositorio contiene WIP previo en varios módulos y migraciones sin seguimiento; se preserva.
- La ausencia de un pago identificado en los registros no demuestra que no se haya realizado fuera del sistema.
