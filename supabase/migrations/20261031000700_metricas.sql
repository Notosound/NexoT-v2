-- =====================================================================
-- 0007 · Métricas: única fuente de verdad para web y app del candidato
-- =====================================================================
-- Estas vistas leen las tablas con permisos del dueño y filtran por la
-- organización y el rol del usuario actual. Exponen SOLO agregados:
-- el candidato puede consultarlas sin tener acceso a la tabla personas.

-- Personas activas con edad, rango y territorio ya resueltos (uso interno)
create view app.personas_enriquecidas as
select p.id, p.organizacion_id, p.lider_id, p.sexo,
       app.edad(p.fecha_nacimiento, p.edad_declarada, p.edad_declarada_en) as edad,
       app.rango_edad(app.edad(p.fecha_nacimiento, p.edad_declarada, p.edad_declarada_en)) as rango_edad,
       p.puesto_id, pu.nombre as puesto, pu.latitud, pu.longitud,
       l.id as localidad_id, l.nombre as localidad,
       p.creado_en
from public.personas p
left join public.puestos pu    on pu.id = p.puesto_id
left join public.localidades l on l.id = pu.localidad_id
where p.eliminado_en is null;

-- ---------------------------------------------------------------------
-- Demografía: base del mapa y la pirámide de edad/sexo
-- Filtrable por localidad, puesto, rango de edad y sexo.
-- ---------------------------------------------------------------------
create view public.v_demografia as
select localidad_id, coalesce(localidad, 'Sin lugar de votación') as localidad,
       puesto_id, puesto, latitud, longitud,
       rango_edad, coalesce(sexo, 'sin dato') as sexo,
       count(*)::int as personas
from app.personas_enriquecidas
where organizacion_id = app.org_actual()
  and app.tiene_rol('admin','coordinador','candidato')
group by localidad_id, localidad, puesto_id, puesto, latitud, longitud, rango_edad, coalesce(sexo, 'sin dato');

-- Avance por líder (registrados vs meta)
create view public.v_avance_lideres as
select li.id as lider_id, li.nombre, li.meta_votos,
       count(pe.id)::int as registrados,
       case when li.meta_votos > 0 then round(100.0 * count(pe.id) / li.meta_votos, 1) end as porcentaje_meta
from public.lideres li
left join app.personas_enriquecidas pe on pe.lider_id = li.id
where li.organizacion_id = app.org_actual()
  and li.activo
  and (app.tiene_rol('admin','candidato')
       or (app.tiene_rol('coordinador') and li.coordinador_id = auth.uid())
       or (app.tiene_rol('lider') and li.perfil_id = auth.uid()))
group by li.id, li.nombre, li.meta_votos;

-- Nuevos registros por día
create view public.v_tendencia_diaria as
select (creado_en at time zone 'America/Bogota')::date as dia, count(*)::int as nuevos
from app.personas_enriquecidas
where organizacion_id = app.org_actual()
  and app.tiene_rol('admin','coordinador','candidato')
group by 1;

-- ---------------------------------------------------------------------
-- E14
-- ---------------------------------------------------------------------
create view public.v_e14_mesas as
select * from app.e14_mesas_calc
where organizacion_id = app.org_actual()
  and app.tiene_rol('admin','coordinador','candidato');

create view public.v_e14_puestos as
select eleccion_id, localidad_id, localidad, puesto_id, puesto,
       count(*)::int                                        as mesas,
       count(*) filter (where estado = 'verificado')::int   as mesas_verificadas,
       sum(esperados)::int                                  as esperados,
       sum(confirmados)::int                                as confirmados,
       sum(faltantes)::int                                  as faltantes,
       sum(adicionales)::int                                as adicionales,
       sum(votos_reales)::int                               as votos_reales
from public.v_e14_mesas
group by eleccion_id, localidad_id, localidad, puesto_id, puesto;

create view public.v_e14_localidades as
select eleccion_id, localidad_id, localidad,
       sum(mesas)::int as mesas, sum(mesas_verificadas)::int as mesas_verificadas,
       sum(esperados)::int as esperados, sum(confirmados)::int as confirmados,
       sum(faltantes)::int as faltantes, sum(adicionales)::int as adicionales,
       sum(votos_reales)::int as votos_reales
from public.v_e14_puestos
group by eleccion_id, localidad_id, localidad;

-- Cumplimiento por líder: solo cuenta mesas verificadas en confirmados
create view public.v_e14_lideres as
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
  and (app.tiene_rol('admin','candidato')
       or (app.tiene_rol('coordinador') and li.coordinador_id = auth.uid())
       or (app.tiene_rol('lider') and li.perfil_id = auth.uid()))
group by c.eleccion_id, li.id, li.nombre;

-- Lista de trabajo para digitadores: mesas que les faltan, SIN mostrar
-- esperados ni lo que digitó otra persona (para no sesgar la lectura).
create view public.v_e14_pendientes as
select m.eleccion_id, m.mesa_id, m.localidad, m.puesto, m.mesa, m.estado
from app.e14_mesas_calc m
where m.organizacion_id = app.org_actual()
  and app.tiene_rol('admin','digitador')
  and m.estado in ('pendiente','una_digitacion')
  and not exists (select 1 from public.e14_digitaciones d
                  where d.eleccion_id = m.eleccion_id and d.mesa_id = m.mesa_id
                    and d.digitado_por = auth.uid());

grant select on public.v_demografia, public.v_avance_lideres, public.v_tendencia_diaria,
                public.v_e14_mesas, public.v_e14_puestos, public.v_e14_localidades,
                public.v_e14_lideres, public.v_e14_pendientes
  to authenticated;
