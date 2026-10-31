-- =====================================================================
-- 0003 · Líderes y personas registradas
-- =====================================================================

-- ---------------------------------------------------------------------
-- Normalización de texto (minúsculas, sin tildes, espacios simples)
-- Se usa para comparar nombres de lugares y valores de Excel.
-- ---------------------------------------------------------------------
create or replace function app.normalizar(t text) returns text
language sql immutable as $$
  select nullif(regexp_replace(
           translate(lower(trim(coalesce(t, ''))),
                     'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun'),
           '\s+', ' ', 'g'), '')
$$;

-- ---------------------------------------------------------------------
-- Edad actual y rango de edad: definidos UNA vez y usados en todas partes.
-- Si hay fecha de nacimiento se usa; si no, la edad declarada se envejece
-- desde la fecha en que se capturó.
-- ---------------------------------------------------------------------
create or replace function app.edad(fecha_nacimiento date, edad_declarada smallint, edad_declarada_en date)
returns int language sql stable as $$
  select case
    when fecha_nacimiento is not null
      then extract(year from age(current_date, fecha_nacimiento))::int
    when edad_declarada is not null
      then edad_declarada + extract(year from age(current_date, coalesce(edad_declarada_en, current_date)))::int
  end
$$;

create or replace function app.rango_edad(edad int) returns text
language sql immutable as $$
  select case
    when edad is null then 'sin dato'
    when edad < 25 then '18-24'
    when edad < 35 then '25-34'
    when edad < 45 then '35-44'
    when edad < 55 then '45-54'
    when edad < 65 then '55-64'
    else '65+'
  end
$$;

-- ---------------------------------------------------------------------
-- Líderes
-- ---------------------------------------------------------------------
create table public.lideres (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references public.organizaciones(id),
  perfil_id        uuid unique references public.perfiles(id),      -- si el líder inicia sesión
  coordinador_id   uuid references public.perfiles(id),             -- perfil con rol coordinador
  nombre           text not null check (length(trim(nombre)) > 0),
  cedula           text check (cedula ~ '^[0-9]{3,10}$'),
  telefono         text check (telefono ~ '^[0-9]{7,10}$'),
  meta_votos       int not null default 0 check (meta_votos >= 0),
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  unique (id, organizacion_id)                                      -- para FK compuesta
);
create unique index lideres_cedula_uq on public.lideres(organizacion_id, cedula) where cedula is not null;
create index lideres_coordinador_idx on public.lideres(coordinador_id);
create trigger lideres_actualizado before update on public.lideres
  for each row execute function app.tocar_actualizado();

-- ---------------------------------------------------------------------
-- Personas (posibles votantes)
-- ---------------------------------------------------------------------
create table public.personas (
  id                     uuid primary key default gen_random_uuid(),
  organizacion_id        uuid not null references public.organizaciones(id),
  lider_id               uuid not null,

  cedula                 text not null check (cedula ~ '^[0-9]{3,10}$'),
  nombres                text not null check (length(trim(nombres)) > 0),
  apellidos              text not null default '',
  sexo                   text check (sexo in ('femenino','masculino','otro','no_informa')),
  fecha_nacimiento       date check (fecha_nacimiento > date '1900-01-01'),
  edad_declarada         smallint check (edad_declarada between 18 and 120),
  edad_declarada_en      date,
  telefono               text check (telefono ~ '^[0-9]{7,10}$'),

  -- Residencia (opcional)
  localidad_residencia_id int references public.localidades(id),
  barrio                  text,

  -- Lugar de votación: la mesa determina el puesto (se fija por trigger)
  puesto_id              int references public.puestos(id),
  mesa_id                int references public.mesas(id),

  -- Consentimiento (dato sensible: opinión política)
  consentimiento_version text,
  consentimiento_en      timestamptz,
  consentimiento_canal   text check (consentimiento_canal in ('formulario','presencial','importacion')),

  -- Trazabilidad de origen
  origen                 text not null default 'manual' check (origen in ('manual','formulario','importacion')),
  importacion_id         uuid,
  importacion_fila       int,

  creado_por             uuid default auth.uid(),
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  eliminado_en           timestamptz,                               -- borrado lógico: nada se borra de verdad
  eliminado_por          uuid,

  -- El líder debe ser de la MISMA organización: imposible mezclar clientes
  foreign key (lider_id, organizacion_id) references public.lideres(id, organizacion_id),
  check (edad_declarada is null or edad_declarada_en is not null),
  check ((consentimiento_en is null) = (consentimiento_canal is null))
);

-- Una cédula aparece una sola vez por organización (entre los no eliminados)
create unique index personas_cedula_uq on public.personas(organizacion_id, cedula) where eliminado_en is null;
create index personas_lider_idx  on public.personas(lider_id) where eliminado_en is null;
create index personas_mesa_idx   on public.personas(mesa_id)  where eliminado_en is null;
create index personas_puesto_idx on public.personas(puesto_id) where eliminado_en is null;

-- Reglas que no caben en un CHECK
create or replace function app.validar_persona() returns trigger
language plpgsql as $$
declare
  v_edad int;
  v_puesto int;
begin
  new.nombres   := initcap(regexp_replace(trim(new.nombres), '\s+', ' ', 'g'));
  new.apellidos := initcap(regexp_replace(trim(coalesce(new.apellidos, '')), '\s+', ' ', 'g'));

  v_edad := app.edad(new.fecha_nacimiento, new.edad_declarada, new.edad_declarada_en);
  if v_edad is not null and v_edad < 18 then
    raise exception 'La persona debe ser mayor de edad (edad calculada: %)', v_edad
      using errcode = 'check_violation';
  end if;

  -- Si hay mesa, el puesto sale de la mesa (nunca se contradicen)
  if new.mesa_id is not null then
    select puesto_id into v_puesto from public.mesas where id = new.mesa_id;
    if new.puesto_id is not null and new.puesto_id <> v_puesto then
      raise exception 'La mesa % no pertenece al puesto %', new.mesa_id, new.puesto_id
        using errcode = 'check_violation';
    end if;
    new.puesto_id := v_puesto;
  end if;

  if tg_op = 'UPDATE' then
    new.actualizado_en := now();
  end if;
  return new;
end $$;

create trigger personas_validar before insert or update on public.personas
  for each row execute function app.validar_persona();

-- Prohibido el borrado físico: se usa eliminado_en
create or replace function app.impedir_borrado() returns trigger
language plpgsql as $$
begin
  raise exception 'No se permite borrar registros de %; use borrado lógico', tg_table_name
    using errcode = 'insufficient_privilege';
end $$;

create trigger personas_sin_borrado before delete on public.personas
  for each row execute function app.impedir_borrado();
create trigger lideres_sin_borrado before delete on public.lideres
  for each row execute function app.impedir_borrado();

-- Borrado lógico con registro de quién lo hizo
create or replace function app.eliminar_persona(p_id uuid) returns void
language sql security invoker as $$
  update public.personas set eliminado_en = now(), eliminado_por = auth.uid()
  where id = p_id and eliminado_en is null
$$;
