-- =====================================================================
-- 0020 · El formulario público también lee el municipio (catálogo oficial)
-- =====================================================================
create policy catalogo_publico on public.municipios for select to anon using (true);
grant select on public.municipios to anon;
