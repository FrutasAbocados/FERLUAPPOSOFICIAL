-- Diccionario aprendido de la herramienta "Limpiar pedido para Excel".
-- Lo que se corrige a mano en la tabla de resultados se guarda aquí y se
-- aplica en los pedidos siguientes. Va aparte de pedidos_wa_abreviaturas:
-- aquella normaliza hacia el catálogo Holded, ésta hacia la lista de compra.

-- Alias crudo -> nombre final. La clave va en minúsculas y sin acentos.
create table if not exists public.pedidos_wa_limpieza_aliases (
  alias       text primary key check (length(trim(alias)) > 0),
  producto    text not null check (length(trim(producto)) > 0),
  veces       integer not null default 1 check (veces > 0),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.pedidos_wa_limpieza_aliases is
  'Alias aprendidos en la herramienta Limpiar pedido para Excel. alias en minusculas sin acentos; producto con su grafia final.';

-- Nombre final -> formato habitual cuando el pedido no escribe unidad.
create table if not exists public.pedidos_wa_limpieza_unidades (
  producto    text primary key check (length(trim(producto)) > 0),
  unidad      text not null check (unidad in (
                'caja','caja_pequena','bolsa','kg','saco','manojo',
                'bandeja','paquete','malla','lecho','carton','unidad')),
  veces       integer not null default 1 check (veces > 0),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.pedidos_wa_limpieza_unidades is
  'Formato habitual aprendido por producto. Solo se aprende cuando la unidad NO venia escrita en el pedido: el texto siempre manda.';

drop trigger if exists pedidos_wa_limpieza_aliases_touch on public.pedidos_wa_limpieza_aliases;
create trigger pedidos_wa_limpieza_aliases_touch
  before update on public.pedidos_wa_limpieza_aliases
  for each row execute function public.touch_updated_at();

drop trigger if exists pedidos_wa_limpieza_unidades_touch on public.pedidos_wa_limpieza_unidades;
create trigger pedidos_wa_limpieza_unidades_touch
  before update on public.pedidos_wa_limpieza_unidades
  for each row execute function public.touch_updated_at();

alter table public.pedidos_wa_limpieza_aliases  enable row level security;
alter table public.pedidos_wa_limpieza_unidades enable row level security;

-- Mismo patron que pedidos_wa_abreviaturas: admin CRUD, responsable lectura.
drop policy if exists "pedidos_wa_limpieza_aliases: admin all" on public.pedidos_wa_limpieza_aliases;
create policy "pedidos_wa_limpieza_aliases: admin all"
  on public.pedidos_wa_limpieza_aliases for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "pedidos_wa_limpieza_aliases: responsable read" on public.pedidos_wa_limpieza_aliases;
create policy "pedidos_wa_limpieza_aliases: responsable read"
  on public.pedidos_wa_limpieza_aliases for select
  to authenticated
  using (public.es_responsable());

drop policy if exists "pedidos_wa_limpieza_unidades: admin all" on public.pedidos_wa_limpieza_unidades;
create policy "pedidos_wa_limpieza_unidades: admin all"
  on public.pedidos_wa_limpieza_unidades for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "pedidos_wa_limpieza_unidades: responsable read" on public.pedidos_wa_limpieza_unidades;
create policy "pedidos_wa_limpieza_unidades: responsable read"
  on public.pedidos_wa_limpieza_unidades for select
  to authenticated
  using (public.es_responsable());

revoke all on public.pedidos_wa_limpieza_aliases  from anon;
revoke all on public.pedidos_wa_limpieza_unidades from anon;
grant select, insert, update, delete on public.pedidos_wa_limpieza_aliases  to authenticated;
grant select, insert, update, delete on public.pedidos_wa_limpieza_unidades to authenticated;
