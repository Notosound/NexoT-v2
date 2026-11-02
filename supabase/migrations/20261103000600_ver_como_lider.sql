-- =====================================================================
-- 0023 · "Ver como" un líder aunque todavía no tenga usuario propio
-- =====================================================================
-- Encabezado nuevo:  x-ver-como: lider:<id de la ficha>
-- La regla "qué líderes veo" vive en un solo lugar (app.mis_lideres) y
-- ahora la usan también las vistas por líder, así que la vista del líder
-- funciona igual con o sin usuario.

create or replace function public.antes_de_peticion() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_obj    text;
  v_claims jsonb;
  v_real   uuid;
  v_org    uuid;
  v_rol    text;
begin
  begin
    v_obj := nullif(trim(current_setting('request.headers', true)::json ->> 'x-ver-como'), '');
  exception when others then
    v_obj := null;
  end;
  if v_obj is null then return; end if;

  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_real := coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), v_claims ->> 'sub')::uuid;
  select organizacion_id into v_org from public.perfiles where id = v_real and activo and rol = 'admin';
  if v_org is null then
    raise exception 'Solo un administrador puede usar "Ver como"' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(current_setting('request.method', true), 'GET') not in ('GET', 'HEAD') then
    raise exception 'Estás en "Ver como": es solo lectura' using errcode = 'read_only_sql_transaction';
  end if;
  perform set_config('transaction_read_only', 'on', true);
  perform set_config('app.ver_como', v_obj, true);

  -- Ver como la ficha de un líder (tenga o no usuario propio)
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

create or replace function app.mis_lideres() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.lideres
  where organizacion_id = app.org_actual()
    and case
      when nullif(current_setting('app.lider_vista', true), '') is not null
        then id = current_setting('app.lider_vista', true)::uuid
      else app.tiene_rol('admin')
           or (app.tiene_rol('coordinador') and coordinador_id = auth.uid())
           or (app.tiene_rol('lider') and perfil_id = auth.uid())
    end
$$;

create or replace function app.puede_gestionar_lider(p_lider uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_lider in (select app.mis_lideres())
$$;

create or replace view public.v_avance_lideres as
select li.id as lider_id, li.nombre, li.meta_votos,
       count(pe.id)::int as registrados,
       case when li.meta_votos > 0 then round(100.0 * count(pe.id) / li.meta_votos, 1) end as porcentaje_meta
from public.lideres li
left join app.personas_enriquecidas pe on pe.lider_id = li.id
where li.organizacion_id = app.org_actual()
  and li.activo
  and (app.tiene_rol('candidato') or li.id in (select app.mis_lideres()))
group by li.id, li.nombre, li.meta_votos;

create or replace view public.v_e14_lideres as
select c.eleccion_id, li.id as lider_id, li.nombre,
       sum(c.esperados)::int                                               as esperados,
       sum(c.esperados) filter (where c.estado = 'verificado')::int        as esperados_verificados,
       coalesce(sum(c.confirmados), 0)::int                                as confirmados,
       count(*) filter (where c.estado <> 'verificado')::int               as mesas_pendientes,
       case when sum(c.esperados) filter (where c.estado = 'verificado') > 0
            then round(100.0 * sum(c.confirmados)
                       / sum(c.esperados) filter (where c.estado = 'verificado'), 1) end as cumplimiento
from app.e14_lider_mesa_calc c
join public.lideres li on li.id = c.lider_id
where c.organizacion_id = app.org_actual()
  and (app.tiene_rol('candidato') or li.id in (select app.mis_lideres()))
group by c.eleccion_id, li.id, li.nombre;

create or replace view public.v_calidad_lideres as
select li.id as lider_id, li.nombre, li.meta_votos,
       count(p.id)::int                                                            as total,
       count(p.id) filter (where p.ubicacion_estado = 'completa')::int             as ubicados,
       count(p.id) filter (where p.ubicacion_estado = 'sin_mesa')::int             as sin_mesa,
       count(p.id) filter (where p.ubicacion_estado = 'por_revisar')::int          as por_revisar,
       count(p.id) filter (where p.ubicacion_estado = 'sin_dato')::int             as sin_lugar,
       count(p.id) filter (where p.sexo is null)::int                              as sin_sexo,
       count(p.id) filter (where p.fecha_nacimiento is null and p.edad_declarada is null)::int as sin_edad,
       count(p.id) filter (where p.telefono is null)::int                          as sin_telefono,
       count(p.id) filter (where p.consentimiento_en is null)::int                 as sin_consentimiento,
       count(p.id) filter (where p.origen = 'importacion')::int                    as importados,
       max(p.creado_en)                                                            as ultimo_registro
from public.lideres li
left join public.personas p on p.lider_id = li.id and p.eliminado_en is null
where li.organizacion_id = app.org_actual()
  and li.activo
  and (app.tiene_rol('candidato') or li.id in (select app.mis_lideres()))
group by li.id, li.nombre, li.meta_votos;
