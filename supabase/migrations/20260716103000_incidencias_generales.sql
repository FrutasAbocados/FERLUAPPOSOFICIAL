-- Incidencias — permitir incidencias generales (sin cliente asociado).
-- contact_name_canon pasa a ser opcional: NULL = incidencia general del negocio.

alter table public.incidencias
  alter column contact_name_canon drop not null;
