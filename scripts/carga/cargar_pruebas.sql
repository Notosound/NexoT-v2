-- =====================================================================
-- Prueba de capacidad (SOLO PROYECTO DE PRUEBAS): personas INVENTADAS.
-- Cada ejecución agrega 10.000; ejecutar 4 veces para 40.000.
-- Cédulas empiezan por 98 (10 dígitos) para reconocerlas y borrarlas.
-- =====================================================================
do $$
declare
  v_org  uuid := (select pf.organizacion_id from public.perfiles pf join auth.users u on u.id = pf.id
                  where u.email = 'jonnathanpena1@gmail.com' and pf.rol = 'admin');
  v_coord uuid := (select id from public.perfiles where organizacion_id = v_org and rol = 'coordinador' and activo limit 1);
  v_desde int;
  v_lote int := 10000;
begin
  if v_org is null then raise exception 'No encontré la organización'; end if;

  -- 200 líderes de carga (una sola vez)
  if not exists (select 1 from public.lideres where organizacion_id = v_org and nombre like 'Líder carga %') then
    insert into public.lideres (organizacion_id, nombre, meta_votos, coordinador_id, telefono)
    select v_org, 'Líder carga ' || lpad(g::text, 3, '0'), 150 + (g * 37 % 9) * 25,
           case when g <= 40 then v_coord end, '31' || lpad((50000000 + g)::text, 8, '0')
    from generate_series(1, 200) g;
  end if;

  v_desde := (select count(*) from public.personas where organizacion_id = v_org and cedula like '98%');
  alter table public.personas disable trigger auditar;
  alter table public.personas disable trigger en_vivo;

  with li as (select id, row_number() over (order by nombre) rn from public.lideres where organizacion_id = v_org and nombre like 'Líder carga %'),
       me as (select m.id, m.puesto_id, m.numero, p.localidad_id, row_number() over (order by m.id) rn, count(*) over () total
              from public.mesas m join public.puestos p on p.id = m.puesto_id
              join public.localidades l on l.id = p.localidad_id join public.municipios mu on mu.id = l.municipio_id where mu.divipola = '11001'),
       g as (select g, abs(hashtext('nexot' || g)) h, abs(hashtext('otro' || g)) h2 from generate_series(v_desde + 1, v_desde + v_lote) g)
  insert into public.personas (organizacion_id, lider_id, cedula, nombres, apellidos, sexo, edad_declarada, edad_declarada_en,
      telefono, barrio, localidad_votacion_id, puesto_id, mesa_id, puesto_reportado, origen, creado_en,
      compromiso, contactos_n, necesita_transporte, consentimiento_version, consentimiento_en, consentimiento_canal)
  select v_org, li.id, '98' || lpad(g.g::text, 8, '0'),
         case when g.h % 2 = 0
              then (array['María','Luz','Ana','Carolina','Diana','Paola','Sandra','Claudia','Martha','Gloria','Laura','Andrea','Yuliana','Valentina','Daniela','Sofía','Rosa','Blanca','Nubia','Marcela'])[1 + g.h2 % 20]
              else (array['José','Luis','Carlos','Jorge','Andrés','Juan','Diego','Fabio','Hernán','Óscar','Camilo','Sebastián','Felipe','Miguel','Edwin','Wilson','Jairo','Germán','Alexander','Julián'])[1 + g.h2 % 20] end,
         (array['Rodríguez','Gómez','González','Martínez','García','López','Hernández','Sánchez','Ramírez','Pérez','Díaz','Moreno','Rojas','Vargas','Torres','Castro','Ortiz','Suárez','Jiménez','Ruiz'])[1 + g.h % 20] || ' ' ||
         (array['Pardo','Cárdenas','Ríos','Mejía','Gutiérrez','Herrera','Medina','Aguilar','Romero','Silva','Ospina','Quintero','Cortés','Muñoz','Valencia'])[1 + g.h2 % 15],
         case when g.h % 2 = 0 then 'femenino' else 'masculino' end,
         (18 + least(67, floor(power((g.h2 % 1000) / 1000.0, 1.3) * 67)))::int, current_date,
         '3' || lpad((100000000 + g.g * 7)::text, 9, '0'),
         (array['Cedritos','Kennedy Central','Suba Centro','Bosa La Libertad','Engativá Pueblo','Chapinero Alto','Patio Bonito','Las Cruces','La Candelaria','Fontibón','Usme Centro','El Tunal','Restrepo','Teusaquillo','Ciudad Bolívar'])[1 + g.h % 15],
         case when g.h % 100 < 94 then me.localidad_id end,
         case when g.h % 100 < 88 then me.puesto_id end,
         case when g.h % 100 < 82 then me.id end,
         case when g.h % 100 between 88 and 93 then 'Colegio del barrio ' || (g.h2 % 400) end,
         case when g.h % 10 < 7 then 'manual' when g.h % 10 < 9 then 'formulario' else 'importacion' end,
         now() - (power((g.h2 % 1000) / 1000.0, 0.7) * 120) * interval '1 day' - (g.h % 1440) * interval '1 minute',
         c.compromiso, case when c.compromiso = 'sin_contactar' then 0 else 1 + g.h % 3 end,
         g.h % 100 < 4,
         case when g.h % 10 < 9 then 'aviso-2026-10' end,
         case when g.h % 10 < 9 then now() - (power((g.h2 % 1000) / 1000.0, 0.7) * 120) * interval '1 day' end,
         case when g.h % 10 < 7 then 'presencial' when g.h % 10 < 9 then 'formulario' end
  from g
  join li on li.rn = 1 + floor(200 * power((g.h % 10007) / 10007.0, 1.6))::int
  join me on me.rn = 1 + (g.h2 % me.total)
  cross join lateral (select (array['sin_contactar','sin_contactar','sin_contactar','confirmado','confirmado','confirmado','dudoso','dudoso','no_apoya','numero_errado'])[1 + (g.h / 7) % 10] as compromiso) c;

  alter table public.personas enable trigger auditar;
  alter table public.personas enable trigger en_vivo;
  update public.actividad set en = now() where organizacion_id = v_org;
end $$;

analyze public.personas;
select count(*) as personas_de_carga from public.personas where cedula like '98%';
