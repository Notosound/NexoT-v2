-- =====================================================================
-- 0009 · Catálogo: Bogotá y sus 20 localidades
-- =====================================================================
-- Datos oficiales estables. Los puestos y mesas se cargan en una
-- migración aparte a partir del Divipole de la Registraduría.

insert into public.municipios (divipola, nombre, departamento)
values ('11001', 'Bogotá D.C.', 'Bogotá D.C.')
on conflict (divipola) do nothing;

insert into public.localidades (municipio_id, codigo, nombre)
select m.id, l.codigo, l.nombre
from public.municipios m
cross join (values
  ('01', 'Usaquén'),
  ('02', 'Chapinero'),
  ('03', 'Santa Fe'),
  ('04', 'San Cristóbal'),
  ('05', 'Usme'),
  ('06', 'Tunjuelito'),
  ('07', 'Bosa'),
  ('08', 'Kennedy'),
  ('09', 'Fontibón'),
  ('10', 'Engativá'),
  ('11', 'Suba'),
  ('12', 'Barrios Unidos'),
  ('13', 'Teusaquillo'),
  ('14', 'Los Mártires'),
  ('15', 'Antonio Nariño'),
  ('16', 'Puente Aranda'),
  ('17', 'La Candelaria'),
  ('18', 'Rafael Uribe Uribe'),
  ('19', 'Ciudad Bolívar'),
  ('20', 'Sumapaz')
) as l(codigo, nombre)
where m.divipola = '11001'
on conflict (municipio_id, codigo) do nothing;

-- Nombres alternativos que aparecen en los datos ("Martires" sin "Los")
create table public.localidades_alias (
  alias        text primary key,          -- ya normalizado con app.normalizar
  localidad_id int not null references public.localidades(id)
);
alter table public.localidades_alias enable row level security;
create policy catalogo_lectura on public.localidades_alias for select to authenticated using (true);
grant select on public.localidades_alias to authenticated;

insert into public.localidades_alias (alias, localidad_id)
select a.alias, l.id
from (values ('martires', '14'), ('candelaria', '17'), ('rafael uribe', '18')) as a(alias, codigo)
join public.localidades l on l.codigo = a.codigo
join public.municipios m on m.id = l.municipio_id and m.divipola = '11001'
on conflict do nothing;

-- Búsqueda de localidad por nombre o alias (la usa la importación)
create or replace function app.buscar_localidad(p_municipio int, p_texto text) returns int
language sql stable as $$
  select coalesce(
    (select id from public.localidades
      where municipio_id = p_municipio and app.normalizar(nombre) = app.normalizar(p_texto)),
    (select a.localidad_id from public.localidades_alias a
       join public.localidades l on l.id = a.localidad_id
      where l.municipio_id = p_municipio and a.alias = app.normalizar(p_texto))
  )
$$;
grant execute on function app.buscar_localidad(int, text) to authenticated;
