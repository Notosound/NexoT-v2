// Eventos con asistencia por QR y transporte el Día D
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, admin, coord, cand, lider, otroLider, fichaA, fichaB, existente, token, eventoId;

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Campaña', 'campana-e') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  coord = await base.crearUsuario(org, 'Coord', 'coordinador');
  cand = await base.crearUsuario(org, 'Cand', 'candidato');
  lider = await base.crearUsuario(org, 'Ana', 'lider');
  otroLider = await base.crearUsuario(org, 'Beto', 'lider');
  [{ id: fichaA }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, coordinador_id, nombre) values ($1,$2,$3,'Ana') returning id`, [org, lider, coord]);
  [{ id: fichaB }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre) values ($1,$2,'Beto') returning id`, [org, otroLider]);
  [{ id: existente }] = await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, sexo, edad_declarada, edad_declarada_en, telefono)
    values ($1,$2,'52000001','Ya','otro',30,current_date,'3001000001') returning id`, [org, fichaB]);
});

const persona = (o = {}) => JSON.stringify({ cedula: '52000002', nombres: 'Nueva', apellidos: 'Persona', telefono: '3001000002', sexo: 'femenino', edad: '33', acepta: true, ...o });

test('crear evento: admin o coordinador, con un líder que pueda ver', async () => {
  await assert.rejects(base.como(lider, `select crear_evento($1::jsonb)`, [JSON.stringify({ nombre: 'X', fecha: '2026-11-20T18:00:00-05', lider_id: fichaA })]), /Solo administradores/);
  await assert.rejects(base.como(coord, `select crear_evento($1::jsonb)`, [JSON.stringify({ nombre: 'X', fecha: '2026-11-20T18:00:00-05', lider_id: fichaB })]), /Elige el líder/);
  [{ crear_evento: eventoId }] = await base.como(coord, `select crear_evento($1::jsonb)`, [JSON.stringify({ nombre: 'Reunión Usaquén', fecha: '2026-11-20T18:00:00-05', lugar: 'Salón comunal', lider_id: fichaA })]);
  [{ token }] = await base.sistema('select token from eventos where id = $1', [eventoId]);
  const [info] = await base.peticion(null, {}, 'select * from evento_info($1)', [token]);
  assert.equal(info.evento, 'Reunión Usaquén');
  assert.equal(info.slug, 'campana-e');
});

test('asistencia: el nuevo entra a la base con el líder del evento; el existente solo queda como asistente', async () => {
  await assert.rejects(base.peticion(null, { metodo: 'POST' }, `select registrar_asistencia($1, $2::jsonb)`, [token, persona({ acepta: false })]), /aceptar/);
  await assert.rejects(base.peticion(null, { metodo: 'POST' }, `select registrar_asistencia($1, $2::jsonb)`, [token, persona({ telefono: '12' })]), /celular/);
  await base.peticion(null, { metodo: 'POST' }, `select registrar_asistencia($1, $2::jsonb)`, [token, persona()]);
  await base.peticion(null, { metodo: 'POST' }, `select registrar_asistencia($1, $2::jsonb)`, [token, persona()]);   // dos veces: no duplica
  // El existente (de otro líder) solo marca asistencia, aunque mande otros datos; no cambia de líder
  await base.peticion(null, { metodo: 'POST' }, `select registrar_asistencia($1, $2::jsonb)`, [token, persona({ cedula: '52.000.001', nombres: 'Otro nombre' })]);
  const [nueva] = await base.sistema(`select lider_id, origen, consentimiento_en is not null c from personas where cedula = '52000002'`);
  assert.deepEqual([nueva.lider_id, nueva.origen, nueva.c], [fichaA, 'formulario', true]);
  const [ya] = await base.sistema(`select lider_id, nombres from personas where id = $1`, [existente]);
  assert.deepEqual([ya.lider_id, ya.nombres], [fichaB, 'Ya']);
  const [r] = await base.como(admin, 'select asistentes, nuevos from v_eventos');
  assert.deepEqual([r.asistentes, r.nuevos], [2, 1]);
});

test('quién ve qué: el coordinador ve el evento pero solo los asistentes de sus líderes', async () => {
  assert.equal((await base.como(coord, 'select * from asistencias')).length, 1);
  assert.equal((await base.como(admin, 'select * from asistencias')).length, 2);
  assert.equal((await base.como(cand, 'select * from v_eventos')).length, 1);
  assert.equal((await base.como(cand, 'select * from asistencias')).length, 0);
  assert.equal((await base.como(otroLider, 'select * from v_eventos')).length, 0);
});

test('cerrar el evento: ya no recibe asistencias', async () => {
  await base.como(coord, 'select cerrar_evento($1, false)', [eventoId]);
  await assert.rejects(base.peticion(null, { metodo: 'POST' }, `select registrar_asistencia($1, $2::jsonb)`, [token, persona({ cedula: '52000003' })]), /ya no recibe/);
  assert.equal((await base.peticion(null, {}, 'select * from evento_info($1)', [token])).length, 0);
});

test('transporte: el líder marca a su gente, no a la de otros', async () => {
  const [{ id }] = await base.sistema(`select id from personas where cedula = '52000002'`);
  await base.como(lider, 'select marcar_transporte($1, true)', [id]);
  assert.equal((await base.sistema('select necesita_transporte from personas where id = $1', [id]))[0].necesita_transporte, true);
  await assert.rejects(base.como(lider, 'select marcar_transporte($1, true)', [existente]), /no está en tu lista/);
  await assert.rejects(base.como(cand, 'select marcar_transporte($1, true)', [id]), /no puede/);
});
