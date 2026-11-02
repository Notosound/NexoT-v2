-- =====================================================================
-- 0017 · E14 desde Excel: códigos de puesto alfanuméricos
-- =====================================================================
-- Error encontrado en la prueba completa: el Divipole tiene códigos de
-- puesto con letras (p. ej. Kennedy zona 08 puesto "B4", COLEGIO EL FERROL).
-- La importación quitaba todo lo que no fuera dígito, así que "B4" se leía
-- como "04" y la mesa se guardaba en OTRO puesto (CATALINA).
--
-- Corrección:
--   1. app.codigo_oficial(): normaliza sin perder letras ("4" → "04",
--      " b4 " → "B4").
--   2. Verificación cruzada: si la fila trae el nombre del puesto y no
--      corresponde al puesto de esos códigos (ni por nombre oficial ni por
--      un alias aprendido), la fila se rechaza en vez de guardarse en un
--      puesto equivocado.

create or replace function app.codigo_oficial(t text) returns text
language sql immutable as $$
  select case
    when v is null then null
    when v ~ '^[0-9]{1,3}$' then lpad((v::int)::text, 2, '0')
    when v ~ '^[A-Z0-9]+$'  then v
    else null
  end
  from (select nullif(upper(regexp_replace(coalesce(t, ''), '\s', '', 'g')), '') as v) x
$$;

create or replace function public.importar_e14(p_eleccion uuid, p_archivo text, p_filas jsonb, p_confirmar boolean default false)
returns table (fila int, estado text, mensaje text, mesa_id int, votos int)
language plpgsql security invoker set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  ele    public.elecciones;
  r      jsonb;
  v_fila int; v_loc int; v_puesto int; v_mesa int; v_votos int;
  v_txt  text; v_previo int;
  v_zona text; v_cod text; v_oficial text; v_ploc int; v_alias int;
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

    -- Puesto: por códigos oficiales (sin perder letras) o por nombre
    v_zona := app.codigo_oficial(r ->> 'zona');
    v_cod  := app.codigo_oficial(r ->> 'codigo_puesto');
    if v_zona is not null and v_cod is not null then
      select p.id, p.nombre, p.localidad_id into v_puesto, v_oficial, v_ploc from public.puestos p
        join public.localidades l on l.id = p.localidad_id
       where l.municipio_id = ele.municipio_id and p.zona = v_zona and p.codigo = v_cod;

      -- Verificación cruzada con el nombre, si viene
      if v_puesto is not null and app.normalizar(r ->> 'puesto') is not null
         and app.normalizar(r ->> 'puesto') <> app.normalizar(v_oficial) then
        select s.puesto_id into v_alias from app.sugerir_puesto(ele.organizacion_id, v_ploc, r ->> 'puesto', null) s
         where s.confianza = 'alta' and s.puesto_id = v_puesto limit 1;
        if v_alias is null then
          fila := v_fila; estado := 'error'; mesa_id := null; votos := v_votos;
          mensaje := format('el código %s-%s es "%s", no "%s": revisa la fila', v_zona, v_cod, v_oficial, r ->> 'puesto');
          return next; continue;
        end if;
      end if;
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
revoke execute on function app.codigo_oficial(text) from public;
grant execute on function app.codigo_oficial(text) to authenticated;
