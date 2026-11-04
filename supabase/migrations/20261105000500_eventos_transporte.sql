-- =====================================================================
-- 0030 · Eventos con asistencia por QR y transporte el Día D
-- =====================================================================

-- ---------------------------------------------------------------------
-- Eventos: reuniones, caravanas, visitas. Cada uno tiene un QR; quien lo
-- escanea queda como asistente y, si es nuevo, entra a la base con el
-- líder responsable del evento.
-- ---------------------------------------------------------------------
create table public.eventos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references public.organizaciones(id),
  nombre           text not null check (length(trim(nombre)) > 0),
  fecha            timestamptz not null,
  lugar            text,
  localidad_id     int references public.localidades(id),
  lider_id         uuid not null,                       -- a quién quedan asignados los nuevos
  token            text not null unique default app.token_nuevo(),
  activo           boolean not null default true,
  creado_por       uuid default auth.uid(),
  creado_en        timestamptz not null default now(),
  foreign key (lider_id, organizacion_id) references public.lideres(id, organizacion_id)
);
create index eventos_org_idx on public.eventos(organizacion_id, fecha desc);

create table public.asistencias (
  evento_id   uuid not null references public.eventos(id) on delete cascade,
  persona_id  uuid not null references public.personas(id),
  nueva       boolean not null default false,          -- se registró en este evento
  en          timestamptz not null default now(),
  primary key (evento_id, persona_id)
);
create index asistencias_persona_idx on public.asistencias(persona_id);

alter table public.eventos enable row level security;
alter table public.asistencias enable row level security;
-- Eventos: los ve quien ve al líder responsable (y el candidato, solo cifras por la vista)
create policy eventos_ver on public.eventos for select to authenticated
  using (organizacion_id = app.org_actual() and (app.tiene_rol('admin') or lider_id in (select app.mis_lideres())));
-- Asistencias: solo de personas que el usuario ya puede ver
create policy asistencias_ver on public.asistencias for select to authenticated
  using (persona_id in (select id from public.personas));
grant select on public.eventos, public.asistencias to authenticated;

create trigger auditar after insert or update or delete on public.eventos
  for each row execute function app.auditar();

create or replace function public.crear_evento(p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_lider uuid := nullif(p ->> 'lider_id', '')::uuid;
begin
  if not app.tiene_rol('admin', 'coordinador') then raise exception 'Solo administradores y coordinadores crean eventos' using errcode = 'insufficient_privilege'; end if;
  if length(trim(coalesce(p ->> 'nombre', ''))) = 0 then raise exception 'Ponle un nombre al evento'; end if;
  if nullif(p ->> 'fecha', '') is null then raise exception 'Elige la fecha y la hora'; end if;
  if v_lider is null or v_lider not in (select app.mis_lideres()) then raise exception 'Elige el líder al que quedarán asignadas las personas nuevas'; end if;
  insert into public.eventos (organizacion_id, nombre, fecha, lugar, localidad_id, lider_id)
  values (app.org_actual(), trim(p ->> 'nombre'), (p ->> 'fecha')::timestamptz, nullif(trim(coalesce(p ->> 'lugar', '')), ''),
          nullif(p ->> 'localidad_id', '')::int, v_lider)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cerrar_evento(p_id uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.tiene_rol('admin', 'coordinador') then raise exception 'Sin permiso' using errcode = 'insufficient_privilege'; end if;
  update public.eventos set activo = p_activo
   where id = p_id and organizacion_id = app.org_actual() and (app.tiene_rol('admin') or lider_id in (select app.mis_lideres()));
  if not found then raise exception 'Evento no encontrado'; end if;
end $$;

-- Resumen de eventos (cifras; el candidato ve todos)
create view public.v_eventos as
select e.id, e.nombre, e.fecha, e.lugar, e.activo, e.token, e.lider_id, li.nombre as lider, lo.nombre as localidad,
       count(a.persona_id)::int as asistentes,
       count(a.persona_id) filter (where a.nueva)::int as nuevos
from public.eventos e
join public.lideres li on li.id = e.lider_id
left join public.localidades lo on lo.id = e.localidad_id
left join public.asistencias a on a.evento_id = e.id
where e.organizacion_id = app.org_actual()
  and (app.tiene_rol('admin', 'candidato') or e.lider_id in (select app.mis_lideres()))
group by e.id, li.nombre, lo.nombre;
grant select on public.v_eventos to authenticated;

-- Formulario público del evento
create or replace function public.evento_info(p_token text)
returns table (evento text, campana text, fecha timestamptz, lugar text, slug text)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.nombre, o.nombre, e.fecha, e.lugar, o.slug
  from public.eventos e join public.organizaciones o on o.id = e.organizacion_id
  where e.token = p_token and e.activo and o.activa
$$;

create or replace function public.registrar_asistencia(p_token text, p jsonb) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ev       public.eventos;
  v_origen text;
  v_ced    text := regexp_replace(coalesce(p ->> 'cedula', ''), '\D', '', 'g');
  v_tel    text := regexp_replace(coalesce(p ->> 'telefono', ''), '\D', '', 'g');
  v_edad   int := nullif(p ->> 'edad', '')::int;
  v_persona uuid;
begin
  select * into ev from public.eventos where token = p_token and activo;
  if ev.id is null then raise exception 'Este evento ya no recibe asistencias.'; end if;

  begin
    v_origen := split_part(coalesce(current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
                                    current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then v_origen := null; end;
  -- En un evento muchos usan la misma red (wifi del salón): límite más alto por conexión
  if (select count(*) from app.enlace_intentos where token = 'evento:' || p_token and en > now() - interval '1 day') >= 2000
     or (v_origen <> '' and (select count(*) from app.enlace_intentos where token = 'evento:' || p_token and origen = v_origen and en > now() - interval '1 hour') >= 300) then
    raise exception 'Demasiados registros seguidos. Intenta de nuevo en un rato.';
  end if;
  insert into app.enlace_intentos(token, origen) values ('evento:' || p_token, nullif(v_origen, ''));

  if v_ced !~ '^[0-9]{5,10}$' then raise exception 'Revisa la cédula: solo números, entre 5 y 10 dígitos.'; end if;
  if coalesce((p ->> 'acepta')::boolean, false) is not true then raise exception 'Para registrarte debes aceptar el tratamiento de tus datos.'; end if;

  select id into v_persona from public.personas where organizacion_id = ev.organizacion_id and cedula = v_ced and eliminado_en is null;
  if v_persona is not null then
    insert into public.asistencias (evento_id, persona_id) values (ev.id, v_persona) on conflict do nothing;
    return 'recibido';
  end if;

  -- Persona nueva: se pide lo mismo que en el formulario del líder
  if length(trim(coalesce(p ->> 'nombres', ''))) = 0 then raise exception 'Escribe tu nombre.'; end if;
  if v_tel !~ '^3[0-9]{9}$' then raise exception 'El celular debe tener 10 dígitos y empezar por 3.'; end if;
  if coalesce(p ->> 'sexo', '') not in ('femenino','masculino','otro','no_informa') then raise exception 'Elige una opción en sexo.'; end if;
  if v_edad is null or v_edad < 18 or v_edad > 120 then raise exception 'Escribe tu edad (debes ser mayor de edad).'; end if;

  insert into public.personas (organizacion_id, lider_id, cedula, nombres, apellidos, sexo, edad_declarada, edad_declarada_en,
    telefono, origen, consentimiento_version, consentimiento_en, consentimiento_canal)
  values (ev.organizacion_id, ev.lider_id, v_ced, trim(p ->> 'nombres'), nullif(trim(coalesce(p ->> 'apellidos', '')), ''),
    p ->> 'sexo', v_edad, current_date, v_tel, 'formulario', coalesce(p ->> 'aviso_version', 'evento'), now(), 'formulario')
  returning id into v_persona;
  insert into public.asistencias (evento_id, persona_id, nueva) values (ev.id, v_persona, true);
  return 'recibido';
end $$;


-- ---------------------------------------------------------------------
-- Transporte el Día D
-- ---------------------------------------------------------------------
alter table public.personas add column necesita_transporte boolean not null default false;

create or replace function public.marcar_transporte(p_persona uuid, p_necesita boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.tiene_rol('admin', 'coordinador', 'lider') then raise exception 'Tu rol no puede cambiar esto' using errcode = 'insufficient_privilege'; end if;
  update public.personas set necesita_transporte = p_necesita
   where id = p_persona and eliminado_en is null and lider_id in (select app.mis_lideres());
  if not found then raise exception 'Esa persona no está en tu lista'; end if;
end $$;

revoke execute on function public.crear_evento(jsonb), public.cerrar_evento(uuid, boolean), public.evento_info(text),
  public.registrar_asistencia(text, jsonb), public.marcar_transporte(uuid, boolean) from public;
grant execute on function public.crear_evento(jsonb), public.cerrar_evento(uuid, boolean), public.evento_info(text),
  public.registrar_asistencia(text, jsonb), public.marcar_transporte(uuid, boolean) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
    execute 'grant execute on function public.antes_de_peticion() to anon';
    execute 'grant execute on function public.enlace_info(text) to anon';
    execute 'grant execute on function public.registrar_por_enlace(text, jsonb) to anon';
    execute 'grant execute on function public.politica_info(text) to anon';
    execute 'grant execute on function public.solicitar_datos(text, jsonb) to anon';
    execute 'grant execute on function public.evento_info(text) to anon';
    execute 'grant execute on function public.registrar_asistencia(text, jsonb) to anon';
  end if;
end $$;
