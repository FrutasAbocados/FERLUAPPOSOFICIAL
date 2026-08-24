-- Evita que un search_path mutable cambie la resolucion de objetos SQL.
alter function public.manager_asesor_ia_get(date)
  set search_path to 'public';

alter function public.pedidos_wa_fecha_negocio(timestamptz)
  set search_path to 'public';
