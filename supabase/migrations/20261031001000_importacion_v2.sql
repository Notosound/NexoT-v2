-- =====================================================================
-- 0010 · Importación ajustada al formato real de los Excel
-- =====================================================================
-- Cambios respecto a 0005 (no se editan migraciones ya aplicadas):
--   * Errores (bloquean la fila) vs advertencias (la persona entra, pero
--     con el dato vacío y queda señalada para revisión).
--       Error:       cédula, nombre, líder, menor de edad
--       Advertencia: lugar de votación, teléfono, sexo, fechas
--   * La cédula solo admite dígitos con puntos/espacios/comas de
--     separación. Antes "12345+6-" se convertía en "123456": una cédula
--     distinta sin avisar. Ahora es un error.
--   * Se conserva la fecha de registro original del archivo.
--   * Personas que votan fuera del municipio quedan con advertencia.

alter table public.importacion_filas
  add column advertencias          text[] not null default '{}',
  add column fecha_registro_origen date;

alter table public.personas
  add column fecha_registro_origen date;      -- cuándo se registró según la fuente original

-- Cédula: solo dígitos, admitiendo separadores de miles. Cualquier otro
-- carácter hace la cédula inválida (null) en vez de "limpiarla".
create or replace function app.cedula_desde_texto(t text) returns text
language sql immutable as $$
  select case
    when regexp_replace(coalesce(t, ''), '[\s.,]', '', 'g') ~ '^[0-9]{3,10}$'
      then regexp_replace(t, '[\s.,]', '', 'g')
  end
$$;

-- Personas sin lugar de votación, para completar a mano (solo admin)
create view public.v_personas_por_ubicar as
select p.id, p.cedula, p.nombres, p.apellidos, li.nombre as lider, p.origen,
       p.importacion_id, p.importacion_fila, f.datos as datos_originales, f.advertencias
from public.personas p
join public.lideres li on li.id = p.lider_id
left join public.importacion_filas f on f.importacion_id = p.importacion_id and f.fila = p.importacion_fila
where p.eliminado_en is null and p.mesa_id is null
  and p.organizacion_id = app.org_actual()
  and app.tiene_rol('admin');
grant select on public.v_personas_por_ubicar to authenticated;

-- ---------------------------------------------------------------------
-- Validación (reemplaza la de 0005)
-- ---------------------------------------------------------------------
create or replace function app.validar_importacion(p_importacion uuid) returns public.importaciones
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  imp   public.importaciones;
  f     public.importacion_filas;
  errs  text[];
  advs  text[];
  v_loc int; v_puesto int; v_mesa int; v_lider uuid; v_existente uuid;
  v_fecha date; v_edad_txt text; v_tel text; v_depto text; v_mun_nombre text;
begin
  select * into imp from public.importaciones where id = p_importacion for update;
  if imp.id is null then raise exception 'Importación % no existe o no tiene acceso', p_importacion; end if;
  if imp.estado not in ('cargando','validada') then
    raise exception 'La importación está en estado % y no se puede validar', imp.estado;
  end if;
  select app.normalizar(departamento) into v_mun_nombre from public.municipios where id = imp.municipio_id;

  for f in select * from public.importacion_filas where importacion_id = p_importacion order by fila loop
    errs := '{}'; advs := '{}';
    v_loc := null; v_puesto := null; v_mesa := null; v_lider := null; v_existente := null;

    -- ── Errores (bloquean) ──────────────────────────────────────────
    f.cedula := app.cedula_desde_texto(f.datos ->> 'cedula');
    if f.cedula is null then
      errs := errs || format('cédula inválida: "%s"', coalesce(f.datos ->> 'cedula', ''));
    end if;

    f.nombres   := nullif(regexp_replace(trim(coalesce(f.datos ->> 'nombres', '')), '\s+', ' ', 'g'), '');
    f.apellidos := coalesce(regexp_replace(trim(coalesce(f.datos ->> 'apellidos', '')), '\s+', ' ', 'g'), '');
    if f.nombres is null then errs := errs || 'falta el nombre'::text; end if;

    if app.solo_digitos(f.datos ->> 'lider_cedula') is not null then
      select id into v_lider from public.lideres
      where organizacion_id = imp.organizacion_id and cedula = app.solo_digitos(f.datos ->> 'lider_cedula');
      if v_lider is null then errs := errs || format('líder no encontrado: "%s"', f.datos ->> 'lider_cedula'); end if;
    else
      v_lider := imp.lider_id_defecto;
      if v_lider is null then errs := errs || 'sin líder asignado'::text; end if;
    end if;
    f.lider_id := v_lider;

    -- ── Advertencias (la persona entra con el dato vacío) ───────────
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

    -- Fecha de registro en la fuente ("Invalid Date" del piloto → vacía, sin ruido)
    f.fecha_registro_origen := app.fecha_desde_texto(f.datos ->> 'fecha_registro');

    v_tel := app.solo_digitos(f.datos ->> 'telefono');
    if v_tel ~ '^57[0-9]{10}$' then v_tel := substr(v_tel, 3); end if;
    f.telefono := v_tel;
    if v_tel is not null and v_tel !~ '^[0-9]{7,10}$' then
      advs := advs || format('teléfono inválido: "%s"', f.datos ->> 'telefono');
      f.telefono := null;
    end if;

    f.barrio := nullif(trim(f.datos ->> 'barrio'), '');

    -- Lugar de votación
    v_depto := app.normalizar(f.datos ->> 'departamento');
    if app.normalizar(f.datos ->> 'localidad') is not null then
      v_loc := app.buscar_localidad(imp.municipio_id, f.datos ->> 'localidad');
    end if;
    if v_loc is null and (app.normalizar(f.datos ->> 'localidad') is not null or app.normalizar(f.datos ->> 'puesto') is not null) then
      if v_depto is not null and v_depto <> v_mun_nombre then
        advs := advs || format('vota fuera del municipio (%s, %s)', f.datos ->> 'departamento', coalesce(f.datos ->> 'localidad', '?'));
      else
        advs := advs || format('localidad no encontrada: "%s"', coalesce(f.datos ->> 'localidad', ''));
      end if;
    end if;
    if v_loc is not null and app.normalizar(f.datos ->> 'puesto') is not null then
      select id into v_puesto from public.puestos
      where localidad_id = v_loc and app.normalizar(nombre) = app.normalizar(f.datos ->> 'puesto');
      if v_puesto is null then
        advs := advs || format('puesto no encontrado en %s: "%s"', f.datos ->> 'localidad', f.datos ->> 'puesto');
      end if;
    end if;
    if v_puesto is not null and app.solo_digitos(f.datos ->> 'mesa') is not null then
      select id into v_mesa from public.mesas
      where puesto_id = v_puesto and numero = app.solo_digitos(f.datos ->> 'mesa')::int;
      if v_mesa is null then
        advs := advs || format('la mesa %s no existe en ese puesto', f.datos ->> 'mesa');
      end if;
    end if;
    f.puesto_id := v_puesto; f.mesa_id := v_mesa;

    -- ── Estado ──────────────────────────────────────────────────────
    f.persona_id := null;
    if cardinality(errs) > 0 then
      f.estado := 'con_errores';
    else
      select id into v_existente from public.personas
      where organizacion_id = imp.organizacion_id and cedula = f.cedula and eliminado_en is null;
      if v_existente is not null then
        f.estado := 'duplicada'; f.persona_id := v_existente;
        errs := errs || 'ya existe en la base'::text;
      elsif exists (select 1 from public.importacion_filas o
                    where o.importacion_id = p_importacion and o.fila < f.fila
                      and app.cedula_desde_texto(o.datos ->> 'cedula') = f.cedula) then
        f.estado := 'duplicada';
        errs := errs || 'cédula repetida en el mismo archivo'::text;
      else
        f.estado := 'valida';
      end if;
    end if;
    f.errores := errs; f.advertencias := advs;

    update public.importacion_filas set
      cedula = f.cedula, nombres = f.nombres, apellidos = f.apellidos, sexo = f.sexo,
      fecha_nacimiento = f.fecha_nacimiento, edad_declarada = f.edad_declarada,
      telefono = f.telefono, barrio = f.barrio, puesto_id = f.puesto_id, mesa_id = f.mesa_id,
      lider_id = f.lider_id, errores = f.errores, advertencias = f.advertencias,
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

-- ---------------------------------------------------------------------
-- Confirmación (reemplaza la de 0005: agrega la fecha de registro original)
-- ---------------------------------------------------------------------
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
      puesto_id, mesa_id, consentimiento_version, consentimiento_en, consentimiento_canal,
      origen, importacion_id, importacion_fila, fecha_registro_origen)
    select imp.organizacion_id, f.lider_id, f.cedula, f.nombres, f.apellidos, f.sexo,
           f.fecha_nacimiento, f.edad_declarada,
           case when f.edad_declarada is not null then imp.fecha_datos end,
           f.telefono, f.barrio, f.puesto_id, f.mesa_id,
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

-- Reaplicar restricciones de ejecución a las funciones nuevas
revoke execute on all functions in schema app from public;
grant  execute on all functions in schema app to authenticated;
