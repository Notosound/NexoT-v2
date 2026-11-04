-- =====================================================================
-- 0032 · Rendimiento con decenas de miles de registros
-- =====================================================================
-- PostgREST entrega como máximo 1.000 filas por petición, y al paginar una
-- vista agregada la base la recalcula completa en cada página. Con 40.000
-- personas eso son muchos segundos. vista_completa() calcula la vista UNA
-- vez y la devuelve entera. Corre con los permisos de quien la llama
-- (security invoker): cada rol sigue viendo solo lo suyo.
create or replace function public.vista_completa(p_vista text, p_filtro jsonb default '{}', p_orden text default null)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_where text := '';
  v_res   jsonb;
  k       text;
begin
  if p_vista not in ('v_demografia', 'v_tendencia_diaria', 'v_avance_lideres', 'v_ubicaciones_por_revisar', 'v_registros_mesa',
                     'v_calidad_lideres', 'v_seguimiento_lideres', 'v_metas_lideres', 'v_dia_d', 'v_testigos', 'v_testigos_cobertura',
                     'v_potencial_puestos', 'v_e14_pendientes', 'v_e14_revision', 'v_e14_localidades', 'v_e14_puestos',
                     'v_e14_lideres', 'v_e14_plantilla', 'v_mis_digitaciones') then
    raise exception 'Vista no permitida: %', p_vista;
  end if;
  for k in select jsonb_object_keys(coalesce(p_filtro, '{}')) loop
    if k not in ('eleccion_id', 'historico_id') then raise exception 'Filtro no permitido: %', k; end if;
    v_where := v_where || (case when v_where = '' then ' where ' else ' and ' end)
               || format('t.%I = %L::uuid', k, p_filtro ->> k);
  end loop;
  if p_orden is not null and p_orden !~ '^[a-z_]+( desc)?(, ?[a-z_]+( desc)?)*$' then
    raise exception 'Orden no válido';
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)%s), ''[]''::jsonb) from public.%I t%s',
                 case when p_orden is null then '' else ' order by ' || p_orden end, p_vista, v_where)
    into v_res;
  return v_res;
end $$;

-- Las tres cifras del resumen en una sola consulta (antes eran tres)
create or replace function public.resumen_personas()
returns table (personas int, por_revisar int, sin_ubicacion int)
language sql stable security invoker set search_path = public, pg_temp as $$
  select count(*)::int,
         count(*) filter (where ubicacion_estado = 'por_revisar')::int,
         count(*) filter (where ubicacion_estado = 'sin_dato')::int
  from public.personas where eliminado_en is null
$$;

revoke execute on function public.vista_completa(text, jsonb, text), public.resumen_personas() from public;
grant execute on function public.vista_completa(text, jsonb, text), public.resumen_personas() to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.vista_completa(text, jsonb, text), public.resumen_personas() from anon';
  end if;
end $$;
