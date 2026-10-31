-- =====================================================================
-- Crear la organización y el primer administrador (UNA sola vez)
-- =====================================================================
-- 1. En Supabase → Authentication → Users → "Invite user", invita tu correo
--    y acepta la invitación (te llega un correo para poner tu contraseña).
-- 2. Cambia los tres valores marcados y ejecuta esto en Supabase → SQL Editor.
-- A partir de ahí, los demás usuarios se vinculan desde el panel (Equipo).

with nueva as (
  insert into public.organizaciones (nombre, slug)
  values ('Campaña Senador', 'campana-senador')          -- ← nombre y slug (minúsculas, sin espacios)
  returning id
)
insert into public.perfiles (id, organizacion_id, nombre, rol)
select u.id, nueva.id, 'Tu nombre', 'admin'                -- ← tu nombre
from auth.users u, nueva
where lower(u.email) = lower('tu-correo@ejemplo.com');    -- ← tu correo

-- Debe decir "INSERT 0 1". Si dice "INSERT 0 0", el correo no coincide con
-- ningún usuario invitado.
