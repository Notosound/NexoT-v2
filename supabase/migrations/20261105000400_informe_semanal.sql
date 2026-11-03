-- =====================================================================
-- 0029 · Informe semanal por correo
-- =====================================================================
-- Cada lunes a las 7:43 a. m. (Bogotá) la base llama a la función del
-- servidor "informe", que arma un resumen por organización y lo envía a
-- los administradores y al candidato (por Resend, desde el dominio de la
-- campaña). Cada persona puede dejar de recibirlo desde "Mi cuenta".

alter table public.perfiles add column recibe_informe boolean not null default true;

create or replace function public.cambiar_recibe_informe(p_recibe boolean) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.perfiles set recibe_informe = p_recibe where id = auth.uid()
$$;
create or replace function public.mi_recibe_informe() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select recibe_informe from public.perfiles where id = auth.uid()
$$;

-- Ajustes internos (no los lee ningún usuario del panel)
create table app.ajustes (clave text primary key, valor text not null);
insert into app.ajustes values ('informe_clave', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict do nothing;
revoke all on app.ajustes from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on app.ajustes from authenticated'; end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on app.ajustes from anon'; end if;
end $$;

create or replace function public.verificar_clave_informe(p_clave text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from app.ajustes where clave = 'informe_clave' and valor = p_clave)
$$;

-- Contenido del informe de una organización (sin datos de personas: solo
-- cifras y nombres de líderes)
create or replace function public.informe_semanal(p_org uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with p as (select * from public.personas where organizacion_id = p_org and eliminado_en is null),
  li as (
    select l.id, l.nombre, l.meta_votos,
           count(p.id)::int as n,
           count(p.id) filter (where p.creado_en >= now() - interval '7 days')::int as semana,
           max(p.creado_en) as ultimo
    from public.lideres l left join p on p.lider_id = l.id
    where l.organizacion_id = p_org and l.activo
    group by l.id
  ),
  f as (
    select case when o.meta_inicio is not null and o.meta_fin is not null then
             least(1, greatest(0, ((now() at time zone 'America/Bogota')::date - o.meta_inicio)::numeric / (o.meta_fin - o.meta_inicio))) end as esperado
    from public.organizaciones o where o.id = p_org
  )
  select jsonb_build_object(
    'organizacion', (select nombre from public.organizaciones where id = p_org),
    'total', (select count(*) from p),
    'nuevos_semana', (select count(*) from p where creado_en >= now() - interval '7 days'),
    'nuevos_anterior', (select count(*) from p where creado_en >= now() - interval '14 days' and creado_en < now() - interval '7 days'),
    'meta_total', (select coalesce(sum(meta_votos), 0) from li),
    'avance_meta', (select coalesce(sum(least(n, meta_votos)), 0) from li where meta_votos > 0),
    'esperado', (select esperado from f),
    'confirmados', (select count(*) from p where compromiso = 'confirmado'),
    'contactados', (select count(*) from p where compromiso <> 'sin_contactar'),
    'por_revisar', (select count(*) from p where ubicacion_estado = 'por_revisar'),
    'lideres', (select count(*) from li),
    'ranking', (select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'n', semana) order by semana desc, nombre), '[]')
                from (select * from li where semana > 0 order by semana desc, nombre limit 3) t),
    'atrasados', (select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'n', n, 'meta', meta_votos) order by n::numeric / meta_votos), '[]')
                  from (select li.* from li, f where meta_votos > 0 and n < meta_votos
                          and n < 0.7 * meta_votos * coalesce(f.esperado, 0.57)   -- sin fechas: < 40 % de la meta
                        order by n::numeric / meta_votos limit 5) t),
    'quietos', (select count(*) from li where (ultimo is null or ultimo < now() - interval '7 days') and (meta_votos = 0 or n < meta_votos)),
    'localidades', (select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'n', n) order by n desc), '[]') from (
                      select lo.nombre, count(*)::int n from p join public.localidades lo on lo.id = coalesce(p.localidad_votacion_id,
                        (select localidad_id from public.puestos where id = p.puesto_id))
                      where p.creado_en >= now() - interval '7 days' group by lo.nombre order by n desc limit 3) t),
    'solicitudes_pendientes', (select count(*) from public.solicitudes_datos where organizacion_id = p_org and estado = 'pendiente'),
    'solicitudes_vencidas', (select count(*) from public.solicitudes_datos where organizacion_id = p_org and estado = 'pendiente'
                               and vence_en < (now() at time zone 'America/Bogota')::date)
  )
$$;

-- A quién se le envía
create or replace function public.destinatarios_informe(p_org uuid)
returns table (email text, nombre text, rol text)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.email::text, pf.nombre, pf.rol from public.perfiles pf join auth.users u on u.id = pf.id
  where pf.organizacion_id = p_org and pf.activo and pf.recibe_informe and pf.rol in ('admin', 'candidato') and u.email is not null
$$;

revoke execute on function public.informe_semanal(uuid), public.destinatarios_informe(uuid), public.verificar_clave_informe(text) from public;
revoke execute on function public.cambiar_recibe_informe(boolean), public.mi_recibe_informe() from public;
grant execute on function public.cambiar_recibe_informe(boolean), public.mi_recibe_informe() to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.informe_semanal(uuid), public.destinatarios_informe(uuid), public.verificar_clave_informe(text) to service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.informe_semanal(uuid), public.destinatarios_informe(uuid), public.verificar_clave_informe(text), public.cambiar_recibe_informe(boolean), public.mi_recibe_informe() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.informe_semanal(uuid), public.destinatarios_informe(uuid), public.verificar_clave_informe(text) from authenticated';
  end if;
end $$;

-- Programación semanal (solo en Supabase: el entorno de pruebas no tiene pg_cron).
-- La dirección de las funciones la guarda el despliegue en app.ajustes ('url_funciones').
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'informe-semanal';
    perform cron.schedule('informe-semanal', '43 12 * * 1', $job$
      select net.http_post(
        url := (select valor from app.ajustes where clave = 'url_funciones') || '/informe',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'x-informe-clave', (select valor from app.ajustes where clave = 'informe_clave')),
        body := '{"accion": "enviar_todos"}'::jsonb)
      where exists (select 1 from app.ajustes where clave = 'url_funciones')
    $job$);
  end if;
end $$;
