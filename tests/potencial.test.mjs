// Resultados históricos por puesto y potencial
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, admin, coord, cand, lider, fichaA, fichaB;

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Campaña', 'campana-p') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  coord = await base.crearUsuario(org, 'Coord', 'coordinador');
  cand = await base.crearUsuario(org, 'Cand', 'candidato');
  lider = await base.crearUsuario(org, 'Ana', 'lider');
  [{ id: fichaA }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, coordinador_id, nombre) values ($1,$2,$3,'Ana') returning id`, [org, lider, coord]);
  [{ id: fichaB }] = await base.sistema(`insert into lideres(organizacion_id, nombre) values ($1,'Beto') returning id`, [org]);
  let n = 0;
  for (const [ficha, mesa] of [[fichaA, 1], [fichaA, 2], [fichaB, 5]]) {
    n++;
    await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, sexo, edad_declarada, edad_declarada_en, mesa_id, telefono)
      values ($1,$2,$3,'P','otro',30,current_date,$4,$5)`, [org, ficha, `7100000${n}`, mesa, `300555000${n}`]);
  }
});

const filas = (f) => JSON.stringify(f.map((x, i) => ({ fila: i + 2, ...x })));

test('importar: por códigos o por nombre, suma mesas y detecta errores', async () => {
  const datos = [
    { zona: '1', codigo_puesto: '1', mesa: '1', votos: '120', validos: '900' },
    { zona: '01', codigo_puesto: '01', mesa: '2', votos: '80', validos: '700' },
    { localidad: 'Kennedy', puesto: 'Colegio Kennedy', votos: '1.500', validos: '20000' },
    { zona: '01', codigo_puesto: '01', mesa: '2', votos: '5' },            // repetida
    { zona: '99', codigo_puesto: '99', votos: '5' },                       // no existe
    { localidad: 'Kennedy', puesto: 'Colegio Kennedy', votos: '10', validos: '3' }, // válidos < votos
    { zona: '01', codigo_puesto: '01', votos: '' },                        // vacía
  ];
  const r = await base.como(admin, `select * from importar_historico('Senado 2022', 2022, $1::jsonb, false)`, [filas(datos)]);
  assert.deepEqual(r.map((x) => x.estado), ['ok', 'ok', 'ok', 'error', 'error', 'error', 'vacia']);
  assert.match(r[3].mensaje, /repetida/);
  assert.match(r[4].mensaje, /zona 99/);
  assert.equal((await base.como(admin, 'select * from historicos')).length, 0, 'revisar no guarda');
  await assert.rejects(base.como(coord, `select * from importar_historico('X', 2022, $1::jsonb, true)`, [filas(datos)]), /Solo un administrador/);

  await base.como(admin, `select * from importar_historico('Senado 2022', 2022, $1::jsonb, true)`, [filas(datos)]);
  const [h] = await base.como(admin, 'select * from v_historicos');
  assert.deepEqual([h.nombre, h.puestos, h.votos, h.validos], ['Senado 2022', 2, 1700, 21600]);
  // Volver a cargar con el mismo nombre reemplaza
  await base.como(admin, `select * from importar_historico('Senado 2022', 2022, $1::jsonb, true)`, [filas(datos.slice(0, 1))]);
  const [h2] = await base.como(admin, 'select * from v_historicos');
  assert.deepEqual([h2.puestos, h2.votos], [1, 120]);
  await base.como(admin, `select * from importar_historico('Senado 2022', 2022, $1::jsonb, true)`, [filas(datos)]);
});

test('potencial: cruza votos de antes con simpatizantes de hoy, según el rol', async () => {
  const q = 'select puesto, votos_antes, validos_antes, simpatizantes from v_potencial_puestos order by puesto';
  const a = await base.como(admin, q);
  assert.deepEqual(a.map((x) => [x.puesto, x.votos_antes, x.validos_antes, x.simpatizantes]),
    [['Colegio Kennedy', 1500, 20000, 1], ['Pepe Sierra', 200, 1600, 2]]);
  // El coordinador ve los votos históricos (públicos) pero solo sus simpatizantes
  const c = await base.como(coord, q);
  assert.deepEqual(c.map((x) => x.simpatizantes), [0, 2]);
  assert.equal((await base.como(cand, q)).length, 2);
  assert.equal((await base.como(lider, q)).length, 0);
  assert.equal((await base.como(lider, 'select * from historicos')).length, 0);
});

test('eliminar una carga histórica', async () => {
  const [{ id }] = await base.como(admin, 'select id from historicos');
  await assert.rejects(base.como(cand, 'select eliminar_historico($1)', [id]), /Solo un administrador/);
  await base.como(admin, 'select eliminar_historico($1)', [id]);
  assert.equal((await base.como(admin, 'select * from v_historicos')).length, 0);
  assert.equal((await base.sistema('select count(*)::int n from historico_puestos'))[0].n, 0);
});
