-- =====================================================================
-- 0034 · Lectura automática de E14 (idea del piloto)
-- =====================================================================
-- Un lector externo baja los E14, recorta la casilla del candidato y lee
-- el número. El administrador sube el resultado (JSON + recortes):
--   * Lectura clara (confianza ≥ 0,90) en elección con doble digitación:
--     cuenta como PRIMERA digitación (hecha por el "lector automático").
--     Una persona digita la segunda sin ver la lectura; si coinciden, la
--     mesa queda verificada.
--   * Lectura dudosa (o elección con digitación simple): va a la cola de
--     revisión. El digitador ve el recorte, escribe el número y eso cuenta
--     como su digitación.
-- El recorte queda guardado como evidencia de cada mesa.

-- "Usuario" fijo que firma las digitaciones del lector (no es una cuenta)
create or replace function app.lector_e14() returns uuid language sql immutable as
  $$ select '00000000-0000-4000-8000-00000000e14a'::uuid $$;

create table public.e14_lecturas (
  id               bigserial primary key,
  eleccion_id      uuid not null,
  organizacion_id  uuid not null,
  mesa_id          int not null references public.mesas(id),
  votos_leidos     int check (votos_leidos between 0 and 1000),
  alternativa      int check (alternativa between 0 and 1000),   -- otro número posible
  confianza        numeric(4,3) check (confianza between 0 and 1),
  metodo           text,
  documento_url    text,
  recorte          text,                                           -- ruta en el almacenamiento
  estado           text not null default 'por_revisar'
                   check (estado in ('automatica', 'por_revisar', 'revisada', 'descartada')),
  motivo           text,
  revisado_por     uuid,
  revisado_en      timestamptz,
  votos_revisados  int,
  cargado_en       timestamptz not null default now(),
  foreign key (eleccion_id, organizacion_id) references public.elecciones(id, organizacion_id),
  unique (eleccion_id, mesa_id)
);
create index e14_lecturas_cola_idx on public.e14_lecturas(eleccion_id, estado);

alter table public.e14_lecturas enable row level security;
create policy e14_lecturas_ver on public.e14_lecturas for select to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin', 'digitador'));
grant select on public.e14_lecturas to authenticated;
create trigger auditar after insert or update or delete on public.e14_lecturas for each row execute function app.auditar();

-- Las digitaciones del lector se muestran con un nombre claro
create or replace function app.nombre_digitador(p uuid) returns text language sql stable security definer set search_path = public, pg_temp as
  $$ select case when p = app.lector_e14() then 'Lectura automática' else coalesce((select nombre from public.perfiles where id = p), 'Sin nombre') end $$;

-- ---------------------------------------------------------------------
-- Cargar lecturas (admin). Filas: zona, codigo_puesto, (localidad, puesto),
-- mesa, votos, alternativa, confianza, metodo, documento_url, recorte
-- ---------------------------------------------------------------------
create or replace function public.cargar_lecturas_e14(p_eleccion uuid, p_filas jsonb, p_umbral numeric default 0.90)
returns table (fila int, estado text, mensaje text, mesa_id int)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  ele    public.elecciones;
  r      jsonb;
  v_fila int; v_puesto int; v_mesa int; v_votos int; v_alt int; v_conf numeric; v_loc int;
  v_zona text; v_cod text; v_estado text;
begin
  if not app.tiene_rol('admin') then raise exception 'Solo un administrador carga lecturas' using errcode = 'insufficient_privilege'; end if;
  select * into ele from public.elecciones where id = p_eleccion and organizacion_id = app.org_actual();
  if ele.id is null then raise exception 'Elección no encontrada'; end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then raise exception 'El archivo no tiene lecturas'; end if;
  if jsonb_array_length(p_filas) > 30000 then raise exception 'Máximo 30.000 lecturas por carga'; end if;

  for r in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(nullif(r ->> 'fila', '')::int, 0);
    v_puesto := null; v_mesa := null;
    v_zona := app.codigo_oficial(r ->> 'zona');
    v_cod  := app.codigo_oficial(r ->> 'codigo_puesto');
    if v_zona is not null and v_cod is not null then
      select p.id into v_puesto from public.puestos p join public.localidades l on l.id = p.localidad_id
       where l.municipio_id = ele.municipio_id and p.zona = v_zona and p.codigo = v_cod;
    end if;
    if v_puesto is null and r ? 'puesto' then
      v_loc := app.buscar_localidad(ele.municipio_id, r ->> 'localidad');
      if v_loc is not null then
        select s.puesto_id into v_puesto from app.sugerir_puesto(ele.organizacion_id, v_loc, r ->> 'puesto', null) s where s.confianza = 'alta' limit 1;
      end if;
    end if;
    if v_puesto is null then
      fila := v_fila; estado := 'error'; mensaje := format('puesto no encontrado (zona %s, código %s)', coalesce(v_zona, '?'), coalesce(v_cod, '?')); mesa_id := null;
      return next; continue;
    end if;
    select m.id into v_mesa from public.mesas m where m.puesto_id = v_puesto and m.numero = nullif(app.solo_digitos(r ->> 'mesa'), '')::int;
    if v_mesa is null then
      fila := v_fila; estado := 'error'; mensaje := format('la mesa %s no existe en ese puesto', coalesce(r ->> 'mesa', '?')); mesa_id := null;
      return next; continue;
    end if;

    v_votos := case when (r ->> 'votos') ~ '^\d{1,4}$' and (r ->> 'votos')::int <= 1000 then (r ->> 'votos')::int end;
    v_alt   := case when (r ->> 'alternativa') ~ '^\d{1,4}$' and (r ->> 'alternativa')::int <= 1000 then (r ->> 'alternativa')::int end;
    v_conf  := case when (r ->> 'confianza') ~ '^(0(\.\d+)?|1(\.0+)?)$' then (r ->> 'confianza')::numeric end;
    v_estado := case when ele.modo_digitacion = 'doble' and v_votos is not null and coalesce(v_conf, 0) >= p_umbral
                       and (v_alt is null or v_alt = v_votos) then 'automatica' else 'por_revisar' end;

    -- Una mesa ya revisada no se vuelve a abrir con una carga nueva
    if exists (select 1 from public.e14_lecturas l where l.eleccion_id = p_eleccion and l.mesa_id = v_mesa and l.estado = 'revisada') then
      fila := v_fila; estado := 'omitida'; mensaje := 'ya fue revisada por una persona'; mesa_id := v_mesa;
      return next; continue;
    end if;

    insert into public.e14_lecturas as l (eleccion_id, organizacion_id, mesa_id, votos_leidos, alternativa, confianza, metodo, documento_url, recorte, estado, motivo)
    values (p_eleccion, ele.organizacion_id, v_mesa, v_votos, v_alt, v_conf, nullif(r ->> 'metodo', ''), nullif(r ->> 'documento_url', ''),
            nullif(r ->> 'recorte', ''), v_estado,
            case when v_estado = 'automatica' then null
                 when ele.modo_digitacion = 'simple' then 'elección con digitación simple: siempre la confirma una persona'
                 when v_votos is null then 'no se pudo leer el número'
                 when v_alt is not null and v_alt <> v_votos then format('podría ser %s o %s', v_votos, v_alt)
                 else format('lectura poco clara (confianza %s%%)', round(coalesce(v_conf, 0) * 100)) end)
    on conflict (eleccion_id, mesa_id) do update set
      votos_leidos = excluded.votos_leidos, alternativa = excluded.alternativa, confianza = excluded.confianza, metodo = excluded.metodo,
      documento_url = excluded.documento_url, recorte = coalesce(excluded.recorte, l.recorte), estado = excluded.estado,
      motivo = excluded.motivo, cargado_en = now();

    -- Lectura clara: primera digitación firmada por el lector
    delete from public.e14_digitaciones d where d.eleccion_id = p_eleccion and d.mesa_id = v_mesa and d.digitado_por = app.lector_e14();
    if v_estado = 'automatica' then
      insert into public.e14_digitaciones (eleccion_id, organizacion_id, mesa_id, votos, digitado_por)
      values (p_eleccion, ele.organizacion_id, v_mesa, v_votos, app.lector_e14());
    end if;

    fila := v_fila; estado := v_estado; mensaje := null; mesa_id := v_mesa;
    return next;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Revisar una lectura dudosa: lo que escribe la persona es su digitación
-- ---------------------------------------------------------------------
create or replace function public.revisar_lectura_e14(p_lectura bigint, p_votos int) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.e14_lecturas;
begin
  if not app.tiene_rol('admin', 'digitador') then raise exception 'Solo administradores y digitadores revisan lecturas' using errcode = 'insufficient_privilege'; end if;
  select * into l from public.e14_lecturas where id = p_lectura and organizacion_id = app.org_actual() for update;
  if l.id is null then raise exception 'Lectura no encontrada'; end if;
  if l.estado <> 'por_revisar' then raise exception 'Esta mesa ya fue revisada'; end if;
  if p_votos is null or p_votos < 0 or p_votos > 1000 then raise exception 'Escribe un número de votos entre 0 y 1.000'; end if;

  insert into public.e14_digitaciones (eleccion_id, organizacion_id, mesa_id, votos, digitado_por)
  values (l.eleccion_id, l.organizacion_id, l.mesa_id, p_votos, auth.uid())
  on conflict (eleccion_id, mesa_id, digitado_por) do update set votos = excluded.votos, en = now();

  update public.e14_lecturas set estado = 'revisada', revisado_por = auth.uid(), revisado_en = now(), votos_revisados = p_votos
   where id = p_lectura;
  return (select estado from public.e14_resultados where eleccion_id = l.eleccion_id and mesa_id = l.mesa_id);
end $$;

-- Cola de revisión y resumen
create view public.v_e14_lecturas as
select l.id, l.eleccion_id, l.mesa_id, lo.nombre as localidad, pu.nombre as puesto, pu.zona, pu.codigo as codigo_puesto, m.numero as mesa,
       l.votos_leidos, l.alternativa, l.confianza, l.estado, l.motivo, l.recorte, l.documento_url, l.votos_revisados,
       (select count(*) from public.personas p where p.mesa_id = l.mesa_id and p.eliminado_en is null and p.organizacion_id = l.organizacion_id)::int as simpatizantes,
       r.estado as estado_mesa, l.cargado_en
from public.e14_lecturas l
join public.mesas m on m.id = l.mesa_id
join public.puestos pu on pu.id = m.puesto_id
join public.localidades lo on lo.id = pu.localidad_id
left join public.e14_resultados r on r.eleccion_id = l.eleccion_id and r.mesa_id = l.mesa_id
where l.organizacion_id = app.org_actual() and app.tiene_rol('admin', 'digitador');
grant select on public.v_e14_lecturas to authenticated;

-- Recorte de una mesa (para mostrarlo al digitar sin revelar el número leído)
create or replace function public.recorte_mesa(p_eleccion uuid, p_mesa int) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select recorte from public.e14_lecturas
  where eleccion_id = p_eleccion and mesa_id = p_mesa and organizacion_id = app.org_actual() and app.tiene_rol('admin', 'digitador')
$$;

-- Permitir vistas rápidas de la cola
create or replace function public.vista_completa(p_vista text, p_filtro text default '{}', p_orden text default null)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_filtro jsonb := coalesce(nullif(p_filtro, ''), '{}')::jsonb;
  v_where  text := '';
  v_res    jsonb;
  k        text;
begin
  if p_vista not in ('v_demografia', 'v_tendencia_diaria', 'v_avance_lideres', 'v_ubicaciones_por_revisar', 'v_registros_mesa',
                     'v_calidad_lideres', 'v_seguimiento_lideres', 'v_metas_lideres', 'v_dia_d', 'v_testigos', 'v_testigos_cobertura',
                     'v_potencial_puestos', 'v_e14_pendientes', 'v_e14_revision', 'v_e14_localidades', 'v_e14_puestos',
                     'v_e14_lideres', 'v_e14_plantilla', 'v_mis_digitaciones', 'v_e14_lecturas') then
    raise exception 'Vista no permitida: %', p_vista;
  end if;
  if jsonb_typeof(v_filtro) <> 'object' then raise exception 'Filtro no válido'; end if;
  for k in select jsonb_object_keys(v_filtro) loop
    if k not in ('eleccion_id', 'historico_id') then raise exception 'Filtro no permitido: %', k; end if;
    v_where := v_where || (case when v_where = '' then ' where ' else ' and ' end)
               || format('t.%I = %L::uuid', k, v_filtro ->> k);
  end loop;
  if p_orden is not null and p_orden !~ '^[a-z_]+( desc)?(, ?[a-z_]+( desc)?)*$' then
    raise exception 'Orden no válido';
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)%s), ''[]''::jsonb) from public.%I t%s',
                 case when p_orden is null then '' else ' order by ' || p_orden end, p_vista, v_where)
    into v_res;
  return v_res;
end $$;

revoke execute on function public.cargar_lecturas_e14(uuid, jsonb, numeric), public.revisar_lectura_e14(bigint, int), public.recorte_mesa(uuid, int) from public;
grant execute on function public.cargar_lecturas_e14(uuid, jsonb, numeric), public.revisar_lectura_e14(bigint, int), public.recorte_mesa(uuid, int) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.cargar_lecturas_e14(uuid, jsonb, numeric), public.revisar_lectura_e14(bigint, int), public.recorte_mesa(uuid, int) from anon';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Almacenamiento privado de recortes: carpeta por organización
-- (solo en Supabase; el entorno de pruebas no tiene el esquema storage)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('e14', 'e14', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do nothing;
    execute $p$create policy e14_ver on storage.objects for select to authenticated
      using (bucket_id = 'e14' and (storage.foldername(name))[1] = app.org_actual()::text and app.tiene_rol('admin', 'digitador'))$p$;
    execute $p$create policy e14_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'e14' and (storage.foldername(name))[1] = app.org_actual()::text and app.tiene_rol('admin'))$p$;
    execute $p$create policy e14_reemplazar on storage.objects for update to authenticated
      using (bucket_id = 'e14' and (storage.foldername(name))[1] = app.org_actual()::text and app.tiene_rol('admin'))$p$;
  end if;
end $$;

-- En la revisión del admin, la digitación del lector se ve como tal, con su recorte
create or replace view public.v_e14_revision as
select m.eleccion_id, m.mesa_id, m.localidad, m.puesto, m.mesa,
       (select jsonb_agg(jsonb_build_object('votos', d.votos, 'por', app.nombre_digitador(d.digitado_por), 'en', d.en) order by d.en)
          from public.e14_digitaciones d
         where d.eleccion_id = m.eleccion_id and d.mesa_id = m.mesa_id) as digitaciones
from app.e14_mesas_calc m
where m.organizacion_id = app.org_actual()
  and app.tiene_rol('admin')
  and m.estado = 'en_revision';
