-- =====================================================================
-- 0021 · Defensa en profundidad: el usuario anónimo solo puede ejecutar
--        lo que el formulario público necesita.
-- =====================================================================
-- Supabase da permiso de ejecución a "anon" sobre cada función nueva del
-- esquema public. Las funciones ya verifican el rol (y devuelven vacío o
-- un error), pero mejor que ni siquiera se puedan llamar sin sesión.
revoke execute on function public.ver_como_actual() from public;
grant execute on function public.ver_como_actual() to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
    execute 'alter default privileges in schema public revoke execute on functions from anon';
    execute 'grant execute on function public.antes_de_peticion() to anon';
    execute 'grant execute on function public.enlace_info(text) to anon';
    execute 'grant execute on function public.registrar_por_enlace(text, jsonb) to anon';
  end if;
end $$;
