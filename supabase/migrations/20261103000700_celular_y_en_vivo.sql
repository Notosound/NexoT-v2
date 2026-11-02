-- =====================================================================
-- 0024 · Celular obligatorio y aviso de cambios "en vivo"
-- =====================================================================

-- ── Celular obligatorio en todo registro nuevo hecho en la plataforma ──
-- (registro manual y formulario del enlace). Las listas importadas de
-- Excel quedan exentas: muchas no traen celular y quedan con advertencia.
-- Solo aplica al crear: los registros viejos sin celular siguen válidos.
create or replace function app.exigir_celular() returns trigger
language plpgsql as $$
begin
  if new.origen <> 'importacion' and (auth.uid() is not null or new.origen = 'formulario') then
    if new.telefono is null then
      raise exception 'El celular es obligatorio' using errcode = 'check_violation';
    end if;
    if new.telefono !~ '^3[0-9]{9}$' then
      raise exception 'El celular debe tener 10 dígitos y empezar por 3' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger personas_exigir_celular before insert on public.personas
  for each row execute function app.exigir_celular();

-- ── En vivo ──
-- Una fila por organización y tema con la hora del último cambio. No
-- guarda datos personales: solo "algo cambió". El panel escucha esta
-- tabla (Supabase Realtime) y vuelve a pedir sus cifras al instante.
create table public.actividad (
  organizacion_id uuid not null references public.organizaciones(id),
  tema            text not null check (tema in ('registros', 'e14')),
  en              timestamptz not null default now(),
  primary key (organizacion_id, tema)
);
alter table public.actividad enable row level security;
create policy actividad_ver on public.actividad for select to authenticated
  using (organizacion_id = app.org_actual());
grant select on public.actividad to authenticated;

create or replace function app.marcar_actividad() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org  uuid := coalesce(new.organizacion_id, old.organizacion_id);
  v_tema text := case when tg_table_name in ('e14_resultados', 'e14_digitaciones') then 'e14' else 'registros' end;
begin
  insert into public.actividad (organizacion_id, tema, en) values (v_org, v_tema, now())
  on conflict (organizacion_id, tema) do update set en = excluded.en
  where actividad.en < now() - interval '1 second';   -- como mucho un aviso por segundo
  return null;
end $$;

create trigger en_vivo after insert or update or delete on public.personas
  for each row execute function app.marcar_actividad();
create trigger en_vivo after insert or update or delete on public.e14_resultados
  for each row execute function app.marcar_actividad();
create trigger en_vivo after insert or update or delete on public.e14_digitaciones
  for each row execute function app.marcar_actividad();
create trigger en_vivo after insert or update on public.lideres
  for each row execute function app.marcar_actividad();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.actividad';
  end if;
end $$;
