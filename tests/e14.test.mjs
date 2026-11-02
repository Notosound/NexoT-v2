// Vistas E14 que usa el panel
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, admin, dig1, dig2, candidato, lider, eleccion, ficha;

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Campaña', 'campana') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  dig1 = await base.crearUsuario(org, 'Ana Digitadora', 'digitador');
  dig2 = await base.crearUsuario(org, 'Beto Digitador', 'digitador');
  candidato = await base.crearUsuario(org, 'Candidato', 'candidato');
  lider = await base.crearUsuario(org, 'Líder', 'lider');
  [{ id: ficha }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre) values ($1,$2,'Líder') returning id`, [org, lider]);
  for (const [c, mesa] of [['1', 1], ['2', 1], ['3', 2], ['4', 3]]) {
    await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, sexo, edad_declarada, edad_declarada_en, mesa_id, telefono)
                        values ($1,$2,$3,'X','otro',30,current_date,$4,'3001234567')`, [org, ficha, `7000${c}`, mesa]);
  }
  [{ id: eleccion }] = await base.sistema(
    `insert into elecciones(organizacion_id, nombre, fecha, municipio_id) values ($1,'Senado','2026-03-08',(select id from municipios where divipola='11001')) returning id`, [org]);
});

const digitar = (u, mesa, votos) => base.como(u,
  `insert into e14_digitaciones(eleccion_id, organizacion_id, mesa_id, votos) values ($1,$2,$3,$4)`, [eleccion, org, mesa, votos]);

test('avance: arranca con todas las mesas pendientes y lo ven digitadores y candidato', async () => {
  const [a] = await base.como(dig1, `select * from v_e14_avance where eleccion_id = $1`, [eleccion]);
  assert.deepEqual([a.mesas, a.pendientes, a.verificadas], [3, 3, 0]);
  assert.equal((await base.como(candidato, `select * from v_e14_avance`)).length, 1);
  assert.equal((await base.como(lider, `select * from v_e14_avance`)).length, 0);
  assert.ok(!('esperados' in a), 'no muestra esperados');
});

test('revisión: muestra las dos digitaciones con nombre, solo al admin', async () => {
  await digitar(dig1, 1, 2); await digitar(dig2, 1, 2);
  await digitar(dig1, 2, 5); await digitar(dig2, 2, 7);
  await digitar(dig1, 3, 0);
  const rev = await base.como(admin, `select * from v_e14_revision`);
  assert.equal(rev.length, 1);
  assert.equal(rev[0].mesa, 2);
  assert.deepEqual(rev[0].digitaciones.map((d) => [d.votos, d.por]), [[5, 'Ana Digitadora'], [7, 'Beto Digitador']]);
  assert.equal((await base.como(dig1, `select * from v_e14_revision`)).length, 0);
  const [a] = await base.como(admin, `select * from v_e14_avance`);
  assert.deepEqual([a.verificadas, a.en_revision, a.una_digitacion, a.pendientes], [1, 1, 1, 0]);
});

test('mis digitaciones: cada uno ve solo lo suyo y puede corregir', async () => {
  const mias = await base.como(dig2, `select mesa, votos, estado, puesto from v_mis_digitaciones order by mesa`);
  assert.deepEqual(mias.map((m) => [m.mesa, m.votos, m.estado]), [[1, 2, 'verificado'], [2, 7, 'en_revision']]);
  assert.equal(mias[0].puesto, 'Pepe Sierra');
  const [{ id }] = await base.como(dig2, `select id from v_mis_digitaciones where mesa = 2`);
  await base.como(dig2, `update e14_digitaciones set votos = 5 where id = $1`, [id]);
  const [m2] = await base.como(admin, `select estado, votos_reales from v_e14_mesas where mesa_id = 2`);
  assert.deepEqual(m2, { estado: 'verificado', votos_reales: 5 }, 'al corregir, coincide y queda verificada');
  assert.equal((await base.como(admin, `select * from v_e14_revision`)).length, 0);
});

test('un digitador no puede corregir la digitación del otro', async () => {
  const [{ id }] = await base.como(dig1, `select id from v_mis_digitaciones where mesa = 1`);
  const r = await base.como(dig2, `update e14_digitaciones set votos = 99 where id = $1 returning id`, [id]);
  assert.equal(r.length, 0);
});
