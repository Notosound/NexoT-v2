-- =====================================================================
-- Datos FALSOS para ver el panel funcionando (solo proyecto de PRUEBAS)
-- =====================================================================
-- Marcas para borrarlos después (scripts/sql/limpiar_datos_prueba.sql):
--   * cédulas que empiezan por 99000
--   * líderes cuyo nombre empieza por "PRUEBA"
-- Nombres inventados. Puestos y mesas: catálogo oficial.

do $$
declare
  v_org uuid := (select id from organizaciones order by creado_en limit 1);
begin
  if exists (select 1 from personas where cedula like '99000%') then
    raise exception 'Los datos de prueba ya están cargados';
  end if;

  insert into lideres (organizacion_id, nombre, cedula, telefono, meta_votos) values
    (v_org, 'PRUEBA Líder Norte', '99000901', '3000000001', 15),
    (v_org, 'PRUEBA Líder Sur',   '99000902', '3000000002', 20),
    (v_org, 'PRUEBA Líder Centro','99000903', '3000000003', 10);

  with datos (n, nombres, apellidos, sexo, nacimiento, loc, salto, mesa, lider, dias, reportado) as (values
    ( 1, 'Laura',     'Gómez Ruiz',      'femenino',  date '1992-04-11', '01',  3,  4, '99000901', 13, null),
    ( 2, 'Andrés',    'Moreno Díaz',     'masculino', date '1985-09-02', '01', 10,  2, '99000901', 12, null),
    ( 3, 'Carolina',  'Pardo Niño',      'femenino',  date '1960-01-25', '11',  5,  7, '99000901', 12, null),
    ( 4, 'Jorge',     'Castro Mejía',    'masculino', date '1978-06-30', '11', 20,  1, '99000901', 10, null),
    ( 5, 'Diana',     'Suárez Ortiz',    'femenino',  date '2001-12-03', '10',  8,  3, '99000901',  9, null),
    ( 6, 'Luis',      'Vargas Rojas',    'masculino', date '1955-03-14', '10', 15,  5, '99000901',  7, null),
    ( 7, 'Paola',     'Torres Cárdenas', 'femenino',  date '1989-08-21', '08',  2,  6, '99000902', 11, null),
    ( 8, 'Camilo',    'Ríos Peña',       'masculino', date '1996-02-17', '08',  2,  9, '99000902', 11, null),
    ( 9, 'Gloria',    'Niño Pardo',      'femenino',  date '1971-11-09', '08', 30,  2, '99000902',  8, null),
    (10, 'Wilson',    'Díaz Moreno',     'masculino', date '1964-05-28', '07',  6,  4, '99000902',  8, null),
    (11, 'Natalia',   'Ruiz Gómez',      'femenino',  date '1999-07-07', '07', 12,  1, '99000902',  6, null),
    (12, 'Fabio',     'Ortiz Suárez',    'masculino', date '1982-10-19', '19',  4,  8, '99000902',  5, null),
    (13, 'Rosa',      'Mejía Castro',    'femenino',  date '1958-12-30', '19',  9,  3, '99000902',  4, null),
    (14, 'Diego',     'Cárdenas Torres', 'masculino', date '2003-01-15', '18',  1, 10, '99000902',  3, null),
    (15, 'Sandra',    'Peña Ríos',       'femenino',  date '1975-04-04', '18',  1, 12, '99000903',  6, null),
    (16, 'Hernán',    'Rojas Vargas',    'masculino', date '1968-09-23', '13',  3,  2, '99000903',  4, null),
    (17, 'Lina',      'Castro Pardo',    'femenino',  date '1994-06-12', '02',  2,  5, '99000903',  2, null),
    (18, 'Óscar',     'Gómez Niño',      'masculino', date '1987-03-08', '16',  7,  3, '99000903',  1, null),
    (19, 'Marta',     'Suárez Ruiz',     'femenino',  date '1963-07-19', '18', null, 4, '99000903',  1, 'Colegio de la loma sede B'),
    (20, 'Javier',    'Ortiz Moreno',    'masculino', date '1990-11-11', '08', null, 2, '99000903',  0, 'Salón comunal del barrio')
  )
  insert into personas (organizacion_id, lider_id, cedula, nombres, apellidos, sexo, fecha_nacimiento,
                        localidad_votacion_id, puesto_id, puesto_reportado, mesa_reportada,
                        origen, consentimiento_version, consentimiento_en, consentimiento_canal, creado_en)
  select v_org,
         (select id from lideres where cedula = d.lider and organizacion_id = v_org),
         '99000' || lpad(d.n::text, 3, '0'),
         d.nombres, d.apellidos, d.sexo, d.nacimiento,
         l.id,
         p.id,
         d.reportado,
         case when p.id is not null then least(d.mesa, p.mesas_total) else d.mesa end,
         'manual', 'aviso-2026-10', now() - make_interval(days => d.dias), 'presencial',
         now() - make_interval(days => d.dias, hours => d.n)
  from datos d
  join localidades l on l.codigo = d.loc
  left join lateral (
    select id, mesas_total from puestos where localidad_id = l.id order by id offset d.salto limit 1
  ) p on d.salto is not null;
end $$;

-- Resumen
select ubicacion_estado, count(*) from personas where cedula like '99000%' group by 1 order by 1;
