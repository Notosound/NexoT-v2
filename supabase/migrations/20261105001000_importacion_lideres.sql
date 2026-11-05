-- =====================================================================
-- Los líderes importan su propia lista en Excel
--   - Solo con la plantilla oficial (el panel la reconoce y la anota aquí).
--   - Antes deben aceptar el aviso legal (Ley 1581): queda la versión y la
--     hora en la importación.
--   - Todo lo que importan queda a su nombre; no pueden asignar a otro líder.
--   - Cada fila necesita su puesto de votación (de la lista o escrito).
--   - Una cédula ya registrada por cualquier líder de la campaña no entra
--     dos veces (sin revelar quién la tiene).
-- =====================================================================

alter table public.importaciones
  add column plantilla          text,         -- versión de la plantilla oficial usada (si se usó)
  add column aviso_version      text,         -- aviso legal aceptado al importar
  add column aviso_aceptado_en  timestamptz;

-- El líder (registro de la tabla lideres) de quien está conectado
create or replace function app.mi_lider() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.lideres
  where organizacion_id = app.org_actual() and perfil_id = auth.uid() and activo
  limit 1
$$;
grant execute on function app.mi_lider() to authenticated;

-- ¿La cédula ya está en la campaña? (sin revelar de qué líder es)
create or replace function app.cedula_en_campana(p_org uuid, p_cedula text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_org = app.org_actual() and exists (
    select 1 from public.personas where organizacion_id = p_org and cedula = p_cedula and eliminado_en is null)
$$;
grant execute on function app.cedula_en_campana(uuid, text) to authenticated;

-- Permisos: el líder ve y maneja solo sus propias importaciones
create policy importacion_lider on public.importaciones for all to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('lider') and subido_por = auth.uid())
  with check (organizacion_id = app.org_actual() and app.tiene_rol('lider') and subido_por = auth.uid()
              and lider_id_defecto = app.mi_lider()
              and plantilla is not null and aviso_aceptado_en is not null and consentimiento_version is not null);
create policy importacion_filas_lider on public.importacion_filas for all to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('lider')
         and importacion_id in (select id from public.importaciones where subido_por = auth.uid()))
  with check (organizacion_id = app.org_actual() and app.tiene_rol('lider')
              and importacion_id in (select id from public.importaciones where subido_por = auth.uid()));

create or replace function app.validar_importacion(p_importacion uuid) returns public.importaciones
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  imp public.importaciones;
  f   public.importacion_filas;
  v_mun_nombre text;
  v_lider boolean := app.tiene_rol('lider');
begin
  select * into imp from public.importaciones where id = p_importacion for update;
  if imp.id is null then raise exception 'Importación % no existe o no tiene acceso', p_importacion; end if;
  if imp.estado not in ('cargando','validada') then
    raise exception 'La importación está en estado % y no se puede validar', imp.estado;
  end if;
  if v_lider then
    if imp.lider_id_defecto is distinct from app.mi_lider() then
      raise exception 'Solo puedes importar personas a tu nombre' using errcode = 'insufficient_privilege';
    end if;
    if (select count(*) from public.importacion_filas where importacion_id = p_importacion) > 3000 then
      raise exception 'Máximo 3.000 personas por archivo. Divide la lista en varios archivos.';
    end if;
    -- Todo queda a nombre del líder: se ignora cualquier "cédula del líder"
    update public.importacion_filas set datos = datos - 'lider_cedula'
    where importacion_id = p_importacion and datos ? 'lider_cedula';
  end if;
  select app.normalizar(departamento) into v_mun_nombre from public.municipios where id = imp.municipio_id;

  for f in select * from public.importacion_filas where importacion_id = p_importacion order by fila loop
    f := app.validar_fila(imp, f, v_mun_nombre);
    -- Cédula registrada por otro líder (que quien importa no puede ver)
    if f.estado = 'valida' and app.cedula_en_campana(imp.organizacion_id, f.cedula) then
      f.estado := 'duplicada';
      f.errores := f.errores || 'ya está registrada en la campaña'::text;
    end if;
    -- El líder debe traer el puesto de votación (de la lista o escrito como le aparece)
    if v_lider and f.estado = 'valida' and f.puesto_id is null and f.puesto_reportado is null then
      f.estado := 'con_errores';
      f.errores := f.errores || 'falta el puesto de votación (columna Puesto)'::text;
    end if;
    update public.importacion_filas set
      cedula = f.cedula, nombres = f.nombres, apellidos = f.apellidos, sexo = f.sexo,
      fecha_nacimiento = f.fecha_nacimiento, edad_declarada = f.edad_declarada,
      telefono = f.telefono, barrio = f.barrio, lider_id = f.lider_id,
      localidad_id = f.localidad_id, puesto_id = f.puesto_id, mesa_id = f.mesa_id,
      puesto_reportado = f.puesto_reportado, direccion_reportada = f.direccion_reportada,
      mesa_reportada = f.mesa_reportada,
      errores = f.errores, advertencias = f.advertencias,
      fecha_registro_origen = f.fecha_registro_origen, estado = f.estado, persona_id = f.persona_id
    where id = f.id;
  end loop;

  update public.importaciones i set
    estado            = 'validada',
    total_filas       = c.total,
    filas_validas     = c.validas,
    filas_con_errores = c.errores,
    filas_duplicadas  = c.duplicadas
  from (select count(*) total,
               count(*) filter (where estado = 'valida') validas,
               count(*) filter (where estado = 'con_errores') errores,
               count(*) filter (where estado = 'duplicada') duplicadas
        from public.importacion_filas where importacion_id = p_importacion) c
  where i.id = p_importacion
  returning i.* into imp;
  return imp;
end $$;

revoke execute on function app.validar_importacion(uuid) from public;
grant  execute on function app.validar_importacion(uuid) to authenticated;

-- Cada importación confirmada queda en el registro de acciones sensibles
create trigger auditar after insert or update on public.importaciones
  for each row execute function app.auditar();

create or replace view public.v_acciones_sensibles as
select a.id, a.en, a.accion, a.tabla, a.registro_id, a.despues as detalle,
       coalesce(pf.nombre, 'Sistema') as usuario
from public.auditoria a left join public.perfiles pf on pf.id = a.usuario_id
where a.organizacion_id = app.org_actual() and app.tiene_rol('admin')
  and (a.accion in ('EXPORT', 'VER_COMO', 'SUPRESION')
       or (a.tabla = 'perfiles' and a.accion = 'UPDATE' and a.cambios && array['rol', 'activo', 'verificacion_dos_pasos'])
       or (a.tabla = 'importaciones' and a.accion = 'UPDATE' and a.cambios && array['estado'] and a.despues ->> 'estado' = 'confirmada'));
grant select on public.v_acciones_sensibles to authenticated;
