-- =====================================================================
-- 0012 · Importación v3: conserva lo reportado y usa la ubicación automática
-- =====================================================================
-- * Si el puesto del Excel no coincide con el listado oficial, la persona
--   entra con el nombre/dirección reportados y queda "por revisar" (antes
--   el nombre se perdía).
-- * La validación de cada fila vive en app.validar_fila: los cambios
--   futuros solo tocan esa función.

alter table public.importacion_filas
  add column localidad_id        int,
  add column puesto_reportado    text,
  add column direccion_reportada text,
  add column mesa_reportada      int;

create or replace function app.validar_fila(imp public.importaciones, f public.importacion_filas, v_mun_nombre text)
returns public.importacion_filas
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  errs text[] := '{}';
  advs text[] := '{}';
  v_fecha date; v_edad_txt text; v_tel text; v_depto text; v_mesa_txt text;
  s record;
begin
  f.localidad_id := null; f.puesto_id := null; f.mesa_id := null; f.persona_id := null;

  -- ── Errores (bloquean) ────────────────────────────────────────────
  f.cedula := app.cedula_desde_texto(f.datos ->> 'cedula');
  if f.cedula is null then
    errs := errs || format('cédula inválida: "%s"', coalesce(f.datos ->> 'cedula', ''));
  end if;

  f.nombres   := nullif(regexp_replace(trim(coalesce(f.datos ->> 'nombres', '')), '\s+', ' ', 'g'), '');
  f.apellidos := coalesce(regexp_replace(trim(coalesce(f.datos ->> 'apellidos', '')), '\s+', ' ', 'g'), '');
  if f.nombres is null then errs := errs || 'falta el nombre'::text; end if;

  f.lider_id := null;
  if app.solo_digitos(f.datos ->> 'lider_cedula') is not null then
    select id into f.lider_id from public.lideres
    where organizacion_id = imp.organizacion_id and cedula = app.solo_digitos(f.datos ->> 'lider_cedula');
    if f.lider_id is null then errs := errs || format('líder no encontrado: "%s"', f.datos ->> 'lider_cedula'); end if;
  else
    f.lider_id := imp.lider_id_defecto;
    if f.lider_id is null then errs := errs || 'sin líder asignado'::text; end if;
  end if;

  -- ── Advertencias ──────────────────────────────────────────────────
  f.sexo := app.sexo_desde_texto(f.datos ->> 'sexo');
  if f.sexo is null and app.normalizar(f.datos ->> 'sexo') is not null then
    advs := advs || format('sexo no reconocido: "%s"', f.datos ->> 'sexo');
  end if;

  v_fecha := app.fecha_desde_texto(f.datos ->> 'fecha_nacimiento');
  if v_fecha is null and app.normalizar(f.datos ->> 'fecha_nacimiento') is not null then
    advs := advs || format('fecha de nacimiento no reconocida: "%s"', f.datos ->> 'fecha_nacimiento');
  end if;
  f.fecha_nacimiento := v_fecha;

  v_edad_txt := app.solo_digitos(f.datos ->> 'edad');
  f.edad_declarada := case when v_edad_txt is not null and length(v_edad_txt) <= 3 then v_edad_txt::smallint end;
  if app.normalizar(f.datos ->> 'edad') is not null
     and (f.edad_declarada is null or f.edad_declarada not between 18 and 120) then
    if f.edad_declarada between 0 and 17 then
      errs := errs || 'menor de edad'::text;
    else
      advs := advs || format('edad inválida: "%s"', f.datos ->> 'edad');
    end if;
    f.edad_declarada := null;
  end if;
  if coalesce(app.edad(f.fecha_nacimiento, null, null), 99) < 18 then
    errs := errs || 'menor de edad'::text;
    f.fecha_nacimiento := null;
  end if;

  f.fecha_registro_origen := app.fecha_desde_texto(f.datos ->> 'fecha_registro');

  v_tel := app.solo_digitos(f.datos ->> 'telefono');
  if v_tel ~ '^57[0-9]{10}$' then v_tel := substr(v_tel, 3); end if;
  f.telefono := v_tel;
  if v_tel is not null and v_tel !~ '^[0-9]{7,10}$' then
    advs := advs || format('teléfono inválido: "%s"', f.datos ->> 'telefono');
    f.telefono := null;
  end if;

  f.barrio := nullif(trim(f.datos ->> 'barrio'), '');

  -- ── Lugar de votación ─────────────────────────────────────────────
  f.puesto_reportado    := nullif(trim(f.datos ->> 'puesto'), '');
  f.direccion_reportada := nullif(trim(f.datos ->> 'direccion_puesto'), '');
  v_mesa_txt            := app.solo_digitos(f.datos ->> 'mesa');
  f.mesa_reportada      := case when length(v_mesa_txt) <= 4 then v_mesa_txt::int end;
  v_depto               := app.normalizar(f.datos ->> 'departamento');

  if app.normalizar(f.datos ->> 'localidad') is not null then
    f.localidad_id := app.buscar_localidad(imp.municipio_id, f.datos ->> 'localidad');
  end if;

  if f.localidad_id is null and (app.normalizar(f.datos ->> 'localidad') is not null or f.puesto_reportado is not null) then
    if v_depto is not null and v_depto <> v_mun_nombre then
      advs := advs || format('vota fuera del municipio (%s, %s)', f.datos ->> 'departamento', coalesce(f.datos ->> 'localidad', '?'));
      -- fuera del municipio: no se intenta ubicar en este catálogo
      f.puesto_reportado := null; f.direccion_reportada := null; f.mesa_reportada := null;
    else
      advs := advs || format('localidad no encontrada: "%s"', coalesce(f.datos ->> 'localidad', ''));
    end if;
  end if;

  if f.puesto_reportado is not null or f.direccion_reportada is not null then
    select * into s from app.sugerir_puesto(imp.organizacion_id, f.localidad_id, f.puesto_reportado, f.direccion_reportada) limit 1;
    if s.confianza = 'alta' then
      f.puesto_id := s.puesto_id;
      if f.mesa_reportada is not null then
        select id into f.mesa_id from public.mesas where puesto_id = f.puesto_id and numero = f.mesa_reportada;
        if f.mesa_id is null then
          advs := advs || format('la mesa %s no existe en ese puesto', f.mesa_reportada);
        end if;
      end if;
    else
      advs := advs || format('puesto por revisar: "%s"', coalesce(f.puesto_reportado, f.direccion_reportada));
    end if;
  end if;

  -- ── Estado ────────────────────────────────────────────────────────
  if cardinality(errs) > 0 then
    f.estado := 'con_errores';
  else
    select id into f.persona_id from public.personas
    where organizacion_id = imp.organizacion_id and cedula = f.cedula and eliminado_en is null;
    if f.persona_id is not null then
      f.estado := 'duplicada';
      errs := errs || 'ya existe en la base'::text;
    elsif exists (select 1 from public.importacion_filas o
                  where o.importacion_id = imp.id and o.fila < f.fila
                    and app.cedula_desde_texto(o.datos ->> 'cedula') = f.cedula) then
      f.estado := 'duplicada';
      errs := errs || 'cédula repetida en el mismo archivo'::text;
    else
      f.estado := 'valida';
    end if;
  end if;
  f.errores := errs; f.advertencias := advs;
  return f;
end $$;

create or replace function app.validar_importacion(p_importacion uuid) returns public.importaciones
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  imp public.importaciones;
  f   public.importacion_filas;
  v_mun_nombre text;
begin
  select * into imp from public.importaciones where id = p_importacion for update;
  if imp.id is null then raise exception 'Importación % no existe o no tiene acceso', p_importacion; end if;
  if imp.estado not in ('cargando','validada') then
    raise exception 'La importación está en estado % y no se puede validar', imp.estado;
  end if;
  select app.normalizar(departamento) into v_mun_nombre from public.municipios where id = imp.municipio_id;

  for f in select * from public.importacion_filas where importacion_id = p_importacion order by fila loop
    f := app.validar_fila(imp, f, v_mun_nombre);
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

create or replace function app.confirmar_importacion(p_importacion uuid) returns public.importaciones
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  imp public.importaciones;
  n   int;
begin
  select * into imp from public.importaciones where id = p_importacion for update;
  if imp.id is null then raise exception 'Importación % no existe o no tiene acceso', p_importacion; end if;
  if imp.estado <> 'validada' then
    raise exception 'Solo se puede confirmar una importación validada (estado actual: %)', imp.estado;
  end if;

  with nuevas as (
    insert into public.personas (
      organizacion_id, lider_id, cedula, nombres, apellidos, sexo,
      fecha_nacimiento, edad_declarada, edad_declarada_en, telefono, barrio,
      localidad_votacion_id, puesto_id, mesa_id, puesto_reportado, direccion_reportada, mesa_reportada,
      consentimiento_version, consentimiento_en, consentimiento_canal,
      origen, importacion_id, importacion_fila, fecha_registro_origen)
    select imp.organizacion_id, f.lider_id, f.cedula, f.nombres, f.apellidos, f.sexo,
           f.fecha_nacimiento, f.edad_declarada,
           case when f.edad_declarada is not null then imp.fecha_datos end,
           f.telefono, f.barrio,
           f.localidad_id, f.puesto_id, f.mesa_id, f.puesto_reportado, f.direccion_reportada, f.mesa_reportada,
           imp.consentimiento_version,
           case when imp.consentimiento_version is not null then imp.fecha_datos::timestamptz end,
           case when imp.consentimiento_version is not null then 'importacion' end,
           'importacion', imp.id, f.fila, f.fecha_registro_origen
    from public.importacion_filas f
    where f.importacion_id = p_importacion and f.estado = 'valida'
    returning id, importacion_fila
  )
  update public.importacion_filas f set estado = 'importada', persona_id = nuevas.id
  from nuevas where f.importacion_id = p_importacion and f.fila = nuevas.importacion_fila;
  get diagnostics n = row_count;

  update public.importaciones set estado = 'confirmada', filas_importadas = n, confirmado_en = now()
  where id = p_importacion returning * into imp;
  return imp;
end $$;

revoke execute on all functions in schema app from public;
grant  execute on all functions in schema app to authenticated;
