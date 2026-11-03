-- =====================================================================
-- 0027 · Resultados históricos y potencial por puesto
-- =====================================================================
-- Se cargan los votos de una elección anterior (del candidato o del
-- partido) por puesto o por mesa, desde un Excel con los resultados
-- públicos de la Registraduría. Se cruzan con los simpatizantes de hoy
-- para ver dónde la campaña es fuerte, dónde hay votos por ganar y
-- dónde todavía faltan registros.

create table public.historicos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references public.organizaciones(id),
  nombre           text not null check (length(trim(nombre)) > 0),
  anio             int check (anio between 1990 and 2100),
  cargado_en       timestamptz not null default now(),
  cargado_por      uuid default auth.uid(),
  unique (organizacion_id, nombre)
);

create table public.historico_puestos (
  historico_id uuid not null references public.historicos(id) on delete cascade,
  puesto_id    int not null references public.puestos(id),
  votos        int not null check (votos >= 0),          -- votos del candidato / partido de referencia
  validos      int check (validos >= 0),                 -- votos válidos del puesto (opcional)
  primary key (historico_id, puesto_id),
  check (validos is null or validos >= votos)
);

alter table public.historicos enable row level security;
alter table public.historico_puestos enable row level security;
create policy historicos_ver on public.historicos for select to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin', 'coordinador', 'candidato'));
create policy historico_puestos_ver on public.historico_puestos for select to authenticated
  using (historico_id in (select id from public.historicos where organizacion_id = app.org_actual())
         and app.tiene_rol('admin', 'coordinador', 'candidato'));
grant select on public.historicos, public.historico_puestos to authenticated;

create trigger auditar after insert or update or delete on public.historicos
  for each row execute function app.auditar();

-- Importación: revisa cada fila; si p_confirmar, guarda (reemplaza si ya
-- existía una carga con el mismo nombre). Acepta filas por puesto o por mesa.
create or replace function public.importar_historico(p_nombre text, p_anio int, p_filas jsonb, p_confirmar boolean default false)
returns table (fila int, estado text, mensaje text, puesto_id int, votos int)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  r jsonb;
  v_org uuid := app.org_actual();
  v_mun int := (select id from public.municipios where divipola = '11001');
  v_fila int; v_puesto int; v_loc int; v_votos int; v_validos int; v_mesa int;
  v_zona text; v_cod text; v_txt text; v_clave text;
  vistas text[] := '{}';
  v_hist uuid;
begin
  if not app.tiene_rol('admin') then
    raise exception 'Solo un administrador carga resultados históricos' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'Ponle un nombre a la carga (por ejemplo: Senado 2022)'; end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then raise exception 'El archivo no tiene filas'; end if;
  if jsonb_array_length(p_filas) > 40000 then raise exception 'Máximo 40.000 filas por archivo'; end if;

  create temp table if not exists _hist (puesto_id int primary key, votos int not null, validos int, con_validos boolean not null) on commit drop;
  truncate _hist;

  for r in select * from jsonb_array_elements(p_filas) loop
    v_fila := nullif(r ->> 'fila', '')::int;
    v_puesto := null; v_votos := null; v_validos := null;

    v_txt := regexp_replace(coalesce(r ->> 'votos', ''), '[\s.,]', '', 'g');
    if v_txt = '' then
      fila := v_fila; estado := 'vacia'; mensaje := 'sin votos (se ignora)'; puesto_id := null; votos := null; return next; continue;
    end if;
    if v_txt !~ '^\d{1,7}$' then
      fila := v_fila; estado := 'error'; mensaje := format('votos inválidos: "%s"', r ->> 'votos'); puesto_id := null; votos := null; return next; continue;
    end if;
    v_votos := v_txt::int;
    v_txt := regexp_replace(coalesce(r ->> 'validos', ''), '[\s.,]', '', 'g');
    if v_txt <> '' then
      if v_txt !~ '^\d{1,8}$' or v_txt::int < v_votos then
        fila := v_fila; estado := 'error'; mensaje := format('votos válidos inválidos: "%s" (deben ser al menos los votos)', r ->> 'validos');
        puesto_id := null; votos := v_votos; return next; continue;
      end if;
      v_validos := v_txt::int;
    end if;

    v_zona := app.codigo_oficial(r ->> 'zona');
    v_cod  := app.codigo_oficial(r ->> 'codigo_puesto');
    if v_zona is not null and v_cod is not null then
      select p.id into v_puesto from public.puestos p join public.localidades l on l.id = p.localidad_id
       where l.municipio_id = v_mun and p.zona = v_zona and p.codigo = v_cod;
    end if;
    if v_puesto is null then
      v_loc := app.buscar_localidad(v_mun, r ->> 'localidad');
      if v_loc is not null then
        select s.puesto_id into v_puesto from app.sugerir_puesto(v_org, v_loc, r ->> 'puesto', null) s where s.confianza = 'alta' limit 1;
      end if;
    end if;
    if v_puesto is null then
      fila := v_fila; estado := 'error'; puesto_id := null; votos := v_votos;
      mensaje := case when v_zona is not null and v_cod is not null then format('no existe el puesto con zona %s y código %s', v_zona, v_cod)
                      else format('puesto no encontrado: "%s" en "%s"', coalesce(r ->> 'puesto', ''), coalesce(r ->> 'localidad', '')) end;
      return next; continue;
    end if;

    -- Repetidos: por mesa si viene la mesa, si no por puesto
    v_mesa := nullif(app.solo_digitos(r ->> 'mesa'), '')::int;
    v_clave := v_puesto || ':' || coalesce(v_mesa::text, '*');
    if v_clave = any(vistas) or (v_mesa is null and exists (select 1 from unnest(vistas) x where x like v_puesto || ':%'))
       or (v_mesa is not null and (v_puesto || ':*') = any(vistas)) then
      fila := v_fila; estado := 'error'; mensaje := 'fila repetida (mismo puesto o misma mesa)'; puesto_id := v_puesto; votos := v_votos;
      return next; continue;
    end if;
    vistas := vistas || v_clave;

    insert into _hist as h values (v_puesto, v_votos, v_validos, v_validos is not null)
    on conflict (puesto_id) do update set votos = h.votos + excluded.votos,
      validos = case when h.con_validos and excluded.con_validos then h.validos + excluded.validos end,
      con_validos = h.con_validos and excluded.con_validos;
    fila := v_fila; estado := 'ok'; mensaje := null; puesto_id := v_puesto; votos := v_votos;
    return next;
  end loop;

  if p_confirmar then
    if not exists (select 1 from _hist) then raise exception 'No hay filas válidas para guardar'; end if;
    insert into public.historicos (organizacion_id, nombre, anio) values (v_org, trim(p_nombre), p_anio)
    on conflict (organizacion_id, nombre) do update set anio = excluded.anio, cargado_en = now(), cargado_por = auth.uid()
    returning id into v_hist;
    delete from public.historico_puestos where historico_id = v_hist;
    insert into public.historico_puestos (historico_id, puesto_id, votos, validos)
    select v_hist, h.puesto_id, h.votos, h.validos from _hist h;
  end if;
end $$;

create or replace function public.eliminar_historico(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.tiene_rol('admin') then raise exception 'Solo un administrador puede borrar cargas' using errcode = 'insufficient_privilege'; end if;
  delete from public.historicos where id = p_id and organizacion_id = app.org_actual();
end $$;

-- Resumen de cada carga
create view public.v_historicos as
select h.id, h.nombre, h.anio, h.cargado_en, count(hp.puesto_id)::int as puestos,
       coalesce(sum(hp.votos), 0)::int as votos, sum(hp.validos)::int as validos
from public.historicos h left join public.historico_puestos hp on hp.historico_id = h.id
where h.organizacion_id = app.org_actual() and app.tiene_rol('admin', 'coordinador', 'candidato')
group by h.id;
grant select on public.v_historicos to authenticated;

-- Potencial por puesto: lo que se sacó antes frente a lo que hay hoy.
-- Incluye puestos con votos históricos o con simpatizantes registrados.
create view public.v_potencial_puestos as
with hoy as (
  select p.puesto_id, count(*)::int as simpatizantes,
         count(*) filter (where p.compromiso = 'confirmado')::int as confirmados
  from public.personas p
  where p.organizacion_id = app.org_actual() and p.eliminado_en is null and p.puesto_id is not null
    and p.lider_id in (select app.mis_lideres())
  group by p.puesto_id
)
select h.id as historico_id, pu.localidad_id, l.nombre as localidad, pu.id as puesto_id, pu.nombre as puesto,
       pu.censo_total as habilitados, coalesce(hp.votos, 0) as votos_antes, hp.validos as validos_antes,
       coalesce(hoy.simpatizantes, 0) as simpatizantes, coalesce(hoy.confirmados, 0) as confirmados
from public.historicos h
cross join public.puestos pu
join public.localidades l on l.id = pu.localidad_id
left join public.historico_puestos hp on hp.historico_id = h.id and hp.puesto_id = pu.id
left join hoy on hoy.puesto_id = pu.id
where h.organizacion_id = app.org_actual() and app.tiene_rol('admin', 'coordinador', 'candidato')
  and (hp.puesto_id is not null or hoy.puesto_id is not null);
grant select on public.v_potencial_puestos to authenticated;

revoke execute on function public.importar_historico(text, int, jsonb, boolean), public.eliminar_historico(uuid) from public;
grant execute on function public.importar_historico(text, int, jsonb, boolean), public.eliminar_historico(uuid) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.importar_historico(text, int, jsonb, boolean), public.eliminar_historico(uuid) from anon';
  end if;
end $$;
