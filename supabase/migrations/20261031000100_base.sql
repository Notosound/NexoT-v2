-- =====================================================================
-- 0001 · Base: organizaciones, perfiles con rol y funciones de apoyo
-- =====================================================================
-- Cada cliente (campaña) es una organización. Todo dato de negocio
-- pertenece a una organización y los permisos se aplican por ella.

create schema if not exists app;

-- ---------------------------------------------------------------------
-- Organizaciones (clientes)
-- ---------------------------------------------------------------------
create table public.organizaciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(trim(nombre)) > 0),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,50}$'),
  activa      boolean not null default true,
  creado_en   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Perfiles: un usuario de Supabase Auth = un perfil en una organización
-- ---------------------------------------------------------------------
-- Roles:
--   admin        acceso completo a su organización
--   coordinador  ve y gestiona los líderes a su cargo y sus registros
--   lider        registra personas y ve solo las suyas
--   digitador    transcribe resultados E14, no ve personas
--   candidato    ve solo métricas agregadas, nunca datos personales
create table public.perfiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  organizacion_id  uuid not null references public.organizaciones(id),
  nombre           text not null check (length(trim(nombre)) > 0),
  rol              text not null check (rol in ('admin','coordinador','lider','digitador','candidato')),
  activo           boolean not null default true,
  creado_en        timestamptz not null default now()
);
create index perfiles_org_idx on public.perfiles(organizacion_id);

-- ---------------------------------------------------------------------
-- Funciones de apoyo para los permisos (leen el perfil del usuario actual)
-- security definer: pueden leer perfiles aunque el usuario no tenga
-- permiso directo sobre la tabla; search_path fijo por seguridad.
-- ---------------------------------------------------------------------
create or replace function app.org_actual() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select organizacion_id from public.perfiles where id = auth.uid() and activo
$$;

create or replace function app.rol_actual() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

create or replace function app.tiene_rol(variadic roles text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app.rol_actual() = any(roles), false)
$$;

-- Fecha de actualización automática
create or replace function app.tocar_actualizado() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;
