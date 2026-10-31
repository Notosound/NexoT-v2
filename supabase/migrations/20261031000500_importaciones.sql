-- =====================================================================
-- 0005 · Importación de Excel por etapas
-- =====================================================================
-- Flujo:
--   1. El navegador lee el Excel, mapea columnas a nombres canónicos y
--      guarda cada fila en importacion_filas.datos (jsonb).
--   2. app.validar_importacion(id) normaliza y valida cada fila y marca
--      errores y duplicados. No toca la tabla personas.
--   3. El admin revisa el reporte y llama app.confirmar_importacion(id):
--      solo las filas válidas entran a personas, cada una con el archivo
--      y la fila de donde vino.
--
-- Claves canónicas esperadas en datos:
--   cedula, nombres, apellidos, sexo, fecha_nacimiento, edad, telefono,
--   barrio, localidad, puesto, mesa, lider_cedula

create table public.importaciones (
  id                      uuid primary key default gen_random_uuid(),
  organizacion_id         uuid not null references public.organizaciones(id),
  archivo                 text not null,
  municipio_id            int not null references public.municipios(id),
  lider_id_defecto        uuid,                         -- si el Excel no trae líder por fila
  fecha_datos             date not null default current_date,  -- cuándo se capturó la info (para edades)
  consentimiento_version  text,                         -- versión del aviso que aceptaron, si se conoce
  estado                  text not null default 'cargando'
                          check (estado in ('cargando','validada','confirmada','cancelada')),
  total_filas             int not null default 0,
  filas_validas           int not null default 0,
  filas_con_errores       int not null default 0,
  filas_duplicadas        int not null default 0,
  filas_importadas        int not null default 0,
  subido_por              uuid default auth.uid(),
  creado_en               timestamptz not null default now(),
  confirmado_en           timestamptz,
  foreign key (lider_id_defecto, organizacion_id) references public.lideres(id, organizacion_id)
);

create table public.importacion_filas (
  id               bigserial primary key,
  importacion_id   uuid not null references public.importaciones(id),
  organizacion_id  uuid not null references public.organizaciones(id),
  fila             int not null,                       -- número de fila en el Excel
  datos            jsonb not null,                     -- valores originales tal cual
  -- valores normalizados
  cedula           text,
  nombres          text,
  apellidos        text,
  sexo             text,
  fecha_nacimiento date,
  edad_declarada   smallint,
  telefono         text,
  barrio           text,
  puesto_id        int,
  mesa_id          int,
  lider_id         uuid,
  errores          text[] not null default '{}',
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente','valida','con_errores','duplicada','importada')),
  persona_id       uuid,                               -- persona creada, o la existente si es duplicada
  unique (importacion_id, fila)
);
create index importacion_filas_estado_idx on public.importacion_filas(importacion_id, estado);

-- Persona → importación (definida aquí porque la tabla se crea en esta migración)
alter table public.personas
  add constraint personas_importacion_fk foreign key (importacion_id) references public.importaciones(id);

-- ---------------------------------------------------------------------
-- Conversión de valores sueltos de Excel
-- ---------------------------------------------------------------------
create or replace function app.solo_digitos(t text) returns text
language sql immutable as $$ select nullif(regexp_replace(coalesce(t,''), '[^0-9]', '', 'g'), '') $$;

create or replace function app.sexo_desde_texto(t text) returns text
language sql immutable as $$
  select case app.normalizar(t)
    when 'f' then 'femenino' when 'fem' then 'femenino' when 'femenino' then 'femenino' when 'mujer' then 'femenino'
    when 'm' then 'masculino' when 'masc' then 'masculino' when 'masculino' then 'masculino' when 'hombre' then 'masculino'
    when 'otro' then 'otro' when 'o' then 'otro'
    when 'no informa' then 'no_informa' when 'n/a' then 'no_informa' when 'nr' then 'no_informa'
  end
$$;

-- Acepta 1990-05-21, 21/05/1990, 21-05-1990
create or replace function app.fecha_desde_texto(t text) returns date
language plpgsql immutable as $$
declare s text := trim(coalesce(t, ''));
begin
  if s = '' then return null; end if;
  if s ~ '^\d{4}-\d{1,2}-\d{1,2}' then return to_date(left(s, 10), 'YYYY-MM-DD'); end if;
  if s ~ '^\d{1,2}[/-]\d{1,2}[/-]\d{4}$' then return to_date(replace(s, '-', '/'), 'DD/MM/YYYY'); end if;
  return null;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Paso 2: validar
-- ---------------------------------------------------------------------
create or replace function app.validar_importacion(p_importacion uuid) returns public.importaciones
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  imp   public.importaciones;
  f     public.importacion_filas;
  errs  text[];
  v_loc int; v_puesto int; v_mesa int; v_lider uuid; v_existente uuid;
  v_fecha date; v_edad_txt text; v_tel text;
begin
  select * into imp from public.importaciones where id = p_importacion for update;
  if imp.id is null then raise exception 'Importación % no existe o no tiene acceso', p_importacion; end if;
  if imp.estado not in ('cargando','validada') then
    raise exception 'La importación está en estado % y no se puede validar', imp.estado;
  end if;

  for f in select * from public.importacion_filas where importacion_id = p_importacion order by fila loop
    errs := '{}';
    v_loc := null; v_puesto := null; v_mesa := null; v_lider := null; v_existente := null;

    -- Cédula
    f.cedula := app.solo_digitos(f.datos ->> 'cedula');
    if f.cedula is null or f.cedula !~ '^[0-9]{3,10}$' then
      errs := errs || format('cédula inválida: "%s"', coalesce(f.datos ->> 'cedula', ''));
    end if;

    -- Nombres
    f.nombres   := nullif(trim(f.datos ->> 'nombres'), '');
    f.apellidos := coalesce(trim(f.datos ->> 'apellidos'), '');
    if f.nombres is null then errs := errs || 'falta el nombre'::text; end if;

    -- Sexo
    f.sexo := app.sexo_desde_texto(f.datos ->> 'sexo');
    if f.sexo is null and app.normalizar(f.datos ->> 'sexo') is not null then
      errs := errs || format('sexo no reconocido: "%s"', f.datos ->> 'sexo');
    end if;

    -- Fecha de nacimiento / edad
    v_fecha := app.fecha_desde_texto(f.datos ->> 'fecha_nacimiento');
    if v_fecha is null and app.normalizar(f.datos ->> 'fecha_nacimiento') is not null then
      errs := errs || format('fecha de nacimiento no reconocida: "%s"', f.datos ->> 'fecha_nacimiento');
    end if;
    f.fecha_nacimiento := v_fecha;
    v_edad_txt := app.solo_digitos(f.datos ->> 'edad');
    f.edad_declarada := case when v_edad_txt is not null and length(v_edad_txt) <= 3 then v_edad_txt::smallint end;
    if app.normalizar(f.datos ->> 'edad') is not null
       and (f.edad_declarada is null or f.edad_declarada not between 18 and 120) then
      errs := errs || format('edad inválida: "%s"', f.datos ->> 'edad');
      f.edad_declarada := null;
    end if;
    if coalesce(app.edad(f.fecha_nacimiento, f.edad_declarada, imp.fecha_datos), 99) < 18 then
      errs := errs || 'menor de edad'::text;
    end if;

    -- Teléfono (quita +57)
    v_tel := app.solo_digitos(f.datos ->> 'telefono');
    if v_tel ~ '^57[0-9]{10}$' then v_tel := substr(v_tel, 3); end if;
    f.telefono := v_tel;
    if v_tel is not null and v_tel !~ '^[0-9]{7,10}$' then
      errs := errs || format('teléfono inválido: "%s"', f.datos ->> 'telefono');
      f.telefono := null;
    end if;

    f.barrio := nullif(trim(f.datos ->> 'barrio'), '');

    -- Lugar de votación: localidad → puesto → mesa, comparando sin tildes ni mayúsculas
    if app.normalizar(f.datos ->> 'localidad') is not null then
      select id into v_loc from public.localidades
      where municipio_id = imp.municipio_id and app.normalizar(nombre) = app.normalizar(f.datos ->> 'localidad');
      if v_loc is null then errs := errs || format('localidad no encontrada: "%s"', f.datos ->> 'localidad'); end if;
    end if;
    if app.normalizar(f.datos ->> 'puesto') is not null then
      if v_loc is null then
        errs := errs || 'hay puesto pero no localidad válida'::text;
      else
        select id into v_puesto from public.puestos
        where localidad_id = v_loc and app.normalizar(nombre) = app.normalizar(f.datos ->> 'puesto');
        if v_puesto is null then errs := errs || format('puesto no encontrado en la localidad: "%s"', f.datos ->> 'puesto'); end if;
      end if;
    end if;
    if app.solo_digitos(f.datos ->> 'mesa') is not null then
      if v_puesto is null then
        errs := errs || 'hay mesa pero no puesto válido'::text;
      else
        select id into v_mesa from public.mesas
        where puesto_id = v_puesto and numero = app.solo_digitos(f.datos ->> 'mesa')::int;
        if v_mesa is null then errs := errs || format('la mesa %s no existe en ese puesto', f.datos ->> 'mesa'); end if;
      end if;
    end if;
    f.puesto_id := v_puesto; f.mesa_id := v_mesa;

    -- Líder: por cédula en la fila, o el de la importación
    if app.solo_digitos(f.datos ->> 'lider_cedula') is not null then
      select id into v_lider from public.lideres
      where organizacion_id = imp.organizacion_id and cedula = app.solo_digitos(f.datos ->> 'lider_cedula');
      if v_lider is null then errs := errs || format('líder no encontrado: "%s"', f.datos ->> 'lider_cedula'); end if;
    else
      v_lider := imp.lider_id_defecto;
      if v_lider is null then errs := errs || 'sin líder asignado'::text; end if;
    end if;
    f.lider_id := v_lider;

    -- Estado
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
                      and app.solo_digitos(o.datos ->> 'cedula') = f.cedula) then
        f.estado := 'duplicada';
        errs := errs || 'cédula repetida en el mismo archivo'::text;
      else
        f.estado := 'valida';
      end if;
    end if;
    f.errores := errs;

    update public.importacion_filas set
      cedula = f.cedula, nombres = f.nombres, apellidos = f.apellidos, sexo = f.sexo,
      fecha_nacimiento = f.fecha_nacimiento, edad_declarada = f.edad_declarada,
      telefono = f.telefono, barrio = f.barrio, puesto_id = f.puesto_id, mesa_id = f.mesa_id,
      lider_id = f.lider_id, errores = f.errores, estado = f.estado, persona_id = f.persona_id
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
-- Paso 3: confirmar (todo o nada, en una transacción)
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
      origen, importacion_id, importacion_fila)
    select imp.organizacion_id, f.lider_id, f.cedula, f.nombres, f.apellidos, f.sexo,
           f.fecha_nacimiento, f.edad_declarada,
           case when f.edad_declarada is not null then imp.fecha_datos end,
           f.telefono, f.barrio, f.puesto_id, f.mesa_id,
           imp.consentimiento_version,
           case when imp.consentimiento_version is not null then imp.fecha_datos::timestamptz end,
           case when imp.consentimiento_version is not null then 'importacion' end,
           'importacion', imp.id, f.fila
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
