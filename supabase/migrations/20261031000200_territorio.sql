-- =====================================================================
-- 0002 · Catálogo territorial oficial (compartido por todas las organizaciones)
-- =====================================================================
-- Fuente: divisiones de la Registraduría. Solo se modifica con scripts de
-- carga (service role); los usuarios solo lo leen. Las personas y los
-- resultados E14 apuntan a estas tablas, así no existen "Kennedy" y
-- "kenedy" como lugares distintos.

create table public.municipios (
  id           serial primary key,
  divipola     text not null unique,            -- código DANE/Registraduría
  nombre       text not null,
  departamento text not null
);

-- Localidad (Bogotá) o comuna (otras ciudades)
create table public.localidades (
  id            serial primary key,
  municipio_id  int not null references public.municipios(id),
  codigo        text not null,
  nombre        text not null,
  unique (municipio_id, codigo),
  unique (municipio_id, nombre)
);

create table public.puestos (
  id            serial primary key,
  localidad_id  int not null references public.localidades(id),
  zona          text not null,                  -- zona electoral
  codigo        text not null,                  -- código del puesto dentro de la zona
  nombre        text not null,
  direccion     text,
  latitud       numeric(9,6) check (latitud between -90 and 90),
  longitud      numeric(9,6) check (longitud between -180 and 180),
  unique (localidad_id, zona, codigo)
);
create index puestos_localidad_idx on public.puestos(localidad_id);

create table public.mesas (
  id         serial primary key,
  puesto_id  int not null references public.puestos(id),
  numero     int not null check (numero > 0),
  unique (puesto_id, numero)
);

-- Lectura para cualquier usuario autenticado; escritura solo service role.
alter table public.municipios  enable row level security;
alter table public.localidades enable row level security;
alter table public.puestos     enable row level security;
alter table public.mesas       enable row level security;

create policy catalogo_lectura on public.municipios  for select to authenticated using (true);
create policy catalogo_lectura on public.localidades for select to authenticated using (true);
create policy catalogo_lectura on public.puestos     for select to authenticated using (true);
create policy catalogo_lectura on public.mesas       for select to authenticated using (true);

grant select on public.municipios, public.localidades, public.puestos, public.mesas to authenticated;
