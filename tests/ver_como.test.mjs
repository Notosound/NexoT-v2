// "Ver como": el admin ve con los ojos de otro rol/persona, solo lectura
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, otra, admin, adminOtra, lider1, lider2, dig, cand, ficha1, ficha2;

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Campaña', 'campana') returning id`);
  [{ id: otra }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Otra', 'otra-org') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  adminOtra = await base.crearUsuario(otra, 'Admin otra', 'admin');
  lider1 = await base.crearUsuario(org, 'Ana', 'lider');
  lider2 = await base.crearUsuario(org, 'Beto', 'lider');
  dig = await base.crearUsuario(org, 'Digi', 'digitador');
  cand = await base.crearUsuario(org, 'Cand', 'candidato');
  [{ id: ficha1 }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre) values ($1,$2,'Ana') returning id`, [org, lider1]);
  [{ id: ficha2 }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre) values ($1,$2,'Beto') returning id`, [org, lider2]);
  let c = 1;
  for (const [f, n] of [[ficha1, 3], [ficha2, 2]]) for (let i = 0; i < n; i++) {
    await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, sexo, edad_declarada, edad_declarada_en, mesa_id)
                        values ($1,$2,$3,'X','otro',30,current_date,1)`, [org, f, `7000${c++}`]);
  }
});

const ver = (u, obj, sql, metodo = 'GET') => base.peticion(u, { metodo, encabezados: obj ? { 'x-ver-como': obj } : {} }, sql);

test('sin encabezado todo sigue igual', async () => {
  const r = await ver(admin, null, 'select count(*)::int n from personas');
  assert.equal(r[0].n, 5);
});

test('como líder: ve solo sus personas, igual que ese líder', async () => {
  const r = await ver(admin, lider1, `select count(*)::int n, app.rol_actual() rol, public.ver_como_actual() vc from personas`);
  assert.deepEqual([r[0].n, r[0].rol, r[0].vc], [3, 'lider', lider1]);
  const propio = await base.como(lider1, 'select count(*)::int n from personas');
  assert.equal(propio[0].n, 3);
});

test('como rol candidato o digitador: aplica las reglas de ese rol', async () => {
  const c = await ver(admin, 'rol:candidato', `select app.rol_actual() rol, (select count(*)::int from personas) n`);
  assert.equal(c[0].rol, 'candidato');
  const d = await ver(admin, 'rol:digitador', `select (select count(*)::int from personas) n`);
  assert.equal(d[0].n, 0);  // el digitador no ve personas
});

test('es solo lectura: ni con POST ni escribiendo dentro de un GET', async () => {
  await assert.rejects(ver(admin, lider1, 'select 1', 'POST'), /solo lectura/);
  const [{ ro }] = await ver(admin, 'rol:candidato', `select current_setting('transaction_read_only') ro`);
  assert.equal(ro, 'on');
  // Escritura que el rol sí podría hacer normalmente (un digitador digita E14): la base la frena igual
  await assert.rejects(ver(admin, dig, `update perfiles set nombre = nombre where false`), /read-only/);
  await assert.rejects(
    ver(admin, lider1, `insert into lideres(organizacion_id, nombre) values ('${org}', 'Intruso')`),
    /read-only|solo lectura/);
  const [{ n }] = await base.sistema(`select count(*)::int n from lideres where nombre = 'Intruso'`);
  assert.equal(n, 0);
});

test('nadie más puede usarlo', async () => {
  await assert.rejects(ver(lider1, lider2, 'select 1'), /Solo un administrador/);
  await assert.rejects(ver(dig, 'rol:candidato', 'select 1'), /Solo un administrador/);
  await assert.rejects(ver(adminOtra, lider1, 'select 1'), /no es de tu organización/);
  await assert.rejects(ver(admin, 'rol:admin', 'select 1'), /Rol no válido/);
  await assert.rejects(ver(admin, "'; drop table personas; --", 'select 1'), /no es de tu organización/);
});

test('opciones y auditoría', async () => {
  const op = await base.como(admin, 'select nombre, rol, lider_id from opciones_ver_como()');
  assert.deepEqual(op.map((x) => x.nombre).sort(), ['Ana', 'Beto', 'Cand', 'Digi']);
  assert.equal(op.find((x) => x.nombre === 'Ana').lider_id, ficha1);
  assert.equal((await base.como(lider1, 'select * from opciones_ver_como()')).length, 0);
  await base.como(admin, `select registrar_ver_como($1)`, [lider1]);
  const [a] = await base.sistema(`select accion, registro_id, usuario_id from auditoria where tabla = 'ver_como'`);
  assert.deepEqual([a.accion, a.registro_id, a.usuario_id], ['VER_COMO', lider1, admin]);
  await assert.rejects(base.como(lider1, `select registrar_ver_como('x')`), /Sin acceso/);
});
