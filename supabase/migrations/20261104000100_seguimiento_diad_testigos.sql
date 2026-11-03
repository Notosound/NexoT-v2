-- =====================================================================
-- 0025 · Seguimiento de simpatizantes, Día D, testigos y alertas
-- =====================================================================
-- Ideas rescatadas del piloto (llamadas/confirmados y duplicados) más
-- dos piezas propias de una campaña en Colombia: el Día D (quién ya votó)
-- y los testigos electorales por mesa.

-- ---------------------------------------------------------------------
-- 1. Seguimiento: ¿la persona confirmó su apoyo?
-- ---------------------------------------------------------------------
alter table public.personas
  add column compromiso    text not null default 'sin_contactar'
    check (compromiso in ('sin_contactar', 'confirmado', 'dudoso', 'no_apoya', 'numero_errado')),
  add column compromiso_en timestamptz,
  add column contactos_n   int not null default 0;

create table public.contactos (
  id              bigserial primary key,
  organizacion_id uuid not null references public.organizaciones(id),
  persona_id      uuid not null references public.personas(id),
  resultado       text not null check (resultado in ('confirmado', 'dudoso', 'no_apoya', 'numero_errado', 'no_contesta')),
  canal           text not null default 'llamada' check (canal in ('llamada', 'whatsapp', 'visita', 'otro')),
  nota            text check (length(nota) <= 300),
  por             uuid default auth.uid(),
  en              timestamptz not null default now()
);
create index contactos_persona_idx on public.contactos(persona_id, en desc);
alter table public.contactos enable row level security;
create policy contacto_ver on public.contactos for select to authenticated
  using (organizacion_id = app.org_actual()
         and persona_id in (select id from public.personas where lider_id in (select app.mis_lideres())));
grant select on public.contactos to authenticated;
create trigger auditar after insert or update or delete on public.contactos for each row execute function app.auditar();

-- Registra un contacto y actualiza el estado de la persona.
-- "No contesta" no cambia el estado: solo suma un intento.
create or replace function public.registrar_contacto(p_persona uuid, p_resultado text, p_canal text default 'llamada', p_nota text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  if not app.tiene_rol('admin', 'coordinador', 'lider') then
    raise exception 'Tu rol no puede registrar contactos' using errcode = 'insufficient_privilege';
  end if;
  select organizacion_id into v_org from public.personas
   where id = p_persona and eliminado_en is null and lider_id in (select app.mis_lideres());
  if v_org is null then raise exception 'Esa persona no está en tu lista'; end if;
  insert into public.contactos (organizacion_id, persona_id, resultado, canal, nota)
  values (v_org, p_persona, p_resultado, coalesce(p_canal, 'llamada'), nullif(trim(coalesce(p_nota, '')), ''));
  update public.personas
     set contactos_n = contactos_n + 1,
         compromiso = case when p_resultado = 'no_contesta' then compromiso else p_resultado end,
         compromiso_en = case when p_resultado = 'no_contesta' then compromiso_en else now() end
   where id = p_persona;
  return p_resultado;
end $$;

-- Tasas por líder (solo cifras; el candidato ve todos, el líder el suyo)
create view public.v_seguimiento_lideres as
select li.id as lider_id, li.nombre,
       count(p.id)::int                                                     as total,
       count(p.id) filter (where p.compromiso = 'sin_contactar')::int       as sin_contactar,
       count(p.id) filter (where p.compromiso = 'confirmado')::int          as confirmados,
       count(p.id) filter (where p.compromiso = 'dudoso')::int              as dudosos,
       count(p.id) filter (where p.compromiso = 'no_apoya')::int            as no_apoya,
       count(p.id) filter (where p.compromiso = 'numero_errado')::int       as numero_errado,
       count(p.id) filter (where p.contactos_n > 0)::int                    as contactados
from public.lideres li
left join public.personas p on p.lider_id = li.id and p.eliminado_en is null
where li.organizacion_id = app.org_actual() and li.activo
  and (app.tiene_rol('candidato') or li.id in (select app.mis_lideres()))
group by li.id, li.nombre;
grant select on public.v_seguimiento_lideres to authenticated;

-- ---------------------------------------------------------------------
-- 2. Día D: quién ya votó (lo marca el líder el día de la elección)
-- ---------------------------------------------------------------------
create table public.votos_marcados (
  eleccion_id     uuid not null,
  organizacion_id uuid not null,
  persona_id      uuid not null references public.personas(id),
  marcado_por     uuid default auth.uid(),
  en              timestamptz not null default now(),
  primary key (eleccion_id, persona_id),
  foreign key (eleccion_id, organizacion_id) references public.elecciones(id, organizacion_id)
);
alter table public.votos_marcados enable row level security;
create policy voto_ver on public.votos_marcados for select to authenticated
  using (organizacion_id = app.org_actual()
         and persona_id in (select id from public.personas where lider_id in (select app.mis_lideres())));
grant select on public.votos_marcados to authenticated;
create trigger auditar after insert or update or delete on public.votos_marcados for each row execute function app.auditar();

create or replace function public.marcar_voto(p_eleccion uuid, p_persona uuid, p_voto boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  if not app.tiene_rol('admin', 'coordinador', 'lider') then
    raise exception 'Tu rol no puede marcar votos' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.elecciones where id = p_eleccion and organizacion_id = app.org_actual()) then
    raise exception 'Elección no encontrada';
  end if;
  select organizacion_id into v_org from public.personas
   where id = p_persona and eliminado_en is null and lider_id in (select app.mis_lideres());
  if v_org is null then raise exception 'Esa persona no está en tu lista'; end if;
  if p_voto then
    insert into public.votos_marcados (eleccion_id, organizacion_id, persona_id, marcado_por)
    values (p_eleccion, v_org, p_persona, auth.uid()) on conflict do nothing;
  else
    delete from public.votos_marcados where eleccion_id = p_eleccion and persona_id = p_persona;
  end if;
  return p_voto;
end $$;

-- Avance del Día D por líder y localidad (solo cifras)
create view public.v_dia_d as
select e.id as eleccion_id, li.id as lider_id, li.nombre as lider,
       l.id as localidad_id, coalesce(l.nombre, 'Sin lugar de votación') as localidad,
       count(p.id)::int as personas,
       count(v.persona_id)::int as votaron
from public.elecciones e
join public.personas p on p.organizacion_id = e.organizacion_id and p.eliminado_en is null
join public.lideres li on li.id = p.lider_id
left join public.puestos pu on pu.id = p.puesto_id
left join public.localidades l on l.id = pu.localidad_id
left join public.votos_marcados v on v.eleccion_id = e.id and v.persona_id = p.id
where e.organizacion_id = app.org_actual()
  and (app.tiene_rol('candidato') or p.lider_id in (select app.mis_lideres()))
group by e.id, li.id, li.nombre, l.id, l.nombre;
grant select on public.v_dia_d to authenticated;

-- ---------------------------------------------------------------------
-- 3. Testigos electorales
-- ---------------------------------------------------------------------
-- Un testigo es una persona ya registrada (con celular) asignada a un
-- puesto en una elección; puede cubrir mesas concretas o todo el puesto.
create table public.testigos (
  id              bigserial primary key,
  organizacion_id uuid not null,
  eleccion_id     uuid not null,
  persona_id      uuid not null references public.personas(id),
  puesto_id       int not null references public.puestos(id),
  mesas           int[] not null default '{}',     -- vacío = todo el puesto
  creado_por      uuid default auth.uid(),
  creado_en       timestamptz not null default now(),
  unique (eleccion_id, persona_id),
  foreign key (eleccion_id, organizacion_id) references public.elecciones(id, organizacion_id)
);
alter table public.testigos enable row level security;
create policy testigo_ver on public.testigos for select to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin', 'coordinador'));
grant select on public.testigos to authenticated;
create trigger auditar after insert or update or delete on public.testigos for each row execute function app.auditar();

create or replace function public.asignar_testigo(p_eleccion uuid, p_persona uuid, p_puesto int, p_mesas int[] default '{}')
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_max int; v_tel text;
begin
  if not app.tiene_rol('admin', 'coordinador') then
    raise exception 'Solo administradores y coordinadores asignan testigos' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.elecciones where id = p_eleccion and organizacion_id = app.org_actual()) then
    raise exception 'Elección no encontrada';
  end if;
  select telefono into v_tel from public.personas
   where id = p_persona and organizacion_id = app.org_actual() and eliminado_en is null and lider_id in (select app.mis_lideres());
  if not found then raise exception 'Esa persona no está registrada o no es de tus líderes'; end if;
  if v_tel is null then raise exception 'El testigo necesita un celular para coordinarlo el día de la elección'; end if;
  select max(numero) into v_max from public.mesas where puesto_id = p_puesto;
  if v_max is null then raise exception 'Puesto no encontrado'; end if;
  if exists (select 1 from unnest(coalesce(p_mesas, '{}')) m where m < 1 or m > v_max) then
    raise exception 'Ese puesto tiene mesas de la 1 a la %', v_max;
  end if;
  insert into public.testigos (organizacion_id, eleccion_id, persona_id, puesto_id, mesas)
  values (app.org_actual(), p_eleccion, p_persona, p_puesto, (select coalesce(array_agg(distinct m order by m), '{}') from unnest(coalesce(p_mesas, '{}')) m))
  on conflict (eleccion_id, persona_id) do update set puesto_id = excluded.puesto_id, mesas = excluded.mesas
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.quitar_testigo(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.tiene_rol('admin', 'coordinador') then
    raise exception 'Solo administradores y coordinadores quitan testigos' using errcode = 'insufficient_privilege';
  end if;
  delete from public.testigos where id = p_id and organizacion_id = app.org_actual();
  if not found then raise exception 'Testigo no encontrado'; end if;
end $$;

-- Cobertura: mesas con simpatizantes y si tienen testigo (solo cifras)
create view public.v_testigos_cobertura as
with mesas_sim as (
  select p.organizacion_id, m.puesto_id, m.numero as mesa, count(*)::int as simpatizantes
  from public.personas p join public.mesas m on m.id = p.mesa_id
  where p.eliminado_en is null and p.organizacion_id = app.org_actual()
  group by 1, 2, 3
)
select e.id as eleccion_id, l.id as localidad_id, l.nombre as localidad, pu.id as puesto_id, pu.nombre as puesto,
       ms.mesa, ms.simpatizantes,
       exists (select 1 from public.testigos t
               where t.eleccion_id = e.id and t.puesto_id = ms.puesto_id
                 and (cardinality(t.mesas) = 0 or ms.mesa = any(t.mesas))) as cubierta
from public.elecciones e
join mesas_sim ms on ms.organizacion_id = e.organizacion_id
join public.puestos pu on pu.id = ms.puesto_id
join public.localidades l on l.id = pu.localidad_id
where e.organizacion_id = app.org_actual() and app.tiene_rol('admin', 'coordinador', 'candidato');
grant select on public.v_testigos_cobertura to authenticated;

-- Lista de testigos con sus datos de contacto (solo admin y coordinador)
create view public.v_testigos as
select t.id, t.eleccion_id, t.persona_id, p.nombres, p.apellidos, p.cedula, p.telefono,
       t.puesto_id, pu.nombre as puesto, l.nombre as localidad, t.mesas, li.nombre as lider
from public.testigos t
join public.personas p on p.id = t.persona_id
join public.puestos pu on pu.id = t.puesto_id
join public.localidades l on l.id = pu.localidad_id
left join public.lideres li on li.id = p.lider_id
where t.organizacion_id = app.org_actual() and app.tiene_rol('admin', 'coordinador');
grant select on public.v_testigos to authenticated;

-- ---------------------------------------------------------------------
-- 4. Alertas de datos sospechosos (del piloto: duplicados probables)
-- ---------------------------------------------------------------------
create or replace function app.nombre_clave(n text, a text) returns text
language sql immutable as $$ select regexp_replace(app.normalizar(coalesce(n, '') || ' ' || coalesce(a, '')), '[^a-z ]', '', 'g') $$;

create view public.v_alertas_calidad as
-- Mismo celular en varias personas
select 'celular_repetido'::text as tipo,
       'El celular ' || p.telefono || ' está en ' || count(*) || ' personas' as titulo,
       string_agg(distinct li.nombre, ', ') as lideres,
       count(*)::int as personas,
       array_agg(p.id order by p.creado_en) as persona_ids
from public.personas p join public.lideres li on li.id = p.lider_id
where p.organizacion_id = app.org_actual() and p.eliminado_en is null and p.telefono is not null
  and p.lider_id in (select app.mis_lideres()) and app.tiene_rol('admin', 'coordinador')
group by p.telefono having count(*) >= 2
union all
-- Mismo nombre en el mismo puesto con cédula distinta
select 'nombre_repetido',
       'Mismo nombre en ' || pu.nombre || ': ' || initcap(app.nombre_clave(p.nombres, p.apellidos)),
       string_agg(distinct li.nombre, ', '), count(*)::int, array_agg(p.id order by p.creado_en)
from public.personas p join public.lideres li on li.id = p.lider_id join public.puestos pu on pu.id = p.puesto_id
where p.organizacion_id = app.org_actual() and p.eliminado_en is null
  and p.lider_id in (select app.mis_lideres()) and app.tiene_rol('admin', 'coordinador')
  and length(app.nombre_clave(p.nombres, p.apellidos)) >= 8
group by pu.id, pu.nombre, app.nombre_clave(p.nombres, p.apellidos) having count(*) >= 2
union all
-- Ráfagas: un líder con 15 o más registros manuales en 10 minutos
select 'rafaga',
       li.nombre || ' registró ' || count(*) || ' personas en 10 minutos (' ||
         to_char(date_bin('10 minutes', p.creado_en, timestamptz '2000-01-01') at time zone 'America/Bogota', 'DD/MM HH24:MI') || ')',
       li.nombre, count(*)::int, array_agg(p.id order by p.creado_en)
from public.personas p join public.lideres li on li.id = p.lider_id
where p.organizacion_id = app.org_actual() and p.eliminado_en is null and p.origen = 'manual'
  and p.lider_id in (select app.mis_lideres()) and app.tiene_rol('admin', 'coordinador')
group by li.id, li.nombre, date_bin('10 minutes', p.creado_en, timestamptz '2000-01-01') having count(*) >= 15;
grant select on public.v_alertas_calidad to authenticated;

-- ---------------------------------------------------------------------
-- En vivo: los nuevos datos también avisan
-- ---------------------------------------------------------------------
create trigger en_vivo after insert or update or delete on public.votos_marcados
  for each row execute function app.marcar_actividad();
create trigger en_vivo after insert or update or delete on public.contactos
  for each row execute function app.marcar_actividad();

revoke execute on function public.registrar_contacto(uuid, text, text, text), public.marcar_voto(uuid, uuid, boolean),
  public.asignar_testigo(uuid, uuid, int, int[]), public.quitar_testigo(bigint) from public;
grant execute on function public.registrar_contacto(uuid, text, text, text), public.marcar_voto(uuid, uuid, boolean),
  public.asignar_testigo(uuid, uuid, int, int[]), public.quitar_testigo(bigint) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
    execute 'grant execute on function public.antes_de_peticion() to anon';
    execute 'grant execute on function public.enlace_info(text) to anon';
    execute 'grant execute on function public.registrar_por_enlace(text, jsonb) to anon';
  end if;
end $$;
