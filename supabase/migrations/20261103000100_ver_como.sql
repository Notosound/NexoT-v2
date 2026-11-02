-- =====================================================================
-- 0018 · "Ver como": el admin ve el panel de otro rol o persona,
--        con datos reales y SOLO LECTURA, garantizado por la base.
-- =====================================================================
-- Cómo funciona: el panel manda el encabezado HTTP  x-ver-como  con
--   * el id de un perfil de la misma organización  → se ve como esa persona
--   * 'rol:candidato' | 'rol:digitador' | 'rol:coordinador' → se ve como el rol
-- Antes de cada petición, PostgREST llama a public.antes_de_peticion():
--   1. si no hay encabezado, no hace nada (caso normal);
--   2. si quien lo manda no es admin activo, rechaza la petición;
--   3. solo permite lecturas (GET/HEAD) y además marca la transacción
--      como de solo lectura: aunque el panel fallara, la base no escribe;
--   4. cambia la identidad de la petición (auth.uid()) por la del perfil
--      elegido, o el rol efectivo (app.rol_actual()) por el rol elegido.
-- Así las reglas de acceso (RLS) son exactamente las de esa persona/rol.

create or replace function app.rol_actual() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(nullif(current_setting('app.rol_vista', true), ''), rol)
  from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.antes_de_peticion() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_obj    text;
  v_claims jsonb;
  v_real   uuid;
  v_org    uuid;
  v_rol    text;
begin
  begin
    v_obj := nullif(trim(current_setting('request.headers', true)::json ->> 'x-ver-como'), '');
  exception when others then
    v_obj := null;
  end;
  if v_obj is null then return; end if;

  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_real := coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), v_claims ->> 'sub')::uuid;
  select organizacion_id into v_org from public.perfiles where id = v_real and activo and rol = 'admin';
  if v_org is null then
    raise exception 'Solo un administrador puede usar "Ver como"' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(current_setting('request.method', true), 'GET') not in ('GET', 'HEAD') then
    raise exception 'Estás en "Ver como": es solo lectura' using errcode = 'read_only_sql_transaction';
  end if;
  perform set_config('transaction_read_only', 'on', true);
  perform set_config('app.ver_como', v_obj, true);

  if v_obj like 'rol:%' then
    v_rol := substr(v_obj, 5);
    if v_rol not in ('candidato', 'digitador', 'coordinador', 'lider') then
      raise exception 'Rol no válido: %', v_rol;
    end if;
    perform set_config('app.rol_vista', v_rol, true);
    return;
  end if;

  if v_obj !~ '^[0-9a-f-]{36}$' or not exists (
       select 1 from public.perfiles where id = v_obj::uuid and organizacion_id = v_org) then
    raise exception 'Esa persona no es de tu organización' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('request.jwt.claim.sub', v_obj, true);
  perform set_config('request.jwt.claims', jsonb_set(coalesce(v_claims, '{}'::jsonb), '{sub}', to_jsonb(v_obj))::text, true);
end $$;

revoke execute on function public.antes_de_peticion() from public;
grant execute on function public.antes_de_peticion() to anon, authenticated;

-- ¿Estoy viendo como otra persona? (para mostrar el aviso en el panel)
create or replace function public.ver_como_actual() returns text
language sql stable as $$ select nullif(current_setting('app.ver_como', true), '') $$;
grant execute on function public.ver_como_actual() to authenticated;

-- A quién se puede "ver como": perfiles de la organización (solo admin)
create or replace function public.opciones_ver_como()
returns table (id uuid, nombre text, rol text, lider_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.nombre, p.rol, (select li.id from public.lideres li where li.perfil_id = p.id limit 1)
  from public.perfiles p
  where app.tiene_rol('admin') and p.organizacion_id = app.org_actual() and p.activo and p.id <> auth.uid()
  order by p.rol, p.nombre
$$;
revoke execute on function public.opciones_ver_como() from public;
grant execute on function public.opciones_ver_como() to authenticated;

-- Deja constancia en la auditoría de cada vez que el admin entra a "Ver como"
alter table public.auditoria drop constraint auditoria_accion_check;
alter table public.auditoria add constraint auditoria_accion_check check (accion in ('INSERT', 'UPDATE', 'DELETE', 'EXPORT', 'VER_COMO'));
create or replace function public.registrar_ver_como(p_objetivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.tiene_rol('admin') then raise exception 'Sin acceso' using errcode = 'insufficient_privilege'; end if;
  insert into public.auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (app.org_actual(), 'ver_como', p_objetivo, 'VER_COMO', jsonb_build_object('tipo', 'ver_como', 'objetivo', p_objetivo), auth.uid());
end $$;
revoke execute on function public.registrar_ver_como(text) from public;
grant execute on function public.registrar_ver_como(text) to authenticated;

-- Activar el gancho en PostgREST (en Supabase; en el entorno de pruebas no existe)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.antes_de_peticion''';
    notify pgrst, 'reload config';
  end if;
end $$;
