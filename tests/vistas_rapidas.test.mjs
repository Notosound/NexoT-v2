// vista_completa: una sola consulta, mismos permisos que la vista
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, admin, lider, otro;
before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('C', 'c-vr') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  lider = await base.crearUsuario(org, 'Ana', 'lider');
  otro = await base.crearUsuario(org, 'Beto', 'lider');
  const [{ id: a }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre) values ($1,$2,'Ana') returning id`, [org, lider]);
  const [{ id: b }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre) values ($1,$2,'Beto') returning id`, [org, otro]);
  let n = 0;
  for (const [f, mesa] of [[a, 1], [a, 2], [b, 5]]) {
    n++;
    await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, sexo, edad_declarada, edad_declarada_en, mesa_id, telefono)
      values ($1,$2,$3,'P','femenino',30,current_date,$4,$5)`, [org, f, `7300000${n}`, mesa, `30011100${n}0`]);
  }
});

test('devuelve lo mismo que la vista, respetando el rol', async () => {
  const [{ v }] = await base.como(admin, `select vista_completa('v_demografia') v`);
  const directa = await base.como(admin, 'select * from v_demografia');
  assert.equal(v.length, directa.length);
  assert.equal(v.reduce((s, x) => s + x.personas, 0), 3);
  const [{ v: delLider }] = await base.como(lider, `select vista_completa('v_demografia') v`);
  assert.equal(delLider.length, 0, 'el líder no ve la demografía de la campaña');
  const [{ v: suAvance }] = await base.como(lider, `select vista_completa('v_avance_lideres') v`);
  assert.deepEqual(suAvance.map((x) => [x.nombre, x.registrados]), [['Ana', 2]]);
  const [{ v: orden }] = await base.como(admin, `select vista_completa('v_avance_lideres', '{}', 'nombre desc') v`);
  assert.deepEqual(orden.map((x) => x.nombre), ['Beto', 'Ana']);
});

test('rechaza vistas, filtros y órdenes no permitidos', async () => {
  await assert.rejects(base.como(admin, `select vista_completa('personas')`), /no permitida/);
  await assert.rejects(base.como(admin, `select vista_completa('v_demografia', '{"organizacion_id": "x"}')`), /Filtro no permitido/);
  await assert.rejects(base.como(admin, `select vista_completa('v_demografia', '{}', 'nombre; drop table personas')`), /Orden no válido/);
});

test('resumen en una consulta', async () => {
  const [r] = await base.como(admin, 'select * from resumen_personas()');
  assert.deepEqual([r.personas, r.por_revisar, r.sin_ubicacion], [3, 0, 0]);
  assert.equal((await base.como(lider, 'select * from resumen_personas()'))[0].personas, 2);
});

test('funciona por GET en "Ver como" (el filtro llega como texto)', async () => {
  const filas = await base.peticion(admin, { encabezados: { 'x-ver-como': 'rol:candidato' } },
    `select jsonb_array_length(vista_completa('v_demografia', '{}')) n`);
  assert.ok(filas[0].n > 0);
  await assert.rejects(base.como(admin, `select vista_completa('v_demografia', '[1]')`), /Filtro no válido/);
});
