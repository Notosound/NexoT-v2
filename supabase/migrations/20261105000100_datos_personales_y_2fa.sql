-- =====================================================================
-- 0026 · Protección de datos personales (Ley 1581 de 2012) y
--        verificación en dos pasos
-- =====================================================================
-- 1. Datos del responsable del tratamiento (para la política pública)
-- 2. Solicitudes de los titulares: consulta, corrección, supresión y
--    revocatoria, con plazo legal (10 / 15 días hábiles)
-- 3. Supresión real: se borran los datos personales de la persona en
--    personas, filas de Excel, seguimiento, testigos, Día D y auditoría
-- 4. Registro de acciones sensibles (exportes, "ver como", supresiones)
-- 5. Si un usuario activó la verificación en dos pasos, toda petición
--    con una sesión que no pasó el segundo paso se rechaza

-- ---------------------------------------------------------------------
-- 1. Responsable del tratamiento
-- ---------------------------------------------------------------------
alter table public.organizaciones
  add column politica_responsable text,      -- nombre legal (persona o campaña)
  add column politica_documento   text,      -- NIT o cédula
  add column politica_correo      text,
  add column politica_telefono    text,
  add column politica_direccion   text,
  add column politica_actualizada date;

create or replace function public.politica_info(p_slug text)
returns table (campana text, responsable text, documento text, correo text, telefono text, direccion text, actualizada date)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.nombre, coalesce(o.politica_responsable, o.nombre), o.politica_documento, o.politica_correo,
         o.politica_telefono, o.politica_direccion, o.politica_actualizada
  from public.organizaciones o where o.slug = p_slug and o.activa
$$;

create or replace function public.configurar_politica(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.tiene_rol('admin') then raise exception 'Solo un administrador puede cambiar estos datos' using errcode = 'insufficient_privilege'; end if;
  if nullif(trim(coalesce(p ->> 'correo', '')), '') is null or (p ->> 'correo') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Escribe un correo válido para que los titulares puedan escribir';
  end if;
  update public.organizaciones set
    politica_responsable = nullif(trim(coalesce(p ->> 'responsable', '')), ''),
    politica_documento   = nullif(trim(coalesce(p ->> 'documento', '')), ''),
    politica_correo      = lower(trim(p ->> 'correo')),
    politica_telefono    = nullif(trim(coalesce(p ->> 'telefono', '')), ''),
    politica_direccion   = nullif(trim(coalesce(p ->> 'direccion', '')), ''),
    politica_actualizada = current_date
  where id = app.org_actual();
end $$;

-- El formulario público de registro necesita saber la organización para
-- enlazar la política: enlace_info devuelve ahora también el slug
drop function public.enlace_info(text);
create function public.enlace_info(p_token text)
returns table (lider text, campana text, municipio_id int, slug text)
language sql stable security definer set search_path = public, pg_temp as $$
  select li.nombre, o.nombre,
         (select m.id from public.municipios m where m.divipola = '11001'), o.slug
  from public.lideres li join public.organizaciones o on o.id = li.organizacion_id
  where li.enlace_token = p_token and li.enlace_activo and li.activo and o.activa
$$;

-- ---------------------------------------------------------------------
-- 2. Solicitudes de los titulares
-- ---------------------------------------------------------------------
-- Días hábiles (lunes a viernes; los festivos no se descuentan: el plazo
-- queda un poco más corto que el legal, nunca más largo)
create or replace function app.sumar_habiles(p_desde date, p_dias int) returns date
language plpgsql immutable as $$
declare d date := p_desde; n int := 0;
begin
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;

create table public.solicitudes_datos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references public.organizaciones(id),
  radicado         text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  tipo             text not null check (tipo in ('consulta', 'correccion', 'supresion', 'revocatoria')),
  cedula           text not null check (cedula ~ '^[0-9]{3,10}$'),
  nombre           text not null check (length(trim(nombre)) > 0),
  contacto         text not null check (length(trim(contacto)) > 0),
  detalle          text check (length(detalle) <= 2000),
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'atendida', 'rechazada')),
  respuesta        text,
  personas_suprimidas int,
  creado_en        timestamptz not null default now(),
  vence_en         date not null,
  atendida_en      timestamptz,
  atendida_por     uuid references public.perfiles(id)
);
create index solicitudes_datos_org_idx on public.solicitudes_datos(organizacion_id, estado, creado_en desc);
alter table public.solicitudes_datos enable row level security;
create policy solicitudes_admin on public.solicitudes_datos for select to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin'));
grant select on public.solicitudes_datos to authenticated;

-- Formulario público: cualquiera puede radicar, con límite por conexión
create or replace function public.solicitar_datos(p_slug text, p jsonb) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org    uuid;
  v_origen text;
  v_tipo   text := p ->> 'tipo';
  v_ced    text := regexp_replace(coalesce(p ->> 'cedula', ''), '\D', '', 'g');
  v_rad    text;
begin
  select id into v_org from public.organizaciones where slug = p_slug and activa;
  if v_org is null then raise exception 'No encontramos esta campaña.'; end if;

  begin
    v_origen := split_part(coalesce(current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
                                    current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then v_origen := null; end;
  if (select count(*) from app.enlace_intentos where token = 'privacidad:' || p_slug and en > now() - interval '1 day') >= 200
     or (v_origen <> '' and (select count(*) from app.enlace_intentos
                             where token like 'privacidad:%' and origen = v_origen and en > now() - interval '1 hour') >= 5) then
    raise exception 'Demasiadas solicitudes seguidas. Intenta de nuevo en un rato.';
  end if;
  insert into app.enlace_intentos(token, origen) values ('privacidad:' || p_slug, nullif(v_origen, ''));

  if v_tipo is null or v_tipo not in ('consulta', 'correccion', 'supresion', 'revocatoria') then raise exception 'Elige qué quieres solicitar.'; end if;
  if v_ced !~ '^[0-9]{5,10}$' then raise exception 'Revisa la cédula: solo números, entre 5 y 10 dígitos.'; end if;
  if length(trim(coalesce(p ->> 'nombre', ''))) < 3 then raise exception 'Escribe tu nombre completo.'; end if;
  if length(trim(coalesce(p ->> 'contacto', ''))) < 7 then raise exception 'Escribe un celular o correo para responderte.'; end if;

  insert into public.solicitudes_datos (organizacion_id, tipo, cedula, nombre, contacto, detalle, vence_en)
  values (v_org, v_tipo, v_ced, trim(p ->> 'nombre'), trim(p ->> 'contacto'), nullif(trim(coalesce(p ->> 'detalle', '')), ''),
          app.sumar_habiles((now() at time zone 'America/Bogota')::date, case when v_tipo = 'consulta' then 10 else 15 end))
  returning radicado into v_rad;
  return v_rad;
end $$;

-- ---------------------------------------------------------------------
-- 3. Supresión: borra los datos personales del titular en toda la base
-- ---------------------------------------------------------------------
-- La auditoría es inmutable, salvo para tachar datos personales durante
-- una supresión (solo desde app.suprimir_titular)
create or replace function app.auditoria_inmutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and current_setting('app.redactando', true) = 'on'
     and new.id = old.id and new.tabla = old.tabla and new.accion = old.accion and new.en = old.en
     and new.usuario_id is not distinct from old.usuario_id then
    return new;
  end if;
  raise exception 'La auditoría es de solo lectura' using errcode = 'insufficient_privilege';
end $$;

create or replace function app.suprimir_titular(p_org uuid, p_cedula text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ids uuid[];
  v_filas bigint[];
begin
  select coalesce(array_agg(id), '{}') into v_ids from public.personas where organizacion_id = p_org and cedula = p_cedula;
  select coalesce(array_agg(id), '{}') into v_filas from public.importacion_filas where organizacion_id = p_org and cedula = p_cedula;

  delete from public.contactos      where persona_id = any(v_ids);
  delete from public.testigos       where persona_id = any(v_ids);
  delete from public.votos_marcados where persona_id = any(v_ids);

  update public.personas set
    cedula = '0' || lpad((floor(random() * 1e9))::bigint::text, 9, '0'),
    nombres = 'Titular', apellidos = 'suprimido', telefono = null,
    -- sexo y edad se conservan solo como dato estadístico, sin fecha exacta
    edad_declarada = app.edad(fecha_nacimiento, edad_declarada, edad_declarada_en)::smallint,
    edad_declarada_en = case when coalesce(fecha_nacimiento::text, edad_declarada::text) is not null then current_date end,
    fecha_nacimiento = null,
    barrio = null, puesto_reportado = null, direccion_reportada = null,
    eliminado_en = coalesce(eliminado_en, now()), eliminado_por = coalesce(eliminado_por, auth.uid())
  where id = any(v_ids);

  update public.importacion_filas set
    datos = '{}'::jsonb, cedula = null, nombres = null, apellidos = null, sexo = null,
    fecha_nacimiento = null, edad_declarada = null, telefono = null, barrio = null
  where id = any(v_filas);

  -- Tachar los datos personales que quedaron copiados en la auditoría
  perform set_config('app.redactando', 'on', true);
  update public.auditoria set antes = case when antes is null then null else '{"suprimido": true}'::jsonb end,
                              despues = case when despues is null then null else '{"suprimido": true}'::jsonb end
  where organizacion_id = p_org and (
        (tabla = 'personas' and registro_id = any(select unnest(v_ids)::text))
     or (tabla in ('contactos', 'testigos', 'votos_marcados')
         and (antes ->> 'persona_id' = any(select unnest(v_ids)::text) or despues ->> 'persona_id' = any(select unnest(v_ids)::text)))
     or (tabla = 'importacion_filas' and registro_id = any(select unnest(v_filas)::text)));
  perform set_config('app.redactando', 'off', true);

  return coalesce(array_length(v_ids, 1), 0);
end $$;
revoke execute on function app.suprimir_titular(uuid, text) from public, authenticated;

alter table public.auditoria drop constraint auditoria_accion_check;
alter table public.auditoria add constraint auditoria_accion_check
  check (accion in ('INSERT', 'UPDATE', 'DELETE', 'EXPORT', 'VER_COMO', 'SUPRESION'));

create or replace function public.atender_solicitud(p_id uuid, p_estado text, p_respuesta text, p_suprimir boolean default false)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.solicitudes_datos;
  v_n int;
begin
  if not app.tiene_rol('admin') then raise exception 'Solo un administrador atiende solicitudes' using errcode = 'insufficient_privilege'; end if;
  select * into s from public.solicitudes_datos where id = p_id and organizacion_id = app.org_actual() for update;
  if s.id is null then raise exception 'Solicitud no encontrada'; end if;
  if s.estado <> 'pendiente' then raise exception 'Esta solicitud ya fue atendida'; end if;
  if p_estado not in ('atendida', 'rechazada') then raise exception 'Estado no válido'; end if;
  if length(trim(coalesce(p_respuesta, ''))) < 10 then raise exception 'Escribe la respuesta que se le dio al titular (mínimo 10 caracteres).'; end if;
  if p_suprimir and (p_estado <> 'atendida' or s.tipo not in ('supresion', 'revocatoria')) then
    raise exception 'Solo se suprimen datos en solicitudes de supresión o revocatoria atendidas';
  end if;

  if p_suprimir then
    v_n := app.suprimir_titular(s.organizacion_id, s.cedula);
    insert into public.auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
    values (s.organizacion_id, 'solicitudes_datos', s.radicado, 'SUPRESION',
            jsonb_build_object('tipo', 'supresion', 'radicado', s.radicado, 'personas', v_n), auth.uid());
  end if;

  update public.solicitudes_datos set estado = p_estado, respuesta = trim(p_respuesta), atendida_en = now(),
         atendida_por = auth.uid(), personas_suprimidas = v_n
  where id = p_id;
  return coalesce(v_n, 0);
end $$;

-- Cuántos registros tiene el titular (para que el admin responda la consulta)
create or replace function public.datos_del_titular(p_solicitud uuid)
returns table (persona_id uuid, nombres text, apellidos text, telefono text, lider text, puesto text, origen text,
               creado_en timestamptz, autorizacion_en timestamptz, autorizacion_canal text, eliminado boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.nombres, p.apellidos, p.telefono, li.nombre, pu.nombre, p.origen, p.creado_en,
         p.consentimiento_en, p.consentimiento_canal, p.eliminado_en is not null
  from public.solicitudes_datos s
  join public.personas p on p.organizacion_id = s.organizacion_id and p.cedula = s.cedula
  join public.lideres li on li.id = p.lider_id
  left join public.puestos pu on pu.id = p.puesto_id
  where s.id = p_solicitud and s.organizacion_id = app.org_actual() and app.tiene_rol('admin')
$$;

-- ---------------------------------------------------------------------
-- 4. Registro de acciones sensibles (solo admin)
-- ---------------------------------------------------------------------
create view public.v_acciones_sensibles as
select a.id, a.en, a.accion, a.tabla, a.registro_id, a.despues as detalle,
       coalesce(pf.nombre, 'Sistema') as usuario
from public.auditoria a left join public.perfiles pf on pf.id = a.usuario_id
where a.organizacion_id = app.org_actual() and app.tiene_rol('admin')
  and (a.accion in ('EXPORT', 'VER_COMO', 'SUPRESION')
       or (a.tabla = 'perfiles' and a.accion = 'UPDATE' and a.cambios && array['rol', 'activo', 'verificacion_dos_pasos']));
grant select on public.v_acciones_sensibles to authenticated;

-- ---------------------------------------------------------------------
-- 5. Verificación en dos pasos
-- ---------------------------------------------------------------------
-- Supabase guarda los factores en auth.mfa_factors y pone "aal": "aal2" en
-- la sesión cuando el usuario escribió el código. Si el usuario tiene un
-- factor verificado y la sesión es aal1, no se le entrega ningún dato.
create or replace function app.falta_segundo_paso(p_usuario uuid, p_claims jsonb) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_usuario is null or coalesce(p_claims ->> 'aal', 'aal1') = 'aal2' then return false; end if;
  return exists (select 1 from auth.mfa_factors f where f.user_id = p_usuario and f.status = 'verified');
exception when undefined_table then
  return false;
end $$;

create or replace function public.antes_de_peticion() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_obj    text;
  v_claims jsonb;
  v_real   uuid;
  v_org    uuid;
  v_rol    text;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_real := coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), v_claims ->> 'sub')::uuid;

  if app.falta_segundo_paso(v_real, v_claims) then
    raise exception 'Falta el código de verificación en dos pasos' using errcode = 'insufficient_privilege', hint = 'mfa';
  end if;

  begin
    v_obj := nullif(trim(current_setting('request.headers', true)::json ->> 'x-ver-como'), '');
  exception when others then
    v_obj := null;
  end;
  if v_obj is null then return; end if;

  select organizacion_id into v_org from public.perfiles where id = v_real and activo and rol = 'admin';
  if v_org is null then
    raise exception 'Solo un administrador puede usar "Ver como"' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(current_setting('request.method', true), 'GET') not in ('GET', 'HEAD') then
    raise exception 'Estás en "Ver como": es solo lectura' using errcode = 'read_only_sql_transaction';
  end if;
  perform set_config('transaction_read_only', 'on', true);
  perform set_config('app.ver_como', v_obj, true);

  if v_obj like 'lider:%' then
    if substr(v_obj, 7) !~ '^[0-9a-f-]{36}$' or not exists (
         select 1 from public.lideres where id = substr(v_obj, 7)::uuid and organizacion_id = v_org) then
      raise exception 'Ese líder no es de tu organización' using errcode = 'insufficient_privilege';
    end if;
    perform set_config('app.rol_vista', 'lider', true);
    perform set_config('app.lider_vista', substr(v_obj, 7), true);
    return;
  end if;

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

-- Quién del equipo tiene la verificación activa (para la página Equipo)
create or replace function public.equipo_2fa()
returns table (perfil_id uuid, activa boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.tiene_rol('admin') then return; end if;
  return query
    select pf.id, exists (select 1 from auth.mfa_factors f where f.user_id = pf.id and f.status = 'verified')
    from public.perfiles pf where pf.organizacion_id = app.org_actual();
exception when undefined_table then
  return query select pf.id, false from public.perfiles pf where pf.organizacion_id = app.org_actual();
end $$;

-- ---------------------------------------------------------------------
-- Permisos: el usuario anónimo solo usa los formularios públicos
-- ---------------------------------------------------------------------
revoke execute on all functions in schema app from public;
grant  execute on all functions in schema app to authenticated;
revoke execute on function app.suprimir_titular(uuid, text) from authenticated;
revoke execute on function public.configurar_politica(jsonb), public.atender_solicitud(uuid, text, text, boolean),
  public.datos_del_titular(uuid), public.equipo_2fa(), public.politica_info(text), public.solicitar_datos(text, jsonb) from public;
grant execute on function public.configurar_politica(jsonb), public.atender_solicitud(uuid, text, text, boolean),
  public.datos_del_titular(uuid), public.equipo_2fa() to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
    execute 'grant execute on function public.antes_de_peticion() to anon';
    execute 'grant execute on function public.enlace_info(text) to anon';
    execute 'grant execute on function public.registrar_por_enlace(text, jsonb) to anon';
    execute 'grant execute on function public.politica_info(text) to anon';
    execute 'grant execute on function public.solicitar_datos(text, jsonb) to anon';
  end if;
end $$;
grant execute on function public.enlace_info(text), public.politica_info(text), public.solicitar_datos(text, jsonb) to authenticated;
