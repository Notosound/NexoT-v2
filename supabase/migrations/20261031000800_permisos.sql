-- =====================================================================
-- 0008 · Permisos por fila (RLS)
-- =====================================================================
-- Regla general: nadie ve nada fuera de su organización, y dentro de ella
-- cada rol ve solo lo que necesita. El candidato NO tiene acceso a la
-- tabla personas: solo a las vistas agregadas (migración 0007).

-- Líderes que el usuario actual puede ver/gestionar
create or replace function app.mis_lideres() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.lideres
  where organizacion_id = app.org_actual()
    and (app.tiene_rol('admin')
         or (app.tiene_rol('coordinador') and coordinador_id = auth.uid())
         or (app.tiene_rol('lider') and perfil_id = auth.uid()))
$$;
grant execute on function app.mis_lideres() to authenticated;

alter table public.organizaciones     enable row level security;
alter table public.perfiles           enable row level security;
alter table public.lideres            enable row level security;
alter table public.personas           enable row level security;
alter table public.auditoria          enable row level security;
alter table public.importaciones      enable row level security;
alter table public.importacion_filas  enable row level security;
alter table public.elecciones         enable row level security;
alter table public.e14_digitaciones   enable row level security;
alter table public.e14_resultados     enable row level security;

-- Organizaciones
create policy org_ver on public.organizaciones for select to authenticated
  using (id = app.org_actual());

-- Perfiles: cada uno se ve a sí mismo; el admin ve y gestiona su organización
create policy perfil_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or (organizacion_id = app.org_actual() and app.tiene_rol('admin')));
create policy perfil_admin on public.perfiles for update to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin'))
  with check (organizacion_id = app.org_actual());

-- Líderes
create policy lider_ver on public.lideres for select to authenticated
  using (id in (select app.mis_lideres()));
create policy lider_crear on public.lideres for insert to authenticated
  with check (organizacion_id = app.org_actual()
              and (app.tiene_rol('admin')
                   or (app.tiene_rol('coordinador') and coordinador_id = auth.uid())));
create policy lider_editar on public.lideres for update to authenticated
  using (id in (select app.mis_lideres()) and app.tiene_rol('admin','coordinador'))
  with check (organizacion_id = app.org_actual());

-- Personas: admin toda la organización; coordinador las de sus líderes;
-- líder solo las suyas. Candidato y digitador: nada.
create policy persona_ver on public.personas for select to authenticated
  using (organizacion_id = app.org_actual() and lider_id in (select app.mis_lideres()));
create policy persona_crear on public.personas for insert to authenticated
  with check (organizacion_id = app.org_actual() and lider_id in (select app.mis_lideres()));
create policy persona_editar on public.personas for update to authenticated
  using (organizacion_id = app.org_actual() and lider_id in (select app.mis_lideres()))
  with check (organizacion_id = app.org_actual() and lider_id in (select app.mis_lideres()));

-- Auditoría: solo lectura para el admin
create policy auditoria_ver on public.auditoria for select to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin'));

-- Importaciones: solo admin
create policy importacion_admin on public.importaciones for all to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin'))
  with check (organizacion_id = app.org_actual() and app.tiene_rol('admin'));
create policy importacion_filas_admin on public.importacion_filas for all to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin'))
  with check (organizacion_id = app.org_actual() and app.tiene_rol('admin'));

-- Elecciones
create policy eleccion_ver on public.elecciones for select to authenticated
  using (organizacion_id = app.org_actual());
create policy eleccion_admin on public.elecciones for insert to authenticated
  with check (organizacion_id = app.org_actual() and app.tiene_rol('admin'));
create policy eleccion_editar on public.elecciones for update to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin'));

-- Digitaciones E14: el digitador solo ve y corrige lo suyo (no la del otro)
create policy digitacion_ver on public.e14_digitaciones for select to authenticated
  using (organizacion_id = app.org_actual()
         and (app.tiene_rol('admin') or digitado_por = auth.uid()));
create policy digitacion_crear on public.e14_digitaciones for insert to authenticated
  with check (organizacion_id = app.org_actual()
              and app.tiene_rol('admin','digitador')
              and digitado_por = auth.uid());
create policy digitacion_corregir on public.e14_digitaciones for update to authenticated
  using (organizacion_id = app.org_actual() and digitado_por = auth.uid())
  with check (digitado_por = auth.uid());

-- Resultados E14: los escribe el trigger; el admin puede leerlos y resolverlos
create policy resultado_ver on public.e14_resultados for select to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin'));
create policy resultado_resolver on public.e14_resultados for update to authenticated
  using (organizacion_id = app.org_actual() and app.tiene_rol('admin'));

-- Privilegios de tabla (RLS decide además qué filas)
grant select                 on public.organizaciones to authenticated;
grant select, update         on public.perfiles to authenticated;
grant select, insert, update on public.lideres, public.personas to authenticated;
grant select                 on public.auditoria to authenticated;
grant select, insert, update on public.importaciones, public.importacion_filas to authenticated;
grant select, insert, update on public.elecciones, public.e14_digitaciones to authenticated;
grant select, update         on public.e14_resultados to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Las vistas internas del esquema app no se exponen
revoke all on all tables in schema app from public;

-- Usuarios no autenticados: nada
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all functions in schema app from anon';
  end if;
end $$;

-- Funciones del esquema app: solo usuarios autenticados
revoke execute on all functions in schema app from public;
grant  execute on all functions in schema app to authenticated;
