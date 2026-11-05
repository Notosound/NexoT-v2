// El líder importa su propia lista: plantilla oficial, aviso legal, todo a su nombre
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, admin, liderA, liderB, fichaA, fichaB;

const crear = (u, extra = {}) => base.como(u,
  `insert into importaciones(organizacion_id, archivo, municipio_id, fecha_datos, consentimiento_version, lider_id_defecto, plantilla, aviso_version, aviso_aceptado_en)
   values ($1, 'mi_lista.xlsx', (select id from municipios where divipola='11001'), current_date, $2, $3, $4, $5, $6) returning id`,
  [org, 'consentimiento' in extra ? extra.consentimiento : 'aviso-v1', extra.lider ?? fichaA, extra.plantilla === undefined ? 'registros-v1' : extra.plantilla,
    'importar-v1', extra.aviso === undefined ? new Date().toISOString() : extra.aviso]);

const filas = async (u, imp, lista) => {
  for (const [i, d] of lista.entries()) {
    await base.como(u, `insert into importacion_filas(importacion_id, organizacion_id, fila, datos) values ($1,$2,$3,$4)`, [imp, org, i + 2, JSON.stringify(d)]);
  }
};

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('C', 'c-imp-lid') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  liderA = await base.crearUsuario(org, 'Ana', 'lider');
  liderB = await base.crearUsuario(org, 'Beto', 'lider');
  [{ id: fichaA }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre, cedula) values ($1,$2,'Ana','900001') returning id`, [org, liderA]);
  [{ id: fichaB }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre, cedula) values ($1,$2,'Beto','900002') returning id`, [org, liderB]);
  // Beto ya registró a esta persona (Ana no la puede ver)
  await base.como(liderB, `insert into personas(organizacion_id, lider_id, cedula, nombres, sexo, edad_declarada, edad_declarada_en, telefono, consentimiento_version, consentimiento_en, consentimiento_canal)
    values ($1,$2,'55555555','De Beto','femenino',40,current_date,'3001112233','aviso-v1',now(),'presencial')`, [org, fichaB]);
});

test('sin plantilla oficial, sin aviso aceptado o a nombre de otro líder: no se puede', async () => {
  for (const [caso, extra] of [['plantilla', { plantilla: null }], ['aviso', { aviso: null }], ['consentimiento', { consentimiento: null }], ['otro líder', { lider: fichaB }]]) {
    await assert.rejects(crear(liderA, extra), /row-level security/, caso);
  }
});

test('importa a su nombre; pide puesto; no duplica cédulas de otros líderes', async () => {
  const [{ id: imp }] = await crear(liderA);
  await filas(liderA, imp, [
    { cedula: '11111111', nombres: 'Con puesto', sexo: 'F', edad: '30', telefono: '3001234567', localidad: 'Usaquén', puesto: 'Pepe Sierra', mesa: '2', lider_cedula: '900002' },
    { cedula: '22222222', nombres: 'Puesto escrito', sexo: 'M', edad: '41', telefono: '3001234568', localidad: 'Kennedy', puesto: 'Colegio que no está' },
    { cedula: '33333333', nombres: 'Sin puesto', sexo: 'F', edad: '52', telefono: '3001234569' },
    { cedula: '55555555', nombres: 'Ya la tiene Beto', sexo: 'M', edad: '33', telefono: '3001234560', localidad: 'Usaquén', puesto: 'Pepe Sierra' },
  ]);
  const [r] = await base.como(liderA, 'select * from validar_importacion($1)', [imp]);
  assert.deepEqual([r.filas_validas, r.filas_con_errores, r.filas_duplicadas], [2, 1, 1]);
  const f = await base.como(liderA, 'select fila, estado, errores from importacion_filas where importacion_id = $1 order by fila', [imp]);
  assert.match(f[2].errores.join(' '), /falta el puesto/);
  assert.match(f[3].errores.join(' '), /ya está registrada en la campaña/);
  assert.doesNotMatch(f[3].errores.join(' '), /Beto/);
  const [c] = await base.como(liderA, 'select * from confirmar_importacion($1)', [imp]);
  assert.equal(c.filas_importadas, 2);
  const mias = await base.sistema(`select cedula, lider_id from personas where cedula in ('11111111','22222222') order by cedula`);
  assert.ok(mias.every((p) => p.lider_id === fichaA), 'todo queda a nombre de Ana aunque el Excel diga otro líder');
  const acciones = await base.como(admin, `select usuario, detalle from v_acciones_sensibles where tabla = 'importaciones'`);
  assert.equal(acciones.length, 1);
  assert.equal(acciones[0].usuario, 'Ana');
  assert.ok(acciones[0].detalle.aviso_aceptado_en, 'queda la hora en que aceptó el aviso');
});

test('un líder no ve las importaciones de otro; el admin sí', async () => {
  assert.equal((await base.como(liderB, 'select * from importaciones')).length, 0);
  assert.equal((await base.como(liderB, 'select * from importacion_filas')).length, 0);
  assert.ok((await base.como(admin, 'select * from importaciones')).length >= 1);
  const [{ id }] = await base.sistema('select id from importaciones limit 1');
  await assert.rejects(base.como(liderB, 'select * from validar_importacion($1)', [id]), /no existe o no tiene acceso/);
});

test('el admin sigue pudiendo importar sin puesto (queda como advertencia)', async () => {
  const [{ id: imp }] = await base.como(admin,
    `insert into importaciones(organizacion_id, archivo, municipio_id, lider_id_defecto) values ($1,'x.xlsx',(select id from municipios where divipola='11001'),$2) returning id`, [org, fichaA]);
  await filas(admin, imp, [{ cedula: '44444444', nombres: 'Sin puesto', sexo: 'F', edad: '60', telefono: '3001234561' }]);
  const [r] = await base.como(admin, 'select * from validar_importacion($1)', [imp]);
  assert.equal(r.filas_validas, 1);
});
