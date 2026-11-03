-- =====================================================================
-- 0028 · Metas por líder: ritmo (semáforo) y ranking semanal
-- =====================================================================
-- La campaña define desde y hasta cuándo se registra. Con eso se sabe
-- cuánto debería llevar cada líder hoy (ritmo esperado) y se compara con
-- lo que lleva: verde va al día, amarillo un poco atrás, rojo muy atrás.

alter table public.organizaciones
  add column meta_inicio date,
  add column meta_fin    date,
  add constraint organizaciones_meta_fechas check (meta_fin is null or meta_inicio is null or meta_fin > meta_inicio);

create or replace function public.configurar_fechas_meta(p_inicio date, p_fin date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.tiene_rol('admin') then raise exception 'Solo un administrador define las fechas' using errcode = 'insufficient_privilege'; end if;
  if p_inicio is null or p_fin is null or p_fin <= p_inicio then raise exception 'La fecha final debe ser posterior a la inicial'; end if;
  update public.organizaciones set meta_inicio = p_inicio, meta_fin = p_fin where id = app.org_actual();
end $$;

create or replace function public.fechas_meta() returns table (inicio date, fin date, esperado numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  -- esperado: fracción del tiempo ya transcurrida (0 a 1)
  select o.meta_inicio, o.meta_fin,
         case when o.meta_inicio is not null and o.meta_fin is not null then
           least(1, greatest(0, ((now() at time zone 'America/Bogota')::date - o.meta_inicio)::numeric / (o.meta_fin - o.meta_inicio)))
         end
  from public.organizaciones o where o.id = app.org_actual()
$$;

-- Avance y ritmo de cada líder que el usuario puede ver
create view public.v_metas_lideres as
with f as (select * from public.fechas_meta())
select li.id as lider_id, li.nombre, li.meta_votos as meta, coalesce(pc.nombre, '') as coordinador,
       count(p.id)::int as registrados,
       count(p.id) filter (where p.compromiso = 'confirmado')::int as confirmados,
       count(p.id) filter (where p.creado_en >= now() - interval '7 days')::int as esta_semana,
       count(p.id) filter (where p.creado_en >= now() - interval '14 days' and p.creado_en < now() - interval '7 days')::int as semana_anterior,
       max(p.creado_en) as ultimo_registro,
       case when li.meta_votos > 0 and f.esperado is not null then ceil(li.meta_votos * f.esperado)::int end as esperado_hoy,
       case
         when li.meta_votos = 0 then 'sin_meta'
         when count(p.id) >= li.meta_votos then 'cumplida'
         when f.esperado is not null then
           case when count(p.id) >= li.meta_votos * f.esperado then 'verde'
                when count(p.id) >= 0.7 * li.meta_votos * f.esperado then 'amarillo'
                else 'rojo' end
         else
           case when count(p.id) >= 0.75 * li.meta_votos then 'verde'
                when count(p.id) >= 0.4 * li.meta_votos then 'amarillo'
                else 'rojo' end
       end as semaforo
from public.lideres li
cross join f
left join public.perfiles pc on pc.id = li.coordinador_id
left join public.personas p on p.lider_id = li.id and p.eliminado_en is null
where li.organizacion_id = app.org_actual() and li.activo
  and (app.tiene_rol('candidato') or li.id in (select app.mis_lideres()))
group by li.id, li.nombre, li.meta_votos, pc.nombre, f.esperado;
grant select on public.v_metas_lideres to authenticated;

-- Ranking de la semana (registros de los últimos 7 días). Lo ven todos los
-- roles, también los líderes: solo nombres de líderes y cantidades, ningún
-- dato de personas. Para el líder se agrega su propia posición.
create or replace function public.ranking_semanal()
returns table (posicion int, lider_id uuid, nombre text, registros int, soy_yo boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with r as (
    select li.id, li.nombre, count(p.id)::int as n,
           rank() over (order by count(p.id) desc)::int as pos,
           row_number() over (order by count(p.id) desc, li.nombre)::int as rn,
           coalesce(li.perfil_id = auth.uid()
            or li.id::text = nullif(current_setting('app.lider_vista', true), ''), false) as yo
    from public.lideres li
    left join public.personas p on p.lider_id = li.id and p.eliminado_en is null and p.creado_en >= now() - interval '7 days'
    where li.organizacion_id = app.org_actual() and li.activo and app.org_actual() is not null
    group by li.id
  )
  select pos, id, nombre, n, yo from r
  where (rn <= 10 and n > 0) or yo
  order by rn
$$;

revoke execute on function public.configurar_fechas_meta(date, date), public.fechas_meta(), public.ranking_semanal() from public;
grant execute on function public.configurar_fechas_meta(date, date), public.fechas_meta(), public.ranking_semanal() to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.configurar_fechas_meta(date, date), public.fechas_meta(), public.ranking_semanal() from anon';
  end if;
end $$;
