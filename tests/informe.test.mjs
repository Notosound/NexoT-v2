// Informe semanal: contenido, destinatarios y permisos
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, admin, cand, lider, coord;

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Campaña', 'campana-i') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  cand = await base.crearUsuario(org, 'Cand', 'candidato');
  coord = await base.crearUsuario(org, 'Coord', 'coordinador');
  lider = await base.crearUsuario(org, 'Ana', 'lider');
  const [{ id: a }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre, meta_votos) values ($1,$2,'Ana', 10) returning id`, [org, lider]);
  const [{ id: b }] = await base.sistema(`insert into lideres(organizacion_id, nombre, meta_votos) values ($1,'Beto', 20) returning id`, [org]);
  let n = 0;
  for (const [ficha, cuando] of [[a, '1 day'], [a, '2 days'], [a, '9 days'], [b, '30 days']]) {
    n++;
    await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, sexo, edad_declarada, edad_declarada_en, telefono, mesa_id, creado_en)
      values ($1,$2,$3,'P','otro',30,current_date,$4,1, now() - $5::interval)`, [org, ficha, `9100000${n}`, `300888000${n}`, cuando]);
  }
});

test('contenido: cifras y nombres de líderes, sin datos de personas', async () => {
  const [{ i }] = await base.sistema('select informe_semanal($1) i', [org]);
  assert.equal(i.total, 4);
  assert.equal(i.nuevos_semana, 2);
  assert.equal(i.nuevos_anterior, 1);
  assert.equal(i.meta_total, 30);
  assert.deepEqual(i.ranking, [{ nombre: 'Ana', n: 2 }]);
  assert.deepEqual(i.atrasados.map((x) => x.nombre), ['Beto', 'Ana']);
  assert.equal(i.quietos, 1);
  assert.deepEqual(i.localidades.map((x) => x.nombre), ['Usaquén']);
  assert.doesNotMatch(JSON.stringify(i), /9100000|3008880/);
});

test('destinatarios: admin y candidato que no se dieron de baja', async () => {
  let d = await base.sistema('select nombre from destinatarios_informe($1) order by nombre', [org]);
  assert.deepEqual(d.map((x) => x.nombre), ['Admin', 'Cand']);
  await base.como(cand, 'select cambiar_recibe_informe(false)');
  assert.equal((await base.como(cand, 'select mi_recibe_informe() r'))[0].r, false);
  d = await base.sistema('select nombre from destinatarios_informe($1)', [org]);
  assert.deepEqual(d.map((x) => x.nombre), ['Admin']);
});

test('ningún usuario del panel puede leer el informe de otra organización ni la clave', async () => {
  await assert.rejects(base.como(admin, 'select informe_semanal($1)', [org]), /permission denied/);
  await assert.rejects(base.como(admin, 'select * from destinatarios_informe($1)', [org]), /permission denied/);
  await assert.rejects(base.como(admin, `select verificar_clave_informe('x')`), /permission denied/);
  await assert.rejects(base.como(admin, 'select * from app.ajustes'), /permission denied/);
  const [{ v }] = await base.sistema(`select verificar_clave_informe((select valor from app.ajustes where clave = 'informe_clave')) v`);
  assert.equal(v, true);
  assert.equal((await base.sistema(`select verificar_clave_informe('adivinar') v`))[0].v, false);
});
