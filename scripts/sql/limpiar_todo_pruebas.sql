-- =====================================================================
-- SOLO PARA EL PROYECTO DE PRUEBAS: borra todos los datos operativos de la
-- campaña del administrador indicado. Conserva: organización, usuarios
-- (perfiles), líderes que tienen usuario, catálogo oficial y nombres
-- aprendidos de puestos.
-- =====================================================================
do $$
declare
  v_org uuid := (select pf.organizacion_id from public.perfiles pf join auth.users u on u.id = pf.id
                 where u.email = 'jonnathanpena1@gmail.com' and pf.rol = 'admin');
  n int;
begin
  if v_org is null then raise exception 'No encontré la organización del administrador'; end if;
  alter table public.personas disable trigger personas_sin_borrado;
  alter table public.lideres  disable trigger lideres_sin_borrado;
  alter table public.auditoria disable trigger auditoria_inmutable;

  delete from public.asistencias where evento_id in (select id from public.eventos where organizacion_id = v_org);
  delete from public.eventos where organizacion_id = v_org;
  delete from public.contactos where organizacion_id = v_org;
  delete from public.votos_marcados where organizacion_id = v_org;
  delete from public.testigos where persona_id in (select id from public.personas where organizacion_id = v_org);
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
  update public.lideres set meta_votos = 0 where organizacion_id = v_org;
  delete from public.auditoria where organizacion_id = v_org;

  alter table public.personas enable trigger personas_sin_borrado;
  alter table public.lideres  enable trigger lideres_sin_borrado;
  alter table public.auditoria enable trigger auditoria_inmutable;
end $$;

select (select count(*) from public.personas) personas, (select count(*) from public.lideres) lideres,
       (select count(*) from public.elecciones) elecciones, (select count(*) from public.auditoria) auditoria;
