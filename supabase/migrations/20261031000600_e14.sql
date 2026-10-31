-- =====================================================================
-- 0006 · E14: digitación de resultados y cumplimiento
-- =====================================================================
-- Reglas (acordadas con el cliente):
--   * Todo se calcula POR MESA y luego se suma hacia arriba.
--   * esperados   = personas registradas (no eliminadas) en esa mesa
--   * confirmados = mínimo(esperados, votos reales)
--   * faltantes   = esperados − confirmados
--   * adicionales = votos reales − confirmados  (apoyo que no viene de líderes)
--   * Si varios líderes comparten mesa, los confirmados se reparten por
--     residuo mayor: la suma siempre es exacta y nadie recibe más que lo
--     que esperaba.
--   * No existe "cumplió / no cumplió" por persona: el voto es secreto.

create table public.elecciones (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references public.organizaciones(id),
  nombre            text not null,
  fecha             date not null,
  municipio_id      int not null references public.municipios(id),
  modo_digitacion   text not null default 'doble' check (modo_digitacion in ('simple','doble')),
  creado_en         timestamptz not null default now(),
  unique (id, organizacion_id)
);

-- Cada transcripción de una foto de E14. En modo doble, dos personas
-- distintas digitan la misma mesa sin ver lo de la otra.
create table public.e14_digitaciones (
  id               bigserial primary key,
  eleccion_id      uuid not null,
  organizacion_id  uuid not null,
  mesa_id          int not null references public.mesas(id),
  votos            int not null check (votos >= 0 and votos <= 1000),
  digitado_por     uuid not null default auth.uid(),
  en               timestamptz not null default now(),
  foreign key (eleccion_id, organizacion_id) references public.elecciones(id, organizacion_id),
  unique (eleccion_id, mesa_id, digitado_por)
);

-- Resultado consolidado por mesa (lo mantiene el trigger, no el usuario)
create table public.e14_resultados (
  eleccion_id      uuid not null,
  organizacion_id  uuid not null,
  mesa_id          int not null references public.mesas(id),
  votos            int check (votos >= 0),
  estado           text not null check (estado in ('una_digitacion','verificado','en_revision')),
  fuente           text not null check (fuente in ('digitacion_simple','doble_coincidente','resuelto_admin','pendiente')),
  resuelto_por     uuid,
  actualizado_en   timestamptz not null default now(),
  primary key (eleccion_id, mesa_id),
  foreign key (eleccion_id, organizacion_id) references public.elecciones(id, organizacion_id),
  check ((estado = 'verificado') = (votos is not null))
);

-- ---------------------------------------------------------------------
-- Consolidación automática al digitar
-- ---------------------------------------------------------------------
create or replace function app.consolidar_e14() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_modo      text;
  v_n         int;
  v_distintos int;
  v_votos     int;
  v_estado    text;
  v_fuente    text;
begin
  -- Una resolución del admin no se pisa con nuevas digitaciones
  if exists (select 1 from public.e14_resultados
             where eleccion_id = new.eleccion_id and mesa_id = new.mesa_id and fuente = 'resuelto_admin') then
    return new;
  end if;

  select modo_digitacion into v_modo from public.elecciones where id = new.eleccion_id;
  select count(*), count(distinct votos), min(votos)
    into v_n, v_distintos, v_votos
  from public.e14_digitaciones where eleccion_id = new.eleccion_id and mesa_id = new.mesa_id;

  if v_modo = 'simple' then
    v_estado := 'verificado'; v_fuente := 'digitacion_simple'; v_votos := new.votos;
  elsif v_n < 2 then
    v_estado := 'una_digitacion'; v_fuente := 'pendiente'; v_votos := null;
  elsif v_distintos = 1 then
    v_estado := 'verificado'; v_fuente := 'doble_coincidente';
  else
    v_estado := 'en_revision'; v_fuente := 'pendiente'; v_votos := null;
  end if;

  insert into public.e14_resultados(eleccion_id, organizacion_id, mesa_id, votos, estado, fuente)
  values (new.eleccion_id, new.organizacion_id, new.mesa_id, v_votos, v_estado, v_fuente)
  on conflict (eleccion_id, mesa_id) do update
    set votos = excluded.votos, estado = excluded.estado, fuente = excluded.fuente,
        actualizado_en = now();
  return new;
end $$;

create trigger e14_consolidar after insert or update of votos on public.e14_digitaciones
  for each row execute function app.consolidar_e14();

-- El admin resuelve una mesa en revisión mirando la foto
create or replace function app.resolver_e14(p_eleccion uuid, p_mesa int, p_votos int) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not app.tiene_rol('admin') then
    raise exception 'Solo un administrador puede resolver mesas' using errcode = 'insufficient_privilege';
  end if;
  update public.e14_resultados
     set votos = p_votos, estado = 'verificado', fuente = 'resuelto_admin',
         resuelto_por = auth.uid(), actualizado_en = now()
   where eleccion_id = p_eleccion and mesa_id = p_mesa;
  if not found then raise exception 'La mesa % no tiene digitaciones en esa elección', p_mesa; end if;
end $$;

create trigger auditar after insert or update or delete on public.e14_digitaciones for each row execute function app.auditar();
create trigger auditar after insert or update or delete on public.e14_resultados   for each row execute function app.auditar();
create trigger auditar after insert or update or delete on public.elecciones       for each row execute function app.auditar();

-- ---------------------------------------------------------------------
-- Vistas internas de cálculo (sin filtro de permisos; se exponen
-- más abajo a través de vistas filtradas por organización y rol)
-- ---------------------------------------------------------------------

-- Esperados por elección, mesa y líder
create view app.e14_esperados as
select e.id as eleccion_id, e.organizacion_id, p.mesa_id, p.lider_id, count(*)::int as esperados
from public.elecciones e
join public.personas p on p.organizacion_id = e.organizacion_id and p.eliminado_en is null and p.mesa_id is not null
group by e.id, e.organizacion_id, p.mesa_id, p.lider_id;

-- Una fila por mesa relevante (con registrados o con digitaciones)
create view app.e14_mesas_calc as
with esp as (
  select eleccion_id, organizacion_id, mesa_id, sum(esperados)::int as esperados
  from app.e14_esperados group by 1, 2, 3
), universo as (
  select eleccion_id, organizacion_id, mesa_id from esp
  union
  select eleccion_id, organizacion_id, mesa_id from public.e14_resultados
)
select u.eleccion_id, u.organizacion_id, u.mesa_id,
       m.numero as mesa, pu.id as puesto_id, pu.nombre as puesto, l.id as localidad_id, l.nombre as localidad,
       coalesce(esp.esperados, 0) as esperados,
       coalesce(r.estado, 'pendiente') as estado,
       r.votos as votos_reales,
       case when r.votos is not null then least(coalesce(esp.esperados, 0), r.votos) end as confirmados,
       case when r.votos is not null then coalesce(esp.esperados, 0) - least(coalesce(esp.esperados, 0), r.votos) end as faltantes,
       case when r.votos is not null then r.votos - least(coalesce(esp.esperados, 0), r.votos) end as adicionales
from universo u
join public.mesas m        on m.id = u.mesa_id
join public.puestos pu     on pu.id = m.puesto_id
join public.localidades l  on l.id = pu.localidad_id
left join esp              on esp.eleccion_id = u.eleccion_id and esp.mesa_id = u.mesa_id
left join public.e14_resultados r on r.eleccion_id = u.eleccion_id and r.mesa_id = u.mesa_id;

-- Reparto de confirmados entre líderes que comparten mesa (residuo mayor)
create view app.e14_lider_mesa_calc as
with base as (
  select x.eleccion_id, x.organizacion_id, x.mesa_id, x.lider_id, x.esperados as esperados_lider,
         m.esperados as esperados_mesa, m.confirmados as confirmados_mesa, m.estado
  from app.e14_esperados x
  join app.e14_mesas_calc m on m.eleccion_id = x.eleccion_id and m.mesa_id = x.mesa_id
), cuotas as (
  select *,
         case when confirmados_mesa is not null
              then confirmados_mesa::numeric * esperados_lider / esperados_mesa end as cuota
  from base
), pisos as (
  select *, floor(cuota)::int as piso, cuota - floor(cuota) as resto
  from cuotas
), orden as (
  select *,
         confirmados_mesa - sum(piso) over (partition by eleccion_id, mesa_id) as sobrantes,
         row_number() over (partition by eleccion_id, mesa_id
                            order by resto desc, esperados_lider desc, lider_id) as puesto_en_reparto
  from pisos
)
select eleccion_id, organizacion_id, mesa_id, lider_id, estado,
       esperados_lider as esperados,
       case when confirmados_mesa is not null
            then piso + case when puesto_en_reparto <= sobrantes then 1 else 0 end end as confirmados
from orden;
