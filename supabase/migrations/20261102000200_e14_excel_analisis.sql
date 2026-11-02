-- =====================================================================
-- 0016 · E14 desde Excel, análisis y registro de exportaciones
-- =====================================================================
-- Doble verificación con Excel: cada archivo cuenta como la digitación de
-- QUIEN LO SUBE. Una mesa solo queda verificada cuando una persona
-- distinta (por otro archivo o digitando) escribe el mismo número. Una
-- misma persona nunca verifica dos veces la misma mesa.

-- ---------------------------------------------------------------------
-- Origen de cada digitación
-- ---------------------------------------------------------------------
alter table public.e14_digitaciones
  add column origen  text not null default 'manual' check (origen in ('manual', 'excel')),
  add column archivo text,
  add column fila    int;

-- ---------------------------------------------------------------------
-- Importar un E14 desde Excel
--   p_filas: [{fila, localidad, zona, codigo_puesto, puesto, mesa, votos}, ...]
--   p_confirmar = false → solo valida (prueba en seco), no guarda nada
-- Ubicación de la mesa: por códigos oficiales (zona + código de puesto)
-- si vienen; si no, por localidad + nombre del puesto (o alias aprendido).
-- ---------------------------------------------------------------------
create or replace function public.importar_e14(p_eleccion uuid, p_archivo text, p_filas jsonb, p_confirmar boolean default false)
returns table (fila int, estado text, mensaje text, mesa_id int, votos int)
language plpgsql security invoker set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  ele    public.elecciones;
  r      jsonb;
  v_fila int; v_loc int; v_puesto int; v_mesa int; v_votos int;
  v_txt  text; v_previo int;
  vistas int[] := '{}';
begin
  if not app.tiene_rol('admin', 'digitador') then
    raise exception 'Solo administradores y digitadores pueden subir E14' using errcode = 'insufficient_privilege';
  end if;
  select * into ele from public.elecciones where id = p_eleccion and organizacion_id = app.org_actual();
  if ele.id is null then raise exception 'Elección no encontrada'; end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then raise exception 'El archivo no tiene filas'; end if;
  if jsonb_array_length(p_filas) > 20000 then raise exception 'Máximo 20.000 filas por archivo'; end if;

  for r in select * from jsonb_array_elements(p_filas) loop
    v_fila := nullif(r ->> 'fila', '')::int;
    v_loc := null; v_puesto := null; v_mesa := null; v_votos := null; v_previo := null;

    -- Votos
    v_txt := regexp_replace(coalesce(r ->> 'votos', ''), '[\s.,]', '', 'g');
    if v_txt = '' then
      fila := v_fila; estado := 'vacia'; mensaje := 'sin votos (se ignora)'; mesa_id := null; votos := null;
      return next; continue;
    end if;
    if v_txt !~ '^\d{1,4}$' or v_txt::int > 1000 then
      fila := v_fila; estado := 'error'; mensaje := format('votos inválidos: "%s"', r ->> 'votos'); mesa_id := null; votos := null;
      return next; continue;
    end if;
    v_votos := v_txt::int;

    -- Puesto: por códigos oficiales o por nombre
    if app.solo_digitos(r ->> 'zona') is not null and app.solo_digitos(r ->> 'codigo_puesto') is not null then
      select p.id into v_puesto from public.puestos p
        join public.localidades l on l.id = p.localidad_id
       where l.municipio_id = ele.municipio_id
         and p.zona = lpad(app.solo_digitos(r ->> 'zona'), 2, '0')
         and p.codigo = lpad(app.solo_digitos(r ->> 'codigo_puesto'), 2, '0');
    end if;
    if v_puesto is null then
      v_loc := app.buscar_localidad(ele.municipio_id, r ->> 'localidad');
      if v_loc is null then
        fila := v_fila; estado := 'error'; mensaje := format('localidad no encontrada: "%s"', coalesce(r ->> 'localidad', '')); mesa_id := null; votos := v_votos;
        return next; continue;
      end if;
      select s.puesto_id into v_puesto from app.sugerir_puesto(ele.organizacion_id, v_loc, r ->> 'puesto', null) s where s.confianza = 'alta';
      if v_puesto is null then
        fila := v_fila; estado := 'error'; mensaje := format('puesto no encontrado en %s: "%s"', r ->> 'localidad', coalesce(r ->> 'puesto', '')); mesa_id := null; votos := v_votos;
        return next; continue;
      end if;
    end if;

    -- Mesa
    if app.solo_digitos(r ->> 'mesa') is null then
      fila := v_fila; estado := 'error'; mensaje := 'falta el número de mesa'; mesa_id := null; votos := v_votos;
      return next; continue;
    end if;
    select m.id into v_mesa from public.mesas m where m.puesto_id = v_puesto and m.numero = app.solo_digitos(r ->> 'mesa')::int;
    if v_mesa is null then
      fila := v_fila; estado := 'error'; mensaje := format('la mesa %s no existe en ese puesto', r ->> 'mesa'); mesa_id := null; votos := v_votos;
      return next; continue;
    end if;
    if v_mesa = any(vistas) then
      fila := v_fila; estado := 'error'; mensaje := 'mesa repetida en el archivo'; mesa_id := v_mesa; votos := v_votos;
      return next; continue;
    end if;
    vistas := vistas || v_mesa;

    -- ¿Ya la había digitado esta misma persona?
    select d.votos into v_previo from public.e14_digitaciones d
     where d.eleccion_id = p_eleccion and d.mesa_id = v_mesa and d.digitado_por = auth.uid();

    if p_confirmar then
      insert into public.e14_digitaciones (eleccion_id, organizacion_id, mesa_id, votos, origen, archivo, fila)
      values (p_eleccion, ele.organizacion_id, v_mesa, v_votos, 'excel', p_archivo, v_fila)
      on conflict (eleccion_id, mesa_id, digitado_por) do update
        set votos = excluded.votos, origen = 'excel', archivo = excluded.archivo, fila = excluded.fila
        where e14_digitaciones.votos is distinct from excluded.votos;
    end if;

    fila := v_fila; mesa_id := v_mesa; votos := v_votos;
    if v_previo is null then estado := 'nueva'; mensaje := null;
    elsif v_previo = v_votos then estado := 'sin_cambios'; mensaje := 'ya la habías registrado con el mismo valor';
    else estado := 'cambia'; mensaje := format('reemplaza tu valor anterior (%s)', v_previo);
    end if;
    return next;
  end loop;
end $$;

revoke execute on function public.importar_e14(uuid, text, jsonb, boolean) from public;
grant execute on function public.importar_e14(uuid, text, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Plantilla E14: mesas con simpatizantes, con códigos oficiales
-- (no muestra esperados, para no sesgar a quien digita)
-- ---------------------------------------------------------------------
create view public.v_e14_plantilla as
select m.eleccion_id, m.localidad, pu.zona, pu.codigo as codigo_puesto, m.puesto, m.mesa
from app.e14_mesas_calc m
join public.puestos pu on pu.id = m.puesto_id
where m.organizacion_id = app.org_actual()
  and app.tiene_rol('admin', 'digitador')
  and m.esperados > 0;

-- ---------------------------------------------------------------------
-- Análisis
-- ---------------------------------------------------------------------
-- Simpatizantes por mesa (agregado: nunca personas)
create view public.v_registros_mesa as
select l.id as localidad_id, l.nombre as localidad, pu.id as puesto_id, pu.nombre as puesto,
       me.id as mesa_id, me.numero as mesa, count(*)::int as personas
from public.personas p
join public.mesas me      on me.id = p.mesa_id
join public.puestos pu    on pu.id = me.puesto_id
join public.localidades l on l.id = pu.localidad_id
where p.eliminado_en is null
  and p.organizacion_id = app.org_actual()
  and app.tiene_rol('admin', 'coordinador', 'candidato')
group by l.id, l.nombre, pu.id, pu.nombre, me.id, me.numero;

-- Calidad de los datos por líder
create view public.v_calidad_lideres as
select li.id as lider_id, li.nombre, li.meta_votos,
       count(p.id)::int                                                            as total,
       count(p.id) filter (where p.ubicacion_estado = 'completa')::int             as ubicados,
       count(p.id) filter (where p.ubicacion_estado = 'sin_mesa')::int             as sin_mesa,
       count(p.id) filter (where p.ubicacion_estado = 'por_revisar')::int          as por_revisar,
       count(p.id) filter (where p.ubicacion_estado = 'sin_dato')::int             as sin_lugar,
       count(p.id) filter (where p.sexo is null)::int                              as sin_sexo,
       count(p.id) filter (where p.fecha_nacimiento is null and p.edad_declarada is null)::int as sin_edad,
       count(p.id) filter (where p.telefono is null)::int                          as sin_telefono,
       count(p.id) filter (where p.consentimiento_en is null)::int                 as sin_consentimiento,
       count(p.id) filter (where p.origen = 'importacion')::int                    as importados,
       max(p.creado_en)                                                            as ultimo_registro
from public.lideres li
left join public.personas p on p.lider_id = li.id and p.eliminado_en is null
where li.organizacion_id = app.org_actual()
  and li.activo
  and (app.tiene_rol('admin', 'candidato')
       or (app.tiene_rol('coordinador') and li.coordinador_id = auth.uid())
       or (app.tiene_rol('lider') and li.perfil_id = auth.uid()))
group by li.id, li.nombre, li.meta_votos;

grant select on public.v_e14_plantilla, public.v_registros_mesa, public.v_calidad_lideres to authenticated;

-- ---------------------------------------------------------------------
-- Exportaciones: quedan en la auditoría (quién exportó qué y cuántas filas)
-- ---------------------------------------------------------------------
alter table public.auditoria drop constraint auditoria_accion_check;
alter table public.auditoria add constraint auditoria_accion_check check (accion in ('INSERT', 'UPDATE', 'DELETE', 'EXPORT'));

create or replace function public.registrar_exportacion(p_tipo text, p_filas int, p_filtros jsonb default '{}')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if app.org_actual() is null then raise exception 'Sin acceso'; end if;
  insert into public.auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (app.org_actual(), 'exportacion', p_tipo, 'EXPORT',
          jsonb_build_object('tipo', p_tipo, 'filas', p_filas, 'filtros', coalesce(p_filtros, '{}'::jsonb), 'rol', app.rol_actual()),
          auth.uid());
end $$;
revoke execute on function public.registrar_exportacion(text, int, jsonb) from public;
grant execute on function public.registrar_exportacion(text, int, jsonb) to authenticated;

revoke execute on all functions in schema app from public;
grant  execute on all functions in schema app to authenticated;
