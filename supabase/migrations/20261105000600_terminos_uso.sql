-- =====================================================================
-- 0031 · Términos de uso y compromiso de confidencialidad
-- =====================================================================
-- Cada persona del equipo acepta los términos al entrar por primera vez
-- (y de nuevo si cambian). Queda la versión y la fecha, y la auditoría.
alter table public.perfiles
  add column terminos_version text,
  add column terminos_en      timestamptz;

create or replace function public.aceptar_terminos(p_version text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'Versión inválida'; end if;
  update public.perfiles set terminos_version = p_version, terminos_en = now() where id = auth.uid();
end $$;
revoke execute on function public.aceptar_terminos(text) from public;
grant execute on function public.aceptar_terminos(text) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.aceptar_terminos(text) from anon';
  end if;
end $$;
