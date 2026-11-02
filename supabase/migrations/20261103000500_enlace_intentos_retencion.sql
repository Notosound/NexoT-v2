-- =====================================================================
-- 0022 · Privacidad: las conexiones (IP) del formulario público solo se
--        guardan 2 días, lo justo para el límite contra abuso.
-- =====================================================================
create or replace function app.limpiar_enlace_intentos() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  delete from app.enlace_intentos where en < now() - interval '2 days';
  return null;
end $$;

create trigger limpiar after insert on app.enlace_intentos
  for each statement execute function app.limpiar_enlace_intentos();
