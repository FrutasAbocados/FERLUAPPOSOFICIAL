-- Activar el kill-switch global: la disponibilidad real queda limitada por
-- ruleta_es_sabado_madrid() en las RPCs self.
insert into public.app_settings (key, value, updated_at)
values ('ruleta_activa', 'true', now())
on conflict (key) do update
  set value = 'true', updated_at = now();
