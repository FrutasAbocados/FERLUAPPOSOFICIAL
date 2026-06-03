-- Hardening (security advisors): search_path fijo en el trigger touch + revocar execute
-- a public/anon en las funciones nuevas (postura del proyecto, igual que
-- p2_revoke_execute_anon_secdef_functions). Idempotente.
alter function manager_compra_alias_touch() set search_path = '';

revoke execute on function manager_compras_sin_mapear()      from public, anon;
revoke execute on function manager_compra_alias_list()        from public, anon;
revoke execute on function manager_refresh_coste_alias()      from public, anon;

grant execute on function manager_compras_sin_mapear()  to authenticated;
grant execute on function manager_compra_alias_list()   to authenticated;
grant execute on function manager_refresh_coste_alias() to authenticated, service_role;
