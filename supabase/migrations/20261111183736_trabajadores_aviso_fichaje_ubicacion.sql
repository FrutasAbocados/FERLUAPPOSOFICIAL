-- Aviso legal de fichaje con ubicación y acuse de lectura por trabajador.
--
-- El texto vive aquí (versionado) y la app lo muestra tal cual; cada acuse
-- guarda trabajador, versión, hora del servidor y huella SHA-256 del texto
-- exacto aceptado. Append-only: nadie puede editar ni borrar acuses desde la app.
--
-- Base: art. 34.9 ET (registro diario, conservación 4 años), art. 20.3 ET y
-- art. 90 LOPDGDD (información previa, expresa, clara e inequívoca antes de
-- usar la geolocalización). No es «consentimiento» RGPD: es constancia de
-- haber sido informado.

create table if not exists public.trabajadores_avisos (
  codigo        text not null,
  version       int  not null,
  titulo        text not null,
  texto         text not null,
  vigente_desde timestamptz not null default now(),
  primary key (codigo, version)
);
alter table public.trabajadores_avisos enable row level security;
revoke all on public.trabajadores_avisos from anon, authenticated;
grant select on public.trabajadores_avisos to authenticated;
drop policy if exists "trabajadores_avisos: equipo lee" on public.trabajadores_avisos;
create policy "trabajadores_avisos: equipo lee" on public.trabajadores_avisos
  for select to authenticated using (true);

create table if not exists public.trabajadores_avisos_aceptados (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   uuid not null references public.empleados(id) on delete restrict,
  user_id       uuid not null,
  codigo        text not null,
  version       int  not null,
  texto_sha256  text not null,
  aceptado_at   timestamptz not null default now(),
  user_agent    text,
  unique (empleado_id, codigo, version),
  foreign key (codigo, version) references public.trabajadores_avisos(codigo, version)
);
alter table public.trabajadores_avisos_aceptados enable row level security;
revoke all on public.trabajadores_avisos_aceptados from anon, authenticated;
grant select on public.trabajadores_avisos_aceptados to authenticated;
drop policy if exists "trabajadores_avisos_aceptados: admin read" on public.trabajadores_avisos_aceptados;
create policy "trabajadores_avisos_aceptados: admin read" on public.trabajadores_avisos_aceptados
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "trabajadores_avisos_aceptados: empleado lee propio" on public.trabajadores_avisos_aceptados;
create policy "trabajadores_avisos_aceptados: empleado lee propio" on public.trabajadores_avisos_aceptados
  for select to authenticated using (user_id = (select auth.uid()));

insert into public.trabajadores_avisos (codigo, version, titulo, texto) values (
  'fichaje_ubicacion', 1,
  'Registro de jornada y ubicación al fichar',
  $txt$A partir de ahora fichas tu entrada y tu salida en esta app. Resumen de lo que debes saber:
• Por qué: la ley obliga a la empresa a registrar cada día la hora de inicio y de fin de tu jornada (art. 34.9 del Estatuto de los Trabajadores).
• Ubicación: al fichar la entrada y la salida se guarda la ubicación de tu móvil en ese momento. Solo en esos dos momentos: no se te sigue durante la jornada ni fuera de ella.
• Para qué: acreditar dónde empieza y termina la jornada y controlar el registro horario (art. 20.3 del Estatuto de los Trabajadores y art. 90 de la Ley Orgánica 3/2018 de Protección de Datos).
• Si tu móvil no da la ubicación, el fichaje se guarda igual.
• Quién lo ve: la administración de Ferlu Project S.L. y, si la pide, la Inspección de Trabajo. Tú puedes consultar tus fichajes en la app.
• Cuánto tiempo se guarda: 4 años, como exige la ley.
• Tus derechos: puedes pedir a la empresa acceso, rectificación, supresión, limitación u oposición, y reclamar ante la Agencia Española de Protección de Datos (aepd.es).
• El sistema está preparado para el nuevo registro horario digital que está tramitando el Gobierno.
Responsable: Ferlu Project S.L. (B22560510).
Al pulsar «Acepto» confirmas que has leído y entendido esta información. Queda guardado con tu nombre, la fecha y la hora.$txt$
) on conflict (codigo, version) do nothing;

-- Aviso pendiente para el trabajador conectado (null si no es trabajador o ya aceptó).
create or replace function public.trabajadores_aviso_pendiente()
returns table (codigo text, version int, titulo text, texto text)
language sql
stable
security definer
set search_path = public
as $$
  with emp as (
    select id from public.empleados_equipo
     where user_id = auth.uid() and activo = true
     limit 1
  ), ultimo as (
    select distinct on (a.codigo) a.*
      from public.trabajadores_avisos a
     where a.vigente_desde <= now()
     order by a.codigo, a.version desc
  )
  select u.codigo, u.version, u.titulo, u.texto
    from ultimo u, emp
   where not exists (
     select 1 from public.trabajadores_avisos_aceptados x
      where x.empleado_id = emp.id and x.codigo = u.codigo and x.version = u.version
   )
   order by u.codigo
   limit 1;
$$;
revoke all on function public.trabajadores_aviso_pendiente() from public, anon;
grant execute on function public.trabajadores_aviso_pendiente() to authenticated;

create or replace function public.trabajadores_aviso_aceptar(p_codigo text, p_version int, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp   uuid;
  v_texto text;
begin
  select id into v_emp from public.empleados_equipo
   where user_id = auth.uid() and activo = true limit 1;
  if v_emp is null then
    raise exception 'no hay trabajador activo vinculado a esta sesión';
  end if;
  select titulo || E'\n' || texto into v_texto
    from public.trabajadores_avisos where codigo = p_codigo and version = p_version;
  if not found then
    raise exception 'aviso no encontrado';
  end if;
  insert into public.trabajadores_avisos_aceptados
    (empleado_id, user_id, codigo, version, texto_sha256, user_agent)
  values
    (v_emp, auth.uid(), p_codigo, p_version,
     encode(sha256(convert_to(v_texto, 'UTF8')), 'hex'), left(p_user_agent, 400))
  on conflict (empleado_id, codigo, version) do nothing;
end;
$$;
revoke all on function public.trabajadores_aviso_aceptar(text, int, text) from public, anon;
grant execute on function public.trabajadores_aviso_aceptar(text, int, text) to authenticated;

-- Estado por trabajador activo para administración.
create or replace function public.trabajadores_avisos_estado(p_codigo text)
returns table (empleado_id uuid, nombre text, version int, aceptado_at timestamptz, ultima_version int)
language sql
stable
security invoker
set search_path = public
as $$
  with ult as (select max(version) v from public.trabajadores_avisos where codigo = p_codigo)
  select e.id, e.nombre, x.version, x.aceptado_at, ult.v
    from public.empleados_equipo e
    cross join ult
    left join lateral (
      select a.version, a.aceptado_at
        from public.trabajadores_avisos_aceptados a
       where a.empleado_id = e.id and a.codigo = p_codigo
       order by a.version desc limit 1
    ) x on true
   where e.activo = true and e.user_id is not null
   order by e.nombre;
$$;
revoke all on function public.trabajadores_avisos_estado(text) from public, anon;
grant execute on function public.trabajadores_avisos_estado(text) to authenticated;
