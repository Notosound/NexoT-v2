// Funciones que usa el panel web (esquema public)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, otra, admin, lider, candidato, adminOtra, fichaLider;
const C = `consentimiento_version, consentimiento_en, consentimiento_canal`;

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Campaña', 'campana') returning id`);
  [{ id: otra }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Otra', 'otra-org') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  candidato = await base.crearUsuario(org, 'Candidato', 'candidato');
  adminOtra = await base.crearUsuario(otra, 'Admin otra', 'admin');
  lider = await base.crearUsuario(org, 'Líder', 'lider');
  [{ id: fichaLider }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre) values ($1,$2,'Líder') returning id`, [org, lider]);
});

test('un registro hecho por un usuario exige consentimiento', async () => {
  const sql = (con) => `insert into personas(organizacion_id, lider_id, cedula, nombres, sexo, edad_declarada, edad_declarada_en${con ? ', ' + C : ''})
    values ($1,$2,$3,'Ana','femenino',30,current_date${con ? ",'aviso-v1',now(),'presencial'" : ''})`;
  await assert.rejects(base.como(lider, sql(false), [org, fichaLider, '50000001']), /consentimiento/);
  await base.como(lider, sql(true), [org, fichaLider, '50000001']);
});

test('sugerencia en vivo para el formulario', async () => {
  const [r] = await base.como(lider, `select * from sugerir_puesto(null, null, 'calle 116 No. 15-30')`);
  assert.deepEqual([r.nombre, r.metodo, r.confianza], ['Pepe Sierra', 'direccion', 'alta']);
  assert.equal((await base.como(null, `select 1`)).length, 1);
  await assert.rejects(base.como(null, `select * from sugerir_puesto(null, 'x', null)`), /permission denied/);
});

test('vincular usuario invitado: crea perfil y ficha de líder', async () => {
  await base.invitar('nueva.lider@correo.co');
  await assert.rejects(base.como(lider, `select vincular_usuario('nueva.lider@correo.co', 'Nueva', 'lider')`), /administrador/);
  await assert.rejects(base.como(admin, `select vincular_usuario('nadie@correo.co', 'X', 'lider')`), /Invite user/);
  const [{ vincular_usuario: uid }] = await base.como(admin, `select vincular_usuario(' Nueva.Lider@correo.co ', 'Nueva Líder', 'lider')`);
  const [perfil] = await base.sistema(`select rol, organizacion_id from perfiles where id = $1`, [uid]);
  assert.deepEqual(perfil, { rol: 'lider', organizacion_id: org });
  const fichas = await base.sistema(`select nombre from lideres where perfil_id = $1`, [uid]);
  assert.deepEqual(fichas, [{ nombre: 'Nueva Líder' }]);
  // la nueva líder ya puede ver su ficha
  assert.equal((await base.como(uid, `select * from lideres`)).length, 1);
});

test('vincular a una ficha de líder existente', async () => {
  const [{ id: ficha }] = await base.sistema(`insert into lideres(organizacion_id, nombre, meta_votos) values ($1,'Pedro',50) returning id`, [org]);
  await base.invitar('pedro@correo.co');
  const [{ vincular_usuario: uid }] = await base.como(admin, `select vincular_usuario('pedro@correo.co', 'Pedro', 'lider', $1)`, [ficha]);
  const [f] = await base.sistema(`select perfil_id from lideres where id = $1`, [ficha]);
  assert.equal(f.perfil_id, uid);
});

test('no se puede robar un usuario de otra organización ni cambiarse el propio rol', async () => {
  await base.invitar('compartido@correo.co');
  await base.como(adminOtra, `select vincular_usuario('compartido@correo.co', 'X', 'digitador')`);
  await assert.rejects(base.como(admin, `select vincular_usuario('compartido@correo.co', 'X', 'admin')`), /otra organización/);
  const [{ email }] = await base.sistema(`select email from auth.users where id = $1`, [admin]);
  await assert.rejects(base.como(admin, `select vincular_usuario($1, 'Yo', 'candidato')`, [email]), /propio rol/);
});

test('equipo: solo el admin ve correos, y solo de su organización', async () => {
  const eq = await base.como(admin, `select * from equipo()`);
  assert.ok(eq.length >= 4 && eq.every((x) => x.email));
  assert.ok(!eq.some((x) => x.id === adminOtra));
  assert.equal((await base.como(candidato, `select * from equipo()`)).length, 0);
});

test('desactivar usuario: pierde el acceso', async () => {
  await base.como(admin, `select desactivar_usuario($1)`, [candidato]);
  assert.equal((await base.como(candidato, `select * from v_demografia`)).length, 0);
  assert.equal((await base.como(candidato, `select * from organizaciones`)).length, 0);
});

test('las envolturas públicas respetan los permisos de la función original', async () => {
  const [p] = await base.sistema(`select id from personas limit 1`);
  await assert.rejects(base.como(lider, `select resolver_ubicacion($1, 1)`, [p.id]), /administrador/);
  await base.como(lider, `select eliminar_persona($1)`, [p.id]);
  const [e] = await base.sistema(`select eliminado_por from personas where id = $1`, [p.id]);
  assert.equal(e.eliminado_por, lider);
});
