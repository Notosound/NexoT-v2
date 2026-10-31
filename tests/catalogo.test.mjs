// Catálogo oficial de Bogotá (Divipole Congreso 2026) tal como queda
// después de aplicar las migraciones reales.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase } from './entorno.mjs';

let base, org;
before(async () => {
  base = await crearBase();
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Catálogo', 'catalogo') returning id`);
});

test('totales iguales al documento oficial', async () => {
  const [r] = await base.sistema(`
    select count(*)::int puestos, sum(mesas_total)::int mesas_decl, sum(censo_total)::int censo,
           count(distinct localidad_id)::int localidades,
           (select count(*)::int from mesas) mesas
    from puestos`);
  assert.deepEqual(r, { puestos: 1083, mesas_decl: 18156, censo: 6101479, localidades: 20, mesas: 18156 });
});

test('las 20 localidades tienen puestos, incluida Sumapaz', async () => {
  const r = await base.sistema(`
    select l.nombre, count(p.id)::int n from localidades l left join puestos p on p.localidad_id = l.id
    group by l.nombre order by n`);
  assert.equal(r.length, 20);
  assert.ok(r.every((x) => x.n > 0), JSON.stringify(r.filter((x) => x.n === 0)));
  assert.equal(r.find((x) => x.nombre === 'Sumapaz').n, 6);
  assert.equal(r.find((x) => x.nombre === 'Kennedy').n, 123);
});

test('mesas numeradas 1..N sin huecos', async () => {
  const [r] = await base.sistema(`
    select count(*)::int malos from (
      select p.id from puestos p join mesas m on m.puesto_id = p.id
      group by p.id, p.mesas_total having max(m.numero) <> p.mesas_total or count(*) <> p.mesas_total) x`);
  assert.equal(r.malos, 0);
});

test('Corferias (puesto censo) queda en Teusaquillo, marcado como inferido', async () => {
  const [r] = await base.sistema(`
    select l.nombre localidad, p.localidad_inferida, p.mesas_total from puestos p join localidades l on l.id = p.localidad_id
    where p.zona = '90'`);
  assert.deepEqual(r, { localidad: 'Teusaquillo', localidad_inferida: true, mesas_total: 250 });
});

test('coordenadas: todas dentro de Bogotá o descartadas por error del documento', async () => {
  const [r] = await base.sistema(`
    select count(*)::int fuera from puestos
    where not coordenadas_descartadas
      and (latitud is null or longitud is null or latitud not between 3.7 and 4.9 or longitud not between -74.5 and -73.9)`);
  assert.equal(r.fuera, 0);
  const desc = await base.sistema(`select nombre, latitud from puestos where coordenadas_descartadas`);
  assert.deepEqual(desc, [{ nombre: 'LA Y SANTA ROSA', latitud: null }]);
});

test('ubicación por nombre oficial y por dirección con el catálogo real', async () => {
  const usaquen = (await base.sistema(`select id from localidades where codigo = '01'`))[0].id;
  const [porNombre] = await base.sistema(`select p.nombre, s.metodo from app.sugerir_puesto($1, $2, 'servita', null) s join puestos p on p.id = s.puesto_id`, [org, usaquen]);
  assert.deepEqual(porNombre, { nombre: 'SERVITA', metodo: 'nombre_oficial' });
  // En el Divipole: "CLL 165 No 7-38/52"
  const [porDir] = await base.sistema(`select p.nombre, s.metodo from app.sugerir_puesto($1, $2, null, 'Calle 165 # 7-38') s join puestos p on p.id = s.puesto_id`, [org, usaquen]);
  assert.deepEqual(porDir, { nombre: 'SERVITA', metodo: 'direccion' });
});

test('proporción de direcciones oficiales que el sistema entiende', async () => {
  const [r] = await base.sistema(`
    select count(*)::int total, count(direccion_clave)::int con_clave, count(direccion_clave_cuadra)::int con_cuadra from puestos`);
  // Las rurales ("VEREDA ...") no tienen nomenclatura urbana; el resto sí debe entenderse
  assert.ok(r.con_cuadra / r.total > 0.9, JSON.stringify(r));
});
