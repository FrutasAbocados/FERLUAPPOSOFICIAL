-- Turnos: tipos del plan rotativo (oct-2026) y horario por día.
alter type public.shift_type add value if not exists 'tarde';
alter type public.shift_type add value if not exists 'apoyo';
alter type public.shift_type add value if not exists 'media_manana';
alter type public.shift_type add value if not exists 'vacaciones';

alter table public.turnos
  add column if not exists hora_inicio time,
  add column if not exists hora_fin time;
