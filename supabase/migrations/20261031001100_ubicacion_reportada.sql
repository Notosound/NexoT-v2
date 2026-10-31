-- =====================================================================
-- 0011 · Puesto "Otro": ubicación reportada, direcciones y alias aprendidos
--         + sexo y edad obligatorios en registros nuevos
-- =====================================================================
-- Problema: la consulta de la Registraduría a veces muestra el puesto con
-- un nombre distinto al del listado oficial, y no existe una lista de
-- nombres alternativos.
--
-- Solución (las dos ideas a la vez):
--   1. En el registro, si el puesto no aparece en la lista, se elige
--      "Otro" y se escribe el nombre tal como le sale al votante, la
--      dirección del puesto (opcional) y la mesa.
--   2. El sistema intenta ubicarlo solo:
--        a) nombre oficial exacto          (sin tildes ni mayúsculas)
--        b) alias aprendido                (ver punto 3)
--        c) dirección del puesto oficial   (normalizada: "Cl 46 Sur # 27-12"
--                                           = "Calle 46 sur No. 27 - 12")
--      Si no hay coincidencia segura, queda "por revisar".
--   3. Cuando el admin resuelve un caso, el nombre escrito se guarda como
--      ALIAS de ese puesto y se aplica a todas las personas pendientes con
--      el mismo nombre. La lista de nombres alternativos se construye sola.

-- ---------------------------------------------------------------------
-- Direcciones colombianas: forma canónica y clave de comparación
-- ---------------------------------------------------------------------
create or replace function app.normalizar_direccion(t text) returns text
language plpgsql immutable as $$
declare s text;
begin
  s := app.normalizar(t);
  if s is null then return null; end if;
  s := replace(replace(replace(s, 'n°', ' '), 'nº', ' '), '#', ' ');
  s := regexp_replace(s, '[.,;:\-_/()]', ' ', 'g');
  s := regexp_replace(s, '\m(no|nro|num|numero)\M', ' ', 'g');
  -- Tipos de vía compuestos primero, luego simples
  s := regexp_replace(s, '\m(avenida|av|avda)\s+(calle|cl|cll|clle)\M', 'ac', 'g');
  s := regexp_replace(s, '\m(avenida|av|avda)\s+(carrera|cra|kr|kra|cr|carr)\M', 'ak', 'g');
  s := regexp_replace(s, '\m(calle|cl|cll|clle|call)\M', 'cl', 'g');
  s := regexp_replace(s, '\m(carrera|cra|kr|kra|cr|carr|krr|cara)\M', 'kr', 'g');
  s := regexp_replace(s, '\m(diagonal|dg|diag)\M', 'dg', 'g');
  s := regexp_replace(s, '\m(transversal|tv|tr|trans|transv|trv)\M', 'tv', 'g');
  s := regexp_replace(s, '\m(avenida|avda)\M', 'av', 'g');
  -- "12 D" → "12d" (letra suelta pegada al número)
  s := regexp_replace(s, '(\d+)\s+([a-z])\M', '\1\2', 'g');
  return nullif(regexp_replace(trim(s), '\s+', ' ', 'g'), '');
end $$;

-- Clave: tipo de vía + número + cruce + placa (+ sur/este).
-- Ignora lo que venga después ("barrio Quiroga", "local 3"...).
create or replace function app.clave_direccion(t text, p_con_placa boolean default true) returns text
language plpgsql immutable as $$
declare
  tok    text[] := string_to_array(app.normalizar_direccion(t), ' ');
  i      int := 1;
  via    text; n1 text; n2 text; n3 text;
  sufijo text := '';
begin
  if tok is null then return null; end if;
  while i <= cardinality(tok) and tok[i] not in ('cl','kr','ac','ak','dg','tv','av') loop i := i + 1; end loop;
  if i > cardinality(tok) then return null; end if;
  via := tok[i]; i := i + 1;
  -- número principal (con "bis" opcional)
  if i <= cardinality(tok) and tok[i] ~ '^\d' then n1 := tok[i]; i := i + 1; else return null; end if;
  if i <= cardinality(tok) and tok[i] = 'bis' then n1 := n1 || 'bis'; i := i + 1; end if;
  -- sur / este pueden ir antes o después del cruce
  while i <= cardinality(tok) and tok[i] !~ '^\d' loop
    if tok[i] in ('sur','este') then sufijo := sufijo || ' ' || tok[i]; end if;
    i := i + 1;
  end loop;
  if i <= cardinality(tok) then n2 := tok[i]; i := i + 1; else return null; end if;
  if i <= cardinality(tok) and tok[i] = 'bis' then n2 := n2 || 'bis'; i := i + 1; end if;
  while i <= cardinality(tok) and tok[i] !~ '^\d' loop
    if tok[i] in ('sur','este') then sufijo := sufijo || ' ' || tok[i]; end if;
    i := i + 1;
  end loop;
  if i <= cardinality(tok) then n3 := tok[i]; i := i + 1; end if;
  while i <= cardinality(tok) loop
    if tok[i] in ('sur','este') then sufijo := sufijo || ' ' || tok[i]; end if;
    i := i + 1;
  end loop;
  if p_con_placa and n3 is null then return null; end if;
  return via || ' ' || n1 || ' ' || n2 || case when p_con_placa then ' ' || n3 else '' end
         || coalesce((select string_agg(distinct x, ' ' order by x) from unnest(string_to_array(trim(sufijo), ' ')) x where x <> ''), '') ;
end $$;

-- Claves precalculadas de los puestos oficiales
alter table public.puestos
  add column direccion_clave       text generated always as (app.clave_direccion(direccion, true))  stored,
  add column direccion_clave_cuadra text generated always as (app.clave_direccion(direccion, false)) stored;
create index puestos_direccion_clave_idx on public.puestos(direccion_clave);
create index puestos_direccion_cuadra_idx on public.puestos(direccion_clave_cuadra);

-- ---------------------------------------------------------------------
-- Alias aprendidos (por organización)
-- ---------------------------------------------------------------------
create table public.puestos_alias (
  id               bigserial primary key,
  organizacion_id  uuid not null references public.organizaciones(id),
  localidad_id     int not null references public.localidades(id),
  alias            text not null,                     -- normalizado con app.normalizar
  puesto_id        int not null references public.puestos(id),
  creado_por       uuid default auth.uid(),
  creado_en        timestamptz not null default now(),
  unique (organizacion_id, localidad_id, alias),
  check (alias = app.normalizar(alias))
);
create trigger auditar after insert or update or delete on public.puestos_alias
  for each row execute function app.auditar();

-- ---------------------------------------------------------------------
-- Sugerencia de puesto
--   alta  → se asigna automáticamente
--   media → solo se sugiere al admin (misma cuadra, nombre parecido...)
-- ---------------------------------------------------------------------
create or replace function app.sugerir_puesto(p_org uuid, p_localidad int, p_nombre text, p_direccion text)
returns table (puesto_id int, metodo text, confianza text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_nombre text := app.normalizar(p_nombre);
  v_clave  text := app.clave_direccion(p_direccion, true);
  v_cuadra text := app.clave_direccion(p_direccion, false);
  v_ids    int[];
begin
  -- a) nombre oficial exacto
  if v_nombre is not null then
    select array_agg(p.id) into v_ids from public.puestos p
    where app.normalizar(p.nombre) = v_nombre and (p_localidad is null or p.localidad_id = p_localidad);
    if cardinality(v_ids) = 1 then return query select v_ids[1], 'nombre_oficial', 'alta'; return; end if;

    -- b) alias aprendido
    select array_agg(distinct a.puesto_id) into v_ids from public.puestos_alias a
    where a.organizacion_id = p_org and a.alias = v_nombre and (p_localidad is null or a.localidad_id = p_localidad);
    if cardinality(v_ids) = 1 then return query select v_ids[1], 'alias', 'alta'; return; end if;
  end if;

  -- c) dirección exacta (vía, número, cruce y placa)
  if v_clave is not null then
    select array_agg(p.id) into v_ids from public.puestos p
    where p.direccion_clave = v_clave and (p_localidad is null or p.localidad_id = p_localidad);
    if cardinality(v_ids) = 1 then return query select v_ids[1], 'direccion', 'alta'; return; end if;
  end if;

  -- d) misma cuadra (sin placa): solo sugerencia
  if v_cuadra is not null then
    select array_agg(p.id) into v_ids from public.puestos p
    where p.direccion_clave_cuadra = v_cuadra and (p_localidad is null or p.localidad_id = p_localidad);
    if cardinality(v_ids) = 1 then return query select v_ids[1], 'misma_cuadra', 'media'; return; end if;
  end if;

  -- e) nombre parecido dentro de la localidad: solo sugerencia
  if v_nombre is not null and p_localidad is not null then
    return query
      select p.id, 'nombre_parecido', 'media' from public.puestos p
      where p.localidad_id = p_localidad
        and (app.normalizar(p.nombre) like '%' || v_nombre || '%' or v_nombre like '%' || app.normalizar(p.nombre) || '%')
        and length(app.normalizar(p.nombre)) >= 5
      order by abs(length(app.normalizar(p.nombre)) - length(v_nombre))
      limit 1;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Personas: datos de ubicación reportados por el votante
-- ---------------------------------------------------------------------
alter table public.personas
  add column localidad_votacion_id int references public.localidades(id),
  add column puesto_reportado      text,          -- nombre tal como le sale al votante ("Otro")
  add column direccion_reportada   text,          -- dirección del puesto, si la conoce
  add column mesa_reportada        int check (mesa_reportada > 0),
  add column ubicacion_metodo      text check (ubicacion_metodo in
              ('lista_oficial','nombre_oficial','alias','direccion','revision_admin')),
  add column ubicacion_estado      text not null default 'sin_dato' check (ubicacion_estado in
              ('completa','sin_mesa','por_revisar','sin_dato'));

create index personas_por_revisar_idx on public.personas(organizacion_id, ubicacion_estado) where eliminado_en is null;

-- Sexo y edad son obligatorios en todo registro nuevo. Solo las listas
-- importadas (que pueden no traerlos) quedan exentas.
alter table public.personas add constraint personas_sexo_edad_obligatorios
  check (origen = 'importacion'
         or (sexo is not null and (fecha_nacimiento is not null or edad_declarada is not null)));

-- Ubicación automática al registrar o al cambiar lo reportado.
-- Corre antes de personas_validar (orden alfabético de triggers).
create or replace function app.ubicar_persona() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s record;
begin
  if tg_op = 'UPDATE'
     and new.puesto_id is not distinct from old.puesto_id
     and new.mesa_id is not distinct from old.mesa_id
     and new.puesto_reportado is not distinct from old.puesto_reportado
     and new.direccion_reportada is not distinct from old.direccion_reportada
     and new.mesa_reportada is not distinct from old.mesa_reportada
     and new.localidad_votacion_id is not distinct from old.localidad_votacion_id then
    return new;
  end if;

  -- Puesto desde la mesa, si la mesa viene dada
  if new.mesa_id is not null then
    new.puesto_id := coalesce(new.puesto_id, (select puesto_id from public.mesas where id = new.mesa_id));
  end if;

  -- "Otro": intentar ubicar automáticamente
  if new.puesto_id is null and (new.puesto_reportado is not null or new.direccion_reportada is not null) then
    select * into s from app.sugerir_puesto(new.organizacion_id, new.localidad_votacion_id,
                                            new.puesto_reportado, new.direccion_reportada) limit 1;
    if s.confianza = 'alta' then
      new.puesto_id := s.puesto_id;
      new.ubicacion_metodo := s.metodo;
    end if;
  elsif new.puesto_id is not null and new.ubicacion_metodo is null then
    new.ubicacion_metodo := 'lista_oficial';
  end if;

  -- Mesa a partir del número reportado
  if new.puesto_id is not null and new.mesa_id is null and new.mesa_reportada is not null then
    new.mesa_id := (select id from public.mesas where puesto_id = new.puesto_id and numero = new.mesa_reportada);
  end if;
  if new.mesa_id is not null and new.mesa_reportada is null then
    new.mesa_reportada := (select numero from public.mesas where id = new.mesa_id);
  end if;

  -- La localidad de votación sale del puesto cuando se conoce
  if new.puesto_id is not null then
    new.localidad_votacion_id := (select localidad_id from public.puestos where id = new.puesto_id);
  end if;

  new.ubicacion_estado := case
    when new.puesto_id is not null and new.mesa_id is not null then 'completa'
    when new.puesto_id is not null then 'sin_mesa'
    when new.puesto_reportado is not null or new.direccion_reportada is not null then 'por_revisar'
    else 'sin_dato'
  end;
  return new;
end $$;

create trigger personas_ubicar before insert or update on public.personas
  for each row execute function app.ubicar_persona();

-- ---------------------------------------------------------------------
-- Resolución por el admin: asigna el puesto, aprende el alias y lo aplica
-- a todas las personas pendientes con el mismo nombre reportado.
-- Devuelve cuántas personas quedaron ubicadas.
-- ---------------------------------------------------------------------
create or replace function app.resolver_ubicacion(p_persona uuid, p_puesto int, p_guardar_alias boolean default true)
returns int language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  per    public.personas;
  v_loc  int;
  n      int;
begin
  if not app.tiene_rol('admin') then
    raise exception 'Solo un administrador puede resolver ubicaciones' using errcode = 'insufficient_privilege';
  end if;
  select * into per from public.personas where id = p_persona and eliminado_en is null;
  if per.id is null then raise exception 'Persona % no encontrada', p_persona; end if;
  select localidad_id into v_loc from public.puestos where id = p_puesto;
  if v_loc is null then raise exception 'Puesto % no existe', p_puesto; end if;

  update public.personas set puesto_id = p_puesto, mesa_id = null, ubicacion_metodo = 'revision_admin'
  where id = p_persona;

  if p_guardar_alias and app.normalizar(per.puesto_reportado) is not null
     and app.normalizar(per.puesto_reportado) <> (select app.normalizar(nombre) from public.puestos where id = p_puesto) then
    insert into public.puestos_alias (organizacion_id, localidad_id, alias, puesto_id)
    values (per.organizacion_id, v_loc, app.normalizar(per.puesto_reportado), p_puesto)
    on conflict (organizacion_id, localidad_id, alias) do update set puesto_id = excluded.puesto_id;

    update public.personas set puesto_id = p_puesto, ubicacion_metodo = 'alias'
    where organizacion_id = per.organizacion_id and eliminado_en is null
      and ubicacion_estado = 'por_revisar' and id <> p_persona
      and app.normalizar(puesto_reportado) = app.normalizar(per.puesto_reportado)
      and (localidad_votacion_id is null or localidad_votacion_id = v_loc);
    get diagnostics n = row_count;
  end if;
  return 1 + coalesce(n, 0);
end $$;

-- ---------------------------------------------------------------------
-- Bandeja de revisión: agrupada por lo que escribieron, con sugerencia
-- ---------------------------------------------------------------------
create view public.v_ubicaciones_por_revisar as
select g.localidad_id, l.nombre as localidad, g.puesto_reportado, g.direccion_reportada,
       g.personas, g.persona_ejemplo,
       s.puesto_id as sugerencia_puesto_id, pu.nombre as sugerencia_puesto,
       pu.direccion as sugerencia_direccion, s.metodo as sugerencia_metodo
from (
  select localidad_votacion_id as localidad_id,
         min(puesto_reportado) as puesto_reportado,
         min(direccion_reportada) as direccion_reportada,
         count(*)::int as personas,
         (array_agg(id order by creado_en))[1] as persona_ejemplo,
         organizacion_id
  from public.personas
  where eliminado_en is null and ubicacion_estado = 'por_revisar'
  group by organizacion_id, localidad_votacion_id, app.normalizar(puesto_reportado), app.clave_direccion(direccion_reportada, true)
) g
left join public.localidades l on l.id = g.localidad_id
left join lateral app.sugerir_puesto(g.organizacion_id, g.localidad_id, g.puesto_reportado, g.direccion_reportada) s on true
left join public.puestos pu on pu.id = s.puesto_id
where g.organizacion_id = app.org_actual() and app.tiene_rol('admin');

grant select on public.v_ubicaciones_por_revisar to authenticated;

alter table public.puestos_alias enable row level security;
create policy alias_ver on public.puestos_alias for select to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin'));
create policy alias_admin on public.puestos_alias for all to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin'))
  with check (organizacion_id = app.org_actual() and app.tiene_rol('admin'));
grant select, insert, update, delete on public.puestos_alias to authenticated;
grant usage on all sequences in schema public to authenticated;

revoke execute on all functions in schema app from public;
grant  execute on all functions in schema app to authenticated;
