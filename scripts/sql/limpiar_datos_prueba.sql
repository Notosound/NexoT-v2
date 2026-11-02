-- =====================================================================
-- Borrar los datos FALSOS de scripts/sql/datos_prueba.sql
-- =====================================================================
-- Borrado físico (no lógico) porque son datos inventados: se desactiva
-- por un momento el bloqueo de borrado, solo dentro de esta transacción.
-- La auditoría conserva el registro de que existieron y se borraron.

begin;
alter table personas disable trigger personas_sin_borrado;
alter table lideres  disable trigger lideres_sin_borrado;

delete from importacion_filas where cedula like '99000%';
delete from personas where cedula like '99000%';
delete from puestos_alias where alias in ('colegio de la loma sede b', 'salon comunal del barrio');
delete from lideres where nombre like 'PRUEBA %' and cedula like '99000%';

alter table personas enable trigger personas_sin_borrado;
alter table lideres  enable trigger lideres_sin_borrado;
commit;

select count(*) as quedan from personas where cedula like '99000%';
