-- =====================================================================
-- Borrar los datos FALSOS de prueba
-- =====================================================================
-- Cubre: scripts/sql/datos_prueba.sql (20 personas) y la prueba completa
-- (rama prueba-completa: 200 registros por Excel, líderes 99000901–905,
-- elección "Senado 2026 PRUEBA" con sus E14 y nombres aprendidos).
-- Solo toca datos marcados como de prueba: cédulas 99000xxx, líderes
-- "PRUEBA …", elecciones con "PRUEBA" en el nombre.
-- Borrado físico (no lógico) porque son datos inventados: se desactiva
-- por un momento el bloqueo de borrado, solo dentro de esta transacción.
-- La auditoría conserva el registro de que existieron y se borraron.

begin;
alter table personas disable trigger personas_sin_borrado;
alter table lideres  disable trigger lideres_sin_borrado;

-- E14 de las elecciones de prueba
delete from e14_resultados   where eleccion_id in (select id from elecciones where nombre like '%PRUEBA%');
delete from e14_digitaciones where eleccion_id in (select id from elecciones where nombre like '%PRUEBA%');
delete from elecciones       where nombre like '%PRUEBA%';

-- Registros e importaciones de prueba
delete from importacion_filas where cedula like '99000%'
   or importacion_id in (select id from importaciones where archivo in ('registros_200.xlsx'));
delete from personas where cedula like '99000%';
delete from importaciones where archivo in ('registros_200.xlsx')
  and not exists (select 1 from importacion_filas f where f.importacion_id = importaciones.id);
delete from puestos_alias where alias in ('colegio de la loma sede b', 'salon comunal del barrio',
                                          'colegio distrital las brisas sede b');
delete from lideres where nombre like 'PRUEBA %' and cedula like '99000%';

alter table personas enable trigger personas_sin_borrado;
alter table lideres  enable trigger lideres_sin_borrado;
commit;

select (select count(*) from personas where cedula like '99000%')          as personas_que_quedan,
       (select count(*) from lideres where nombre like 'PRUEBA %')          as lideres_que_quedan,
       (select count(*) from elecciones where nombre like '%PRUEBA%')       as elecciones_que_quedan;
