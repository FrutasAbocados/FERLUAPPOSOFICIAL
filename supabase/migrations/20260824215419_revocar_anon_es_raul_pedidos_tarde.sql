-- La funcion consulta identidad autenticada y solo se usa desde policies RLS.
-- El rol anon conservaba un grant explicito pese a la intencion original.
revoke all on function public.es_raul_pedidos_tarde() from public, anon;
grant execute on function public.es_raul_pedidos_tarde() to authenticated;
