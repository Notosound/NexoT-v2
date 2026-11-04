-- =====================================================================
-- 0033 · vista_completa: el filtro llega como texto JSON
-- =====================================================================
-- En "Ver como" el panel consulta por GET (solo lectura) y los parámetros
-- viajan en la dirección: un objeto JSON no llega bien. Con texto funciona
-- igual por GET y por POST.
drop function if exists public.vista_completa(text, jsonb, text);

create function public.vista_completa(p_vista text, p_filtro text default '{}', p_orden text default null)
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
                     'v_e14_lideres', 'v_e14_plantilla', 'v_mis_digitaciones') then
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

revoke execute on function public.vista_completa(text, text, text) from public;
grant execute on function public.vista_completa(text, text, text) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.vista_completa(text, text, text) from anon';
  end if;
end $$;
