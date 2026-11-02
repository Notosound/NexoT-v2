-- =====================================================================
-- 0019 · Equipo desde la plataforma y enlace de registro de cada líder
-- =====================================================================
-- Equipo: el admin ve quién aceptó la invitación, cambia roles y
-- reactiva usuarios sin entrar a Supabase. (El correo de invitación lo
-- envía la función "equipo", que usa la clave de servicio en el servidor.)
--
-- Enlace del líder (como en el piloto): cada líder tiene un enlace con
-- código QR. La persona abre el enlace, llena sus datos, acepta el
-- tratamiento de datos y queda registrada a nombre de ese líder.
--   * El enlace no da acceso a ningún dato: solo permite registrarse.
--   * Se puede apagar o cambiar (el enlace viejo deja de servir).
--   * Límites contra abuso: 30 registros por hora desde la misma
--     conexión y 600 por día por enlace.
--   * Si la cédula ya existe, la respuesta es la misma que si fuera
--     nueva: el formulario no revela quién está en la base.

-- ---------------------------------------------------------------------
-- Equipo
-- ---------------------------------------------------------------------
drop function if exists public.equipo();
create function public.equipo()
returns table (id uuid, nombre text, rol text, activo boolean, email text, creado_en timestamptz,
               ultimo_ingreso timestamptz, acepto boolean, lider_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.nombre, p.rol, p.activo, u.email::text, p.creado_en,
         u.last_sign_in_at, u.last_sign_in_at is not null,
         (select li.id from public.lideres li where li.perfil_id = p.id limit 1)
  from public.perfiles p join auth.users u on u.id = p.id
  where p.organizacion_id = app.org_actual() and app.tiene_rol('admin')
  order by p.activo desc, p.nombre
$$;

create or replace function public.cambiar_rol(p_usuario uuid, p_rol text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.tiene_rol('admin') then raise exception 'Solo un administrador puede cambiar roles' using errcode = 'insufficient_privilege'; end if;
  if p_usuario = auth.uid() then raise exception 'No puedes cambiar tu propio rol'; end if;
  if p_rol not in ('admin','coordinador','lider','digitador','candidato') then raise exception 'Rol inválido: %', p_rol; end if;
  update public.perfiles set rol = p_rol where id = p_usuario and organizacion_id = app.org_actual();
  if not found then raise exception 'Usuario no encontrado'; end if;
  -- Si deja de ser líder, su ficha de líder sigue (con sus personas) pero sin acceso
  if p_rol <> 'lider' then update public.lideres set perfil_id = null where perfil_id = p_usuario; end if;
end $$;

create or replace function public.reactivar_usuario(p_usuario uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.tiene_rol('admin') then raise exception 'Solo un administrador puede reactivar usuarios' using errcode = 'insufficient_privilege'; end if;
  update public.perfiles set activo = true where id = p_usuario and organizacion_id = app.org_actual();
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;

-- ¿Este correo ya tiene cuenta? (para que la función de invitación decida)
create or replace function public.estado_correo(p_email text)
returns table (usuario_id uuid, organizacion_id uuid, misma_org boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.id, p.organizacion_id, p.organizacion_id is not distinct from app.org_actual()
  from auth.users u left join public.perfiles p on p.id = u.id
  where app.tiene_rol('admin') and lower(u.email) = lower(trim(p_email))
$$;

revoke execute on function public.equipo(), public.cambiar_rol(uuid, text), public.reactivar_usuario(uuid), public.estado_correo(text) from public;
grant execute on function public.equipo(), public.cambiar_rol(uuid, text), public.reactivar_usuario(uuid), public.estado_correo(text) to authenticated;

-- ---------------------------------------------------------------------
-- Enlace de registro del líder
-- ---------------------------------------------------------------------
alter table public.lideres
  add column enlace_token  text unique check (enlace_token ~ '^[A-Za-z0-9]{12,40}$'),
  add column enlace_activo boolean not null default true;

create or replace function app.token_nuevo() returns text
language sql volatile as $$ select replace(gen_random_uuid()::text, '-', '') $$;

-- Quién puede ver/gestionar el enlace: admin, el coordinador del líder o el propio líder
create or replace function app.puede_gestionar_lider(p_lider uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.lideres li
                 where li.id = p_lider and li.organizacion_id = app.org_actual()
                   and (app.tiene_rol('admin')
                        or (app.tiene_rol('coordinador') and li.coordinador_id = auth.uid())
                        or (app.tiene_rol('lider') and li.perfil_id = auth.uid())))
$$;

create or replace function public.enlace_lider(p_lider uuid)
returns table (token text, activo boolean, registros_enlace int)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.puede_gestionar_lider(p_lider) then raise exception 'Sin acceso a ese líder' using errcode = 'insufficient_privilege'; end if;
  -- En "Ver como" (solo lectura) no se crea el enlace: se muestra el que haya
  if current_setting('transaction_read_only') = 'off' then
    update public.lideres set enlace_token = app.token_nuevo() where id = p_lider and enlace_token is null;
  end if;
  return query select li.enlace_token, li.enlace_activo,
    (select count(*)::int from public.personas p where p.lider_id = li.id and p.origen = 'formulario' and p.eliminado_en is null)
    from public.lideres li where li.id = p_lider;
end $$;

create or replace function public.configurar_enlace(p_lider uuid, p_activo boolean, p_regenerar boolean default false) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.puede_gestionar_lider(p_lider) then raise exception 'Sin acceso a ese líder' using errcode = 'insufficient_privilege'; end if;
  update public.lideres
     set enlace_activo = p_activo,
         enlace_token = case when p_regenerar or enlace_token is null then app.token_nuevo() else enlace_token end
   where id = p_lider;
end $$;

revoke execute on function public.enlace_lider(uuid), public.configurar_enlace(uuid, boolean, boolean) from public;
grant execute on function public.enlace_lider(uuid), public.configurar_enlace(uuid, boolean, boolean) to authenticated;

-- Catálogo oficial (Divipole, información pública) legible para el formulario
create policy catalogo_publico on public.localidades for select to anon using (true);
create policy catalogo_publico on public.puestos     for select to anon using (true);
create policy catalogo_publico on public.mesas       for select to anon using (true);
grant select on public.localidades, public.puestos, public.mesas to anon;

-- Datos que muestra el formulario al abrir el enlace
create or replace function public.enlace_info(p_token text)
returns table (lider text, campana text, municipio_id int)
language sql stable security definer set search_path = public, pg_temp as $$
  select li.nombre, o.nombre,
         (select m.id from public.municipios m where m.divipola = '11001')
  from public.lideres li join public.organizaciones o on o.id = li.organizacion_id
  where li.enlace_token = p_token and li.enlace_activo and li.activo and o.activa
$$;

create table app.enlace_intentos (
  id     bigserial primary key,
  token  text not null,
  origen text,
  en     timestamptz not null default now()
);
create index enlace_intentos_idx on app.enlace_intentos(token, en);
create index enlace_intentos_origen_idx on app.enlace_intentos(origen, en);

create or replace function public.registrar_por_enlace(p_token text, p jsonb) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  li       public.lideres;
  v_origen text;
  v_edad   int;
  v_nac    date;
  v_ced    text := regexp_replace(coalesce(p ->> 'cedula', ''), '\D', '', 'g');
begin
  select * into li from public.lideres where enlace_token = p_token and enlace_activo and activo;
  if li.id is null then raise exception 'Este enlace ya no está activo. Pídele uno nuevo a quien te lo envió.'; end if;

  begin
    v_origen := split_part(coalesce(current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
                                    current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then v_origen := null; end;

  if (select count(*) from app.enlace_intentos where token = p_token and en > now() - interval '1 day') >= 600
     or (v_origen <> '' and (select count(*) from app.enlace_intentos where origen = v_origen and en > now() - interval '1 hour') >= 30) then
    raise exception 'Demasiados registros seguidos. Intenta de nuevo en un rato.';
  end if;
  insert into app.enlace_intentos(token, origen) values (p_token, nullif(v_origen, ''));

  if coalesce((p ->> 'acepta')::boolean, false) is not true then
    raise exception 'Para registrarte debes aceptar el tratamiento de tus datos.';
  end if;
  if v_ced !~ '^[0-9]{5,10}$' then raise exception 'Revisa la cédula: solo números, entre 5 y 10 dígitos.'; end if;
  if length(trim(coalesce(p ->> 'nombres', ''))) = 0 then raise exception 'Escribe tu nombre.'; end if;
  if coalesce(p ->> 'sexo', '') not in ('femenino','masculino','otro','no_informa') then raise exception 'Elige una opción en sexo.'; end if;
  v_nac := nullif(p ->> 'fecha_nacimiento', '')::date;
  v_edad := nullif(p ->> 'edad', '')::int;
  if v_nac is null and v_edad is null then raise exception 'Escribe tu fecha de nacimiento o tu edad.'; end if;
  if coalesce(app.edad(v_nac, v_edad::smallint, current_date), 0) < 18 then raise exception 'Debes ser mayor de edad para registrarte.'; end if;

  -- Cédula ya registrada en la campaña: misma respuesta, no se revela nada
  if exists (select 1 from public.personas where organizacion_id = li.organizacion_id and cedula = v_ced) then
    return 'recibido';
  end if;

  insert into public.personas (organizacion_id, lider_id, cedula, nombres, apellidos, sexo, fecha_nacimiento,
    edad_declarada, edad_declarada_en, telefono, localidad_votacion_id, puesto_id, puesto_reportado,
    direccion_reportada, mesa_reportada, origen, consentimiento_version, consentimiento_en, consentimiento_canal)
  values (li.organizacion_id, li.id, v_ced, trim(p ->> 'nombres'), nullif(trim(coalesce(p ->> 'apellidos', '')), ''),
    p ->> 'sexo', v_nac, case when v_nac is null then v_edad end, case when v_nac is null then current_date end,
    nullif(regexp_replace(coalesce(p ->> 'telefono', ''), '\D', '', 'g'), ''),
    nullif(p ->> 'localidad_id', '')::int, nullif(p ->> 'puesto_id', '')::int,
    case when nullif(p ->> 'puesto_id', '') is null then nullif(trim(coalesce(p ->> 'puesto_reportado', '')), '') end,
    case when nullif(p ->> 'puesto_id', '') is null then nullif(trim(coalesce(p ->> 'direccion_reportada', '')), '') end,
    nullif(p ->> 'mesa', '')::int, 'formulario', coalesce(p ->> 'aviso_version', 'formulario'), now(), 'formulario');
  return 'recibido';
end $$;

revoke execute on function public.enlace_info(text), public.registrar_por_enlace(text, jsonb) from public;
grant execute on function public.enlace_info(text), public.registrar_por_enlace(text, jsonb) to anon, authenticated;
