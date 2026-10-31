-- =====================================================================
-- 0004 · Auditoría automática (append-only)
-- =====================================================================
-- Cada INSERT/UPDATE/DELETE en las tablas de negocio queda registrado con
-- quién, cuándo, el valor anterior y el nuevo. Lo hace la base de datos,
-- así no depende de que el código "se acuerde" de auditar.

create table public.auditoria (
  id               bigserial primary key,
  organizacion_id  uuid,
  tabla            text not null,
  registro_id      text,
  accion           text not null check (accion in ('INSERT','UPDATE','DELETE')),
  antes            jsonb,
  despues          jsonb,
  cambios          text[],                      -- columnas que cambiaron (en UPDATE)
  usuario_id       uuid,
  en               timestamptz not null default clock_timestamp()
);
create index auditoria_registro_idx on public.auditoria(tabla, registro_id);
create index auditoria_org_en_idx   on public.auditoria(organizacion_id, en desc);

create or replace function app.auditar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_antes   jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_despues jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_fila    jsonb := coalesce(v_despues, v_antes);
  v_cambios text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_cambios
    from jsonb_object_keys(v_despues) k
    where k <> 'actualizado_en' and v_despues -> k is distinct from v_antes -> k;
    if v_cambios is null then
      return new;                               -- nada cambió de verdad
    end if;
  end if;

  insert into public.auditoria(organizacion_id, tabla, registro_id, accion, antes, despues, cambios, usuario_id)
  values ((v_fila ->> 'organizacion_id')::uuid, tg_table_name, v_fila ->> 'id',
          tg_op, v_antes, v_despues, v_cambios, auth.uid());
  return coalesce(new, old);
end $$;

-- La auditoría no se puede modificar ni borrar
create or replace function app.auditoria_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'La auditoría es de solo lectura' using errcode = 'insufficient_privilege';
end $$;

create trigger auditoria_inmutable before update or delete on public.auditoria
  for each row execute function app.auditoria_inmutable();

create trigger auditar after insert or update or delete on public.organizaciones for each row execute function app.auditar();
create trigger auditar after insert or update or delete on public.perfiles       for each row execute function app.auditar();
create trigger auditar after insert or update or delete on public.lideres        for each row execute function app.auditar();
create trigger auditar after insert or update or delete on public.personas       for each row execute function app.auditar();
