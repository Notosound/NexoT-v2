// Ley 1581: política, solicitudes de titulares, supresión real y
// verificación en dos pasos
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, admin, coord, lider, ficha, persona, otra, eleccion;

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Campaña', 'campana-x') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  coord = await base.crearUsuario(org, 'Coord', 'coordinador');
  lider = await base.crearUsuario(org, 'Ana', 'lider');
  [{ id: ficha }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre) values ($1,$2,'Ana') returning id`, [org, lider]);
  [{ id: persona }] = await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, apellidos, sexo, edad_declarada, edad_declarada_en, mesa_id, telefono, barrio)
    values ($1,$2,'52111222','Marta','Lopez','femenino',40,current_date,1,'3105556677','Cedritos') returning id`, [org, ficha]);
  [{ id: otra }] = await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, sexo, edad_declarada, edad_declarada_en, telefono)
    values ($1,$2,'52999888','Otra','femenino',40,current_date,'3105556678') returning id`, [org, ficha]);
  [{ id: eleccion }] = await base.sistema(
    `insert into elecciones(organizacion_id, nombre, fecha, municipio_id) values ($1,'Senado','2026-03-08',(select id from municipios where divipola='11001')) returning id`, [org]);
});

test('política: el admin configura el responsable y cualquiera la puede leer', async () => {
  await assert.rejects(base.como(coord, `select configurar_politica('{"correo":"a@b.co"}'::jsonb)`), /Solo un administrador/);
  await assert.rejects(base.como(admin, `select configurar_politica('{"correo":"no-es-correo"}'::jsonb)`), /correo válido/);
  await base.como(admin, `select configurar_politica('{"responsable":"Campaña X","documento":"900123456","correo":"Datos@Campana.co"}'::jsonb)`);
  const [p] = await base.peticion(null, {}, `select * from politica_info('campana-x')`);
  assert.equal(p.responsable, 'Campaña X');
  assert.equal(p.correo, 'datos@campana.co');
  assert.ok(p.actualizada);
});

test('solicitudes: el titular radica sin sesión, con plazo legal y límite', async () => {
  const [{ r }] = await base.peticion(null, { metodo: 'POST' },
    `select solicitar_datos('campana-x', '{"tipo":"supresion","cedula":"52.111.222","nombre":"Marta Lopez","contacto":"3105556677"}'::jsonb) r`);
  assert.match(r, /^[0-9A-F]{8}$/);
  const [s] = await base.sistema('select tipo, cedula, vence_en - creado_en::date as dias from solicitudes_datos where radicado = $1', [r]);
  assert.equal(s.cedula, '52111222');
  assert.ok(s.dias >= 15 && s.dias <= 23);  // 15 días hábiles
  await assert.rejects(base.peticion(null, { metodo: 'POST' }, `select solicitar_datos('campana-x', '{"tipo":"otra","cedula":"52111222","nombre":"Marta","contacto":"3105556677"}'::jsonb)`), /Elige/);
  await assert.rejects(base.peticion(null, { metodo: 'POST' }, `select solicitar_datos('no-existe', '{}'::jsonb)`), /No encontramos/);
  // Solo el admin ve las solicitudes
  assert.equal((await base.como(admin, 'select * from solicitudes_datos')).length, 1);
  assert.equal((await base.como(coord, 'select * from solicitudes_datos')).length, 0);
  assert.equal((await base.peticion(null, {}, 'select * from solicitudes_datos').catch(() => [])).length, 0);
  // Límite por conexión: 5 por hora
  for (let i = 0; i < 4; i++) {
    await base.peticion(null, { metodo: 'POST', encabezados: { 'cf-connecting-ip': '7.7.7.7' } },
      `select solicitar_datos('campana-x', '{"tipo":"consulta","cedula":"1234567","nombre":"Spam Spam","contacto":"3000000000"}'::jsonb)`);
  }
  await base.peticion(null, { metodo: 'POST', encabezados: { 'cf-connecting-ip': '7.7.7.7' } },
    `select solicitar_datos('campana-x', '{"tipo":"consulta","cedula":"1234567","nombre":"Spam Spam","contacto":"3000000000"}'::jsonb)`);
  await assert.rejects(base.peticion(null, { metodo: 'POST', encabezados: { 'cf-connecting-ip': '7.7.7.7' } },
    `select solicitar_datos('campana-x', '{"tipo":"consulta","cedula":"1234567","nombre":"Spam Spam","contacto":"3000000000"}'::jsonb)`), /Demasiadas/);
});

test('supresión: borra los datos personales en todas partes, también en la auditoría', async () => {
  await base.como(lider, `select registrar_contacto($1, 'confirmado', 'llamada', 'Vive con la mamá')`, [persona]);
  await base.como(lider, 'select marcar_voto($1, $2, true)', [eleccion, persona]);
  await base.como(admin, `select asignar_testigo($1, $2, 1, '{}')`, [eleccion, persona]);
  const [{ id }] = await base.sistema(`select id from solicitudes_datos where tipo = 'supresion'`);

  const datos = await base.como(admin, 'select * from datos_del_titular($1)', [id]);
  assert.equal(datos.length, 1);
  assert.equal(datos[0].nombres, 'Marta');
  assert.equal((await base.como(coord, 'select * from datos_del_titular($1)', [id])).length, 0);

  await assert.rejects(base.como(coord, `select atender_solicitud($1, 'atendida', 'Se suprimieron los datos', true)`, [id]), /Solo un administrador/);
  await assert.rejects(base.como(admin, `select atender_solicitud($1, 'atendida', 'corta', true)`, [id]), /mínimo 10/);
  const [{ n }] = await base.como(admin, `select atender_solicitud($1, 'atendida', 'Se suprimieron sus datos de la base.', true) n`, [id]);
  assert.equal(n, 1);

  const [p] = await base.sistema('select cedula, nombres, apellidos, telefono, barrio, eliminado_en from personas where id = $1', [persona]);
  assert.notEqual(p.cedula, '52111222');
  assert.deepEqual([p.nombres, p.telefono, p.barrio], ['Titular', null, null]);
  assert.ok(p.eliminado_en);
  for (const t of ['contactos', 'testigos', 'votos_marcados']) {
    assert.equal((await base.sistema(`select * from ${t} where persona_id = $1`, [persona])).length, 0, t);
  }
  // Nada del titular queda en la auditoría
  const rastro = await base.sistema(`select count(*)::int n from auditoria where antes::text ~ '52111222|3105556677|Vive con la mam' or despues::text ~ '52111222|3105556677|Vive con la mam'`);
  assert.equal(rastro[0].n, 0);
  // La otra persona no se tocó
  const [o] = await base.sistema('select nombres, telefono from personas where id = $1', [otra]);
  assert.deepEqual([o.nombres, o.telefono], ['Otra', '3105556678']);
  // Queda constancia de la supresión (sin datos personales) y no se puede atender dos veces
  const acc = await base.como(admin, `select accion, detalle from v_acciones_sensibles where accion = 'SUPRESION'`);
  assert.equal(acc.length, 1);
  assert.equal(acc[0].detalle.personas, 1);
  await assert.rejects(base.como(admin, `select atender_solicitud($1, 'atendida', 'Otra vez la misma', true)`, [id]), /ya fue atendida/);
  // La auditoría sigue siendo de solo lectura fuera de una supresión
  await assert.rejects(base.sistema(`update auditoria set antes = null where id = (select max(id) from auditoria)`), /solo lectura/);
});

test('consulta: no permite suprimir; registro sensible incluye exportes', async () => {
  const [{ id }] = await base.sistema(`select id from solicitudes_datos where tipo = 'consulta' limit 1`);
  await assert.rejects(base.como(admin, `select atender_solicitud($1, 'atendida', 'Respuesta enviada por correo', true)`, [id]), /Solo se suprimen/);
  await base.como(admin, `select atender_solicitud($1, 'atendida', 'Respuesta enviada por correo')`, [id]);
  await base.como(admin, `select registrar_exportacion('personas', 120, '{}'::jsonb)`);
  const acc = await base.como(admin, `select accion, usuario from v_acciones_sensibles where accion = 'EXPORT'`);
  assert.deepEqual(acc.map((a) => [a.accion, a.usuario]), [['EXPORT', 'Admin']]);
  assert.equal((await base.como(coord, 'select * from v_acciones_sensibles')).length, 0);
});

test('dos pasos: con factor verificado, una sesión sin código no recibe datos', async () => {
  assert.equal((await base.peticion(admin, {}, 'select count(*)::int n from personas'))[0].n, 2);
  await base.sistema(`insert into auth.mfa_factors(user_id, status) values ($1, 'unverified')`, [admin]);
  assert.equal((await base.peticion(admin, {}, 'select 1')).length, 1);  // sin terminar de inscribir: sigue igual
  await base.sistema(`insert into auth.mfa_factors(user_id, status) values ($1, 'verified')`, [admin]);
  await assert.rejects(base.peticion(admin, {}, 'select 1'), /código de verificación/);
  assert.equal((await base.peticion(admin, { aal: 'aal2' }, 'select count(*)::int n from personas'))[0].n, 2);
  // Otros usuarios sin factor no se ven afectados
  assert.equal((await base.peticion(lider, {}, 'select 1')).length, 1);
  const est = await base.como(admin, 'select perfil_id, activa from equipo_2fa()');
  assert.equal(est.find((e) => e.perfil_id === admin).activa, true);
  assert.equal(est.find((e) => e.perfil_id === lider).activa, false);
});
