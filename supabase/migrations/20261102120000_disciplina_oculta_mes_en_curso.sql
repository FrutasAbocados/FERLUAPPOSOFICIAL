-- Disciplina: el trabajador no ve sus partes hasta que el mes ha terminado.
--
-- Decisión de Luis 2026-11-02: cuando Álvaro pone partes, los chicos no deben
-- ver nada del mes en curso; se publican el día 1 del mes siguiente (hora Madrid).
-- Administración sigue viéndolo todo en tiempo real.
--
-- Se aplica en RLS, no solo en la UI: `trabajadores_disciplina_resumen_mes` es
-- security invoker, así que sus contadores heredan este mismo filtro.

drop policy if exists "disciplina: lectura autorizada" on public.trabajadores_disciplina;
create policy "disciplina: lectura autorizada"
  on public.trabajadores_disciplina for select
  to authenticated
  using (
    (select public.is_admin())
    or (
      trabajadores_disciplina.fecha
        < (select date_trunc('month', (now() at time zone 'Europe/Madrid'))::date)
      and exists (
        select 1
        from public.empleados e
        where e.id = trabajadores_disciplina.empleado_id
          and e.user_id = (select auth.uid())
          and e.activo = true
      )
    )
  );
