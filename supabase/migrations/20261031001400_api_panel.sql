-- =====================================================================
-- 0014 · API para el panel web
-- =====================================================================
-- Supabase solo expone por la API el esquema public. Estas funciones son
-- envolturas finas de las del esquema app (que conserva la lógica) más
-- lo nuevo que necesita el panel:
--   * consentimiento obligatorio en todo registro hecho por un usuario
--   * vincular un usuario invitado con su rol (y su ficha de líder)
--   * sugerencia de puesto en vivo mientras se escribe "Otro"

-- ---------------------------------------------------------------------
-- Consentimiento obligatorio (salvo listas importadas y scripts del sistema)
-- ---------------------------------------------------------------------
create or replace function app.exigir_consentimiento() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and new.origen <> 'importacion' and new.consentimiento_en is null then
    raise exception 'Falta el consentimiento de la persona para el tratamiento de sus datos'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger personas_consentimiento before insert on public.personas
  for each row execute function app.exigir_consentimiento();

-- ---------------------------------------------------------------------
-- Envolturas
-- ---------------------------------------------------------------------
create or replace function public.validar_importacion(p_importacion uuid) returns public.importaciones
language sql security invoker set search_path = public, pg_temp as
$$ select * from app.validar_importacion(p_importacion) $$;

create or replace function public.confirmar_importacion(p_importacion uuid) returns public.importaciones
language sql security invoker set search_path = public, pg_temp as
$$ select * from app.confirmar_importacion(p_importacion) $$;

create or replace function public.resolver_ubicacion(p_persona uuid, p_puesto int, p_guardar_alias boolean default true)
returns int language sql security invoker set search_path = public, pg_temp as
$$ select app.resolver_ubicacion(p_persona, p_puesto, p_guardar_alias) $$;

create or replace function public.resolver_e14(p_eleccion uuid, p_mesa int, p_votos int) returns void
language sql security invoker set search_path = public, pg_temp as
$$ select app.resolver_e14(p_eleccion, p_mesa, p_votos) $$;

create or replace function public.eliminar_persona(p_id uuid) returns void
language sql security invoker set search_path = public, pg_temp as
$$ select app.eliminar_persona(p_id) $$;

-- Sugerencia en vivo para el formulario (usa los alias de la organización)
create or replace function public.sugerir_puesto(p_localidad int, p_nombre text, p_direccion text)
returns table (puesto_id int, nombre text, direccion text, mesas_total int, metodo text, confianza text)
language sql stable security invoker set search_path = public, pg_temp as $$
  select p.id, p.nombre, p.direccion, p.mesas_total, s.metodo, s.confianza
  from app.sugerir_puesto(app.org_actual(), p_localidad, p_nombre, p_direccion) s
  join public.puestos p on p.id = s.puesto_id
  where app.org_actual() is not null
$$;

-- ---------------------------------------------------------------------
-- Vincular un usuario invitado (Supabase Auth) a la organización
-- ---------------------------------------------------------------------
-- Flujo: el admin invita el correo desde Supabase (Authentication → Users
-- → Invite user) y luego, desde el panel, le asigna nombre y rol. Si el
-- rol es "lider", se vincula a una ficha de líder existente o se crea.
create or replace function public.vincular_usuario(p_email text, p_nombre text, p_rol text, p_lider uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := app.org_actual();
  v_uid uuid;
begin
  if not app.tiene_rol('admin') then
    raise exception 'Solo un administrador puede vincular usuarios' using errcode = 'insufficient_privilege';
  end if;
  if p_rol not in ('admin','coordinador','lider','digitador','candidato') then
    raise exception 'Rol inválido: %', p_rol;
  end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Falta el nombre';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'No hay ningún usuario con el correo %. Primero invítalo desde Supabase: Authentication → Users → Invite user.', trim(p_email);
  end if;
  if v_uid = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol';
  end if;
  if exists (select 1 from public.perfiles where id = v_uid and organizacion_id <> v_org) then
    raise exception 'Ese usuario pertenece a otra organización';
  end if;

  insert into public.perfiles (id, organizacion_id, nombre, rol)
  values (v_uid, v_org, trim(p_nombre), p_rol)
  on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol, activo = true;

  if p_rol = 'lider' then
    if p_lider is not null then
      update public.lideres set perfil_id = v_uid
      where id = p_lider and organizacion_id = v_org and (perfil_id is null or perfil_id = v_uid);
      if not found then raise exception 'La ficha de líder no existe o ya tiene otro usuario'; end if;
    elsif not exists (select 1 from public.lideres where perfil_id = v_uid) then
      insert into public.lideres (organizacion_id, perfil_id, nombre) values (v_org, v_uid, trim(p_nombre));
    end if;
  end if;
  return v_uid;
end $$;

-- Desactivar un usuario (no se borra: queda en la auditoría)
create or replace function public.desactivar_usuario(p_usuario uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.tiene_rol('admin') then
    raise exception 'Solo un administrador puede desactivar usuarios' using errcode = 'insufficient_privilege';
  end if;
  if p_usuario = auth.uid() then raise exception 'No puedes desactivarte a ti mismo'; end if;
  update public.perfiles set activo = false where id = p_usuario and organizacion_id = app.org_actual();
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;

-- Correo de cada usuario de la organización (solo admin), para la lista del equipo
create or replace function public.equipo() returns table (id uuid, nombre text, rol text, activo boolean, email text, creado_en timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.nombre, p.rol, p.activo, u.email::text, p.creado_en
  from public.perfiles p join auth.users u on u.id = p.id
  where p.organizacion_id = app.org_actual() and app.tiene_rol('admin')
  order by p.activo desc, p.nombre
$$;

-- Permisos de ejecución: solo usuarios autenticados
revoke execute on function public.validar_importacion(uuid), public.confirmar_importacion(uuid),
  public.resolver_ubicacion(uuid, int, boolean), public.resolver_e14(uuid, int, int),
  public.eliminar_persona(uuid), public.sugerir_puesto(int, text, text),
  public.vincular_usuario(text, text, text, uuid), public.desactivar_usuario(uuid), public.equipo()
  from public;
grant execute on function public.validar_importacion(uuid), public.confirmar_importacion(uuid),
  public.resolver_ubicacion(uuid, int, boolean), public.resolver_e14(uuid, int, int),
  public.eliminar_persona(uuid), public.sugerir_puesto(int, text, text),
  public.vincular_usuario(text, text, text, uuid), public.desactivar_usuario(uuid), public.equipo()
  to authenticated;

revoke execute on all functions in schema app from public;
grant  execute on all functions in schema app to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
  end if;
end $$;
