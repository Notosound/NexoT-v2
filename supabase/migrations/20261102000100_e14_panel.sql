-- =====================================================================
-- 0015 · Vistas E14 para el panel
-- =====================================================================
-- * v_e14_avance:        cuántas mesas faltan, cuántas están verificadas…
--                        (sin esperados ni votos: la ve también el digitador)
-- * v_e14_revision:      mesas donde los dos digitadores no coinciden, con
--                        ambos valores y quién los digitó (solo admin)
-- * v_mis_digitaciones:  lo que digitó el usuario actual, para corregir

create view public.v_e14_avance as
select eleccion_id,
       count(*)::int                                          as mesas,
       count(*) filter (where estado = 'pendiente')::int      as pendientes,
       count(*) filter (where estado = 'una_digitacion')::int as una_digitacion,
       count(*) filter (where estado = 'en_revision')::int    as en_revision,
       count(*) filter (where estado = 'verificado')::int     as verificadas
from app.e14_mesas_calc
where organizacion_id = app.org_actual()
  and app.tiene_rol('admin', 'coordinador', 'candidato', 'digitador')
group by eleccion_id;

create view public.v_e14_revision as
select m.eleccion_id, m.mesa_id, m.localidad, m.puesto, m.mesa,
       (select jsonb_agg(jsonb_build_object('votos', d.votos, 'por', coalesce(p.nombre, 'Sin nombre'), 'en', d.en) order by d.en)
          from public.e14_digitaciones d
          left join public.perfiles p on p.id = d.digitado_por
         where d.eleccion_id = m.eleccion_id and d.mesa_id = m.mesa_id) as digitaciones
from app.e14_mesas_calc m
where m.organizacion_id = app.org_actual()
  and app.tiene_rol('admin')
  and m.estado = 'en_revision';

create view public.v_mis_digitaciones as
select d.id, d.eleccion_id, d.mesa_id, l.nombre as localidad, pu.nombre as puesto, me.numero as mesa,
       d.votos, d.en, coalesce(r.estado, 'una_digitacion') as estado
from public.e14_digitaciones d
join public.mesas me       on me.id = d.mesa_id
join public.puestos pu     on pu.id = me.puesto_id
join public.localidades l  on l.id = pu.localidad_id
left join public.e14_resultados r on r.eleccion_id = d.eleccion_id and r.mesa_id = d.mesa_id
where d.digitado_por = auth.uid()
  and d.organizacion_id = app.org_actual();

grant select on public.v_e14_avance, public.v_e14_revision, public.v_mis_digitaciones to authenticated;
