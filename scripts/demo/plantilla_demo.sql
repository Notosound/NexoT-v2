-- =====================================================================
-- DEMOSTRACIÓN (SOLO PROYECTO DE PRUEBAS). Generado por scripts/demo/armar_sql.py
-- 1) Borra TODOS los datos operativos de la campaña (incluida la carga de 40 mil).
-- 2) Carga una campaña de ejemplo moderada con datos INVENTADOS:
--    36 líderes, ~2.400 simpatizantes en 4 meses, seguimiento, eventos,
--    testigos, una elección anterior para comparar y un simulacro de E14
--    con lecturas automáticas reales del lector (formularios inventados).
-- Cédulas inventadas: empiezan por 97.
-- =====================================================================
do $$
declare
  v_org   uuid := (select pf.organizacion_id from public.perfiles pf join auth.users u on u.id = pf.id
                   where u.email = 'jonnathanpena1@gmail.com' and pf.rol = 'admin');
  v_admin uuid := (select pf.id from public.perfiles pf join auth.users u on u.id = pf.id where u.email = 'jonnathanpena1@gmail.com');
  v_dig   uuid;
  v_coord uuid;
  v_elec  uuid;
  v_hist  uuid;
  v_ev    uuid;
  v_rev   uuid;
  fila_r  record;
  v_lectura jsonb := $json$__LECTURAS__$json$::jsonb;
  n int;
begin
  if v_org is null then raise exception 'No encontré la organización del administrador'; end if;
  v_dig   := coalesce((select id from public.perfiles where organizacion_id = v_org and rol = 'digitador' and activo limit 1),
                      (select id from public.perfiles where organizacion_id = v_org and id <> v_admin and activo limit 1),
                      '00000000-0000-4000-8000-0000000d1917');
  v_rev := case when (select rol from public.perfiles where id = v_dig) = 'digitador' then v_dig else v_admin end;
  v_coord := (select id from public.perfiles where organizacion_id = v_org and rol = 'coordinador' and activo limit 1);

  -- ── 1. Limpieza ──────────────────────────────────────────────────────
  alter table public.personas disable trigger personas_sin_borrado;
  alter table public.lideres  disable trigger lideres_sin_borrado;
  alter table public.auditoria disable trigger auditoria_inmutable;
  delete from public.asistencias where evento_id in (select id from public.eventos where organizacion_id = v_org);
  delete from public.eventos where organizacion_id = v_org;
  delete from public.contactos where organizacion_id = v_org;
  delete from public.votos_marcados where organizacion_id = v_org;
  delete from public.testigos where organizacion_id = v_org;
  delete from public.e14_lecturas where organizacion_id = v_org;
  delete from public.e14_resultados where organizacion_id = v_org;
  delete from public.e14_digitaciones where organizacion_id = v_org;
  delete from public.elecciones where organizacion_id = v_org;
  delete from public.historicos where organizacion_id = v_org;
  delete from public.solicitudes_datos where organizacion_id = v_org;
  delete from public.personas where organizacion_id = v_org;
  get diagnostics n = row_count;
  raise notice 'Personas borradas: %', n;
  delete from public.importacion_filas where organizacion_id = v_org;
  delete from public.importaciones where organizacion_id = v_org;
  delete from public.lideres where organizacion_id = v_org and perfil_id is null;
  delete from public.auditoria where organizacion_id = v_org;
  alter table public.personas enable trigger personas_sin_borrado;
  alter table public.lideres  enable trigger lideres_sin_borrado;
  alter table public.auditoria enable trigger auditoria_inmutable;

  -- ── 2. Campaña de ejemplo ────────────────────────────────────────────
  update public.organizaciones set meta_inicio = current_date - 120, meta_fin = current_date + 100 where id = v_org;
  update public.lideres set meta_votos = 120 where organizacion_id = v_org;

  insert into public.lideres (organizacion_id, nombre, meta_votos, coordinador_id, telefono)
  select v_org, x.nombre, x.meta, case when x.i % 3 = 0 then v_coord end, '31' || lpad((20000000 + x.i * 7919)::text, 8, '0')
  from (select i, nombres[i] nombre, (array[60,80,100,120,150,200])[1 + (i * 7) % 6] meta
        from (select array['Alba Lucía Rincón','Hernando Pulido','Gladys Mora','Wilson Castañeda','Martha Cecilia Ruiz','Jairo Benavides',
          'Yolanda Patiño','Édgar Salamanca','Luz Dary Forero','Orlando Cifuentes','Nidia Castiblanco','Fernando Garzón',
          'Rubiela Ortiz','Héctor Fabio Leal','Sandra Milena Peña','Germán Bohórquez','Ana Isabel Quiroga','Álvaro Vanegas',
          'Claudia Patricia León','Rodrigo Ayala','Blanca Nieves Díaz','Mauricio Lozano','Esperanza Rojas','Julio César Pinzón',
          'Diana Marcela Gil','Luis Alfonso Barón','Carmenza Ocampo','Jhon Fredy Cuervo','Patricia Arias','Óscar Iván Moreno',
          'Marleny Saavedra','Camilo Andrés Rubio','Gloria Inés Pardo','Nelson Enrique Tovar','Liliana Vargas','Eduardo Malagón'] nombres) a,
             generate_series(1, 36) i) x;

  -- Mesas con gente: las 36 del ejemplo de E14 y otras 260 repartidas por la ciudad
  create temp table demo_mesas on commit drop as
  with ejemplo as (
    select distinct m.id from jsonb_array_elements(v_lectura) l
    join public.puestos p on p.zona = l->>'zona' and p.codigo = l->>'codigo_puesto'
    join public.localidades lo on lo.id = p.localidad_id join public.municipios mu on mu.id = lo.municipio_id and mu.divipola = '11001'
    join public.mesas m on m.puesto_id = p.id and m.numero = (l->>'mesa')::int),
  otras as (
    select m.id from public.mesas m join public.puestos p on p.id = m.puesto_id
    join public.localidades lo on lo.id = p.localidad_id join public.municipios mu on mu.id = lo.municipio_id and mu.divipola = '11001'
    where m.numero <= 3 and m.id not in (select id from ejemplo)
    order by abs(hashtext('demo' || m.id)) limit 260)
  select m.id, m.puesto_id, p.localidad_id, row_number() over (order by m.id) rn, (m.id in (select id from ejemplo)) es_ejemplo
  from public.mesas m join public.puestos p on p.id = m.puesto_id
  where m.id in (select id from ejemplo union all select id from otras);

  alter table public.personas disable trigger auditar;
  alter table public.personas disable trigger en_vivo;
  with li as (select id, row_number() over (order by creado_en, nombre) rn, count(*) over () total from public.lideres where organizacion_id = v_org and activo),
       me as (select *, count(*) over () total from demo_mesas),
       g as (select g, abs(hashtext('nexot-demo' || g)) h, abs(hashtext('otro-demo' || g)) h2 from generate_series(1, 2400) g)
  insert into public.personas (organizacion_id, lider_id, cedula, nombres, apellidos, sexo, edad_declarada, edad_declarada_en,
      telefono, barrio, localidad_votacion_id, puesto_id, mesa_id, puesto_reportado, origen, creado_en,
      compromiso, contactos_n, necesita_transporte, consentimiento_version, consentimiento_en, consentimiento_canal)
  select v_org, li.id, '97' || lpad((g.g * 3571 % 100000000)::text, 8, '0'),
         case when g.h % 100 < 54
              then (array['María','Luz','Ana','Carolina','Diana','Paola','Sandra','Claudia','Martha','Gloria','Laura','Andrea','Yuliana','Valentina','Daniela','Sofía','Rosa','Blanca','Nubia','Marcela'])[1 + g.h2 % 20]
              else (array['José','Luis','Carlos','Jorge','Andrés','Juan','Diego','Fabio','Hernán','Óscar','Camilo','Sebastián','Felipe','Miguel','Edwin','Wilson','Jairo','Germán','Alexander','Julián'])[1 + g.h2 % 20] end,
         (array['Rodríguez','Gómez','González','Martínez','García','López','Hernández','Sánchez','Ramírez','Pérez','Díaz','Moreno','Rojas','Vargas','Torres','Castro','Ortiz','Suárez','Jiménez','Ruiz'])[1 + g.h % 20] || ' ' ||
         (array['Pardo','Cárdenas','Ríos','Mejía','Gutiérrez','Herrera','Medina','Aguilar','Romero','Silva','Ospina','Quintero','Cortés','Muñoz','Valencia'])[1 + g.h2 % 15],
         case when g.h % 100 < 54 then 'femenino' else 'masculino' end,
         (18 + least(67, floor(power((g.h2 % 1000) / 1000.0, 1.25) * 67)))::int, current_date,
         '3' || lpad((100000000 + g.g * 7919 % 899999999)::text, 9, '0'),
         (array['Cedritos','Kennedy Central','Suba Centro','Bosa La Libertad','Engativá Pueblo','Chapinero Alto','Patio Bonito','Las Cruces','La Candelaria','Fontibón','Usme Centro','El Tunal','Restrepo','Teusaquillo','Ciudad Bolívar'])[1 + g.h % 15],
         me.localidad_id,
         case when g.h % 100 < 93 then me.puesto_id end,
         case when g.h % 100 < 88 then me.id end,
         case when g.h % 100 >= 93 then 'Colegio del barrio ' || (g.h2 % 60) end,
         case when g.h % 10 < 7 then 'manual' when g.h % 10 < 9 then 'formulario' else 'importacion' end,
         -- crecimiento: más registros en las últimas semanas
         now() - (power((g.h2 % 1000) / 1000.0, 1.6) * 118) * interval '1 day' - (g.h % 600) * interval '1 minute',
         c.compromiso, case when c.compromiso = 'sin_contactar' then 0 else 1 + g.h % 2 end,
         g.h % 100 < 5,
         'aviso-2026-10', now() - (power((g.h2 % 1000) / 1000.0, 1.6) * 118) * interval '1 day',
         case when g.h % 10 < 7 then 'presencial' else 'formulario' end
  from g
  join li on li.rn = 1 + floor(li.total * power((g.h % 10007) / 10007.0, 1.35))::int
  join me on me.rn = 1 + (g.h2 % me.total)
  cross join lateral (select (array['sin_contactar','sin_contactar','sin_contactar','sin_contactar','sin_contactar','sin_contactar','sin_contactar','sin_contactar','confirmado','confirmado','confirmado','confirmado','confirmado','confirmado','confirmado','dudoso','dudoso','no_apoya','no_apoya','numero_errado'])[1 + (g.h / 7) % 20] as compromiso) c;
  alter table public.personas enable trigger auditar;
  alter table public.personas enable trigger en_vivo;

  -- Seguimiento: un contacto por cada persona ya contactada
  insert into public.contactos (organizacion_id, persona_id, resultado, canal, nota, por, en)
  select v_org, p.id, p.compromiso, (array['llamada','llamada','whatsapp','visita'])[1 + abs(hashtext(p.cedula)) % 4],
         case p.compromiso when 'confirmado' then 'Confirmó que vota por nosotros' when 'dudoso' then 'Lo está pensando, volver a llamar' end,
         v_admin, least(now(), p.creado_en + (1 + abs(hashtext(p.cedula)) % 9) * interval '1 day')
  from public.personas p where p.organizacion_id = v_org and p.compromiso <> 'sin_contactar';

  -- Eventos: dos pasados con asistencia y uno próximo
  insert into public.eventos (organizacion_id, nombre, fecha, lugar, localidad_id, lider_id, activo, creado_por)
  select v_org, e.nombre, e.fecha, e.lugar, (select id from public.localidades where nombre ilike e.loc limit 1),
         (select id from public.lideres where organizacion_id = v_org order by creado_en, nombre limit 1 offset e.k), e.activo, v_admin
  from (values ('Encuentro con líderes de Kennedy', now() - interval '20 days', 'Salón comunal Kennedy Central', 'Kennedy', 2, false),
               ('Recorrido Suba Rincón', now() - interval '6 days', 'Parque Fontanar del Río', 'Suba', 5, false),
               ('Asamblea de cierre', now() + interval '9 days', 'Coliseo El Salitre', 'Engativá', 0, true)) e(nombre, fecha, lugar, loc, k, activo);
  insert into public.asistencias (evento_id, persona_id, nueva, en)
  select ev.id, p.id, abs(hashtext(p.cedula)) % 4 = 0, ev.fecha
  from public.eventos ev
  join lateral (select id, cedula from public.personas where organizacion_id = v_org and creado_en < ev.fecha
                order by abs(hashtext(cedula || ev.nombre)) limit (case when ev.nombre like 'Encuentro%' then 64 else 41 end)) p on true
  where ev.organizacion_id = v_org and ev.fecha < now();

  -- Elección anterior para comparar (votos inventados por puesto)
  insert into public.historicos (organizacion_id, nombre, anio, cargado_por) values (v_org, 'Senado 2022 (ejemplo)', 2022, v_admin) returning id into v_hist;
  insert into public.historico_puestos (historico_id, puesto_id, votos, validos)
  select v_hist, p.id, 3 + abs(hashtext('h' || p.id)) % 60, 2500 + abs(hashtext('v' || p.id)) % 9000
  from public.puestos p join public.localidades lo on lo.id = p.localidad_id join public.municipios mu on mu.id = lo.municipio_id and mu.divipola = '11001';

  -- ── 3. Simulacro de E14 ─────────────────────────────────────────────
  insert into public.elecciones (organizacion_id, nombre, fecha, municipio_id, modo_digitacion)
  values (v_org, 'Simulacro de escrutinio', current_date, (select id from public.municipios where divipola = '11001'), 'doble')
  returning id into v_elec;

  -- Testigos: 24 simpatizantes confirmados cuidan su puesto
  insert into public.testigos (organizacion_id, eleccion_id, persona_id, puesto_id, mesas, creado_por)
  select v_org, v_elec, p.id, p.puesto_id, '{}', v_admin
  from (select distinct on (puesto_id) id, puesto_id from public.personas
        where organizacion_id = v_org and compromiso = 'confirmado' and puesto_id is not null order by puesto_id, cedula) p
  order by abs(hashtext(p.id::text)) limit 24;

  -- Lecturas del lector (36 mesas de ejemplo, con sus recortes en el panel)
  create temp table demo_lect on commit drop as
  select m.id mesa_id, nullif(l->>'votos', '')::int votos, nullif(l->>'alterno', '')::int alterno, (l->>'confianza')::numeric confianza,
         l->>'metodo' metodo, l->>'documento' documento, l->>'recorte' recorte, nullif(l->>'motivo', '') motivo, (l->>'verdad')::int verdad,
         row_number() over (order by m.id) k
  from jsonb_array_elements(v_lectura) l
  join public.puestos p on p.zona = l->>'zona' and p.codigo = l->>'codigo_puesto'
  join public.localidades lo on lo.id = p.localidad_id join public.municipios mu on mu.id = lo.municipio_id and mu.divipola = '11001'
  join public.mesas m on m.puesto_id = p.id and m.numero = (l->>'mesa')::int;

  -- Se cargan con la misma función que usa el panel, como el administrador
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform * from public.cargar_lecturas_e14(v_elec,
    (select jsonb_agg(l - 'verdad' || jsonb_build_object('fila', ord, 'recorte', 'ejemplo/' || (l->>'recorte')))
     from jsonb_array_elements(v_lectura) with ordinality t(l, ord)));
  -- La mitad de las claras ya tiene la 2.ª digitación de una persona (con el valor verdadero)
  insert into public.e14_digitaciones (eleccion_id, organizacion_id, mesa_id, votos, digitado_por, en)
  select v_elec, v_org, d.mesa_id, d.verdad, v_rev, now() - interval '1 hour'
  from demo_lect d join public.e14_lecturas l on l.mesa_id = d.mesa_id and l.eleccion_id = v_elec where l.estado = 'automatica' and d.k % 2 = 0;
  -- Cinco dudosas ya revisadas con la imagen (misma función que usa el panel)
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role', 'authenticated')::text, true);
  for fila_r in select l.id, d.verdad from demo_lect d join public.e14_lecturas l on l.mesa_id = d.mesa_id and l.eleccion_id = v_elec
           where l.estado = 'por_revisar' order by d.k limit 5 loop
    perform public.revisar_lectura_e14(fila_r.id, fila_r.verdad);
  end loop;
  perform set_config('request.jwt.claims', '', true);

  -- Las otras mesas, digitadas a mano: 55 % verificadas, algunas con diferencia, otras a medias
  create temp table demo_otras on commit drop as
  select dm.id mesa_id, abs(hashtext('e14' || dm.id)) % 100 azar,
         greatest(0, round((select count(*) from public.personas p where p.mesa_id = dm.id) * (0.5 + (abs(hashtext('f' || dm.id)) % 100) / 80.0)))::int votos
  from demo_mesas dm where not dm.es_ejemplo;
  insert into public.e14_digitaciones (eleccion_id, organizacion_id, mesa_id, votos, digitado_por, en)
  select v_elec, v_org, mesa_id, votos, v_admin, now() - interval '3 hours' from demo_otras where azar < 76;
  insert into public.e14_digitaciones (eleccion_id, organizacion_id, mesa_id, votos, digitado_por, en)
  select v_elec, v_org, mesa_id, case when azar < 61 then votos else votos + 1 + azar % 9 end, v_dig, now() - interval '150 minutes' from demo_otras where azar < 66;

  update public.actividad set en = now() where organizacion_id = v_org;
end $$;

analyze public.personas;
select (select count(*) from public.personas where cedula like '97%') simpatizantes,
       (select count(*) from public.lideres) lideres,
       (select count(*) from public.e14_lecturas) lecturas,
       (select count(*) from public.e14_resultados where estado = 'verificado') mesas_verificadas;
