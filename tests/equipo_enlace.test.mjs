// Equipo desde la plataforma y enlace de registro del líder
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, otra, admin, coord, lider, otroLider, dig, ficha, fichaOtra, fichaOtraOrg, token;

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Campaña', 'campana') returning id`);
  [{ id: otra }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Otra', 'otra-org') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  coord = await base.crearUsuario(org, 'Coord', 'coordinador');
  lider = await base.crearUsuario(org, 'Ana', 'lider');
  otroLider = await base.crearUsuario(org, 'Beto', 'lider');
  dig = await base.crearUsuario(org, 'Digi', 'digitador');
  [{ id: ficha }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, coordinador_id, nombre) values ($1,$2,$3,'Ana') returning id`, [org, lider, coord]);
  [{ id: fichaOtra }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre) values ($1,$2,'Beto') returning id`, [org, otroLider]);
  [{ id: fichaOtraOrg }] = await base.sistema(`insert into lideres(organizacion_id, nombre) values ($1,'Ajeno') returning id`, [otra]);
});

test('equipo: estado de invitación, cambio de rol y reactivación', async () => {
  const eq = await base.como(admin, 'select nombre, rol, acepto, lider_id from equipo() order by nombre');
  assert.equal(eq.find((x) => x.nombre === 'Ana').lider_id, ficha);
  assert.equal(eq.find((x) => x.nombre === 'Ana').acepto, false);
  await base.como(admin, `select cambiar_rol($1, 'coordinador')`, [otroLider]);
  const [l] = await base.sistema('select perfil_id from lideres where id = $1', [fichaOtra]);
  assert.equal(l.perfil_id, null); // ya no es líder: la ficha queda sin acceso
  await assert.rejects(base.como(admin, `select cambiar_rol($1, 'jefe')`, [dig]), /Rol inválido/);
  await assert.rejects(base.como(admin, `select cambiar_rol($1, 'lider')`, [admin]), /propio rol/);
  await assert.rejects(base.como(coord, `select cambiar_rol($1, 'admin')`, [dig]), /Solo un administrador/);
  await base.como(admin, 'select desactivar_usuario($1)', [dig]);
  await base.como(admin, 'select reactivar_usuario($1)', [dig]);
  const [d] = await base.sistema('select activo from perfiles where id = $1', [dig]);
  assert.equal(d.activo, true);
});

test('estado_correo: solo admin, y dice si es de la misma organización', async () => {
  const ext = await base.invitar('nuevo@prueba.co');
  const [r] = await base.como(admin, `select * from estado_correo(' NUEVO@prueba.co ')`);
  assert.deepEqual([r.usuario_id, r.misma_org], [ext, false]);
  const [y] = await base.como(admin, `select * from estado_correo($1)`, [`${lider}@prueba.co`]);
  assert.equal(y.misma_org, true);
  assert.equal((await base.como(lider, `select * from estado_correo('nuevo@prueba.co')`)).length, 0);
});

test('enlace: lo ven el líder, su coordinador y el admin; nadie más', async () => {
  [{ token }] = await base.como(lider, 'select token from enlace_lider($1)', [ficha]);
  assert.match(token, /^[a-f0-9]{32}$/);
  const [c] = await base.como(coord, 'select token from enlace_lider($1)', [ficha]);
  assert.equal(c.token, token); // no se regenera al consultarlo
  await assert.rejects(base.como(dig, 'select * from enlace_lider($1)', [ficha]), /Sin acceso/);
  await assert.rejects(base.como(admin, 'select * from enlace_lider($1)', [fichaOtraOrg]), /Sin acceso/);
});

const persona = (o = {}) => JSON.stringify({ cedula: '1.020.304', nombres: 'Luz', apellidos: 'Gómez', sexo: 'femenino', edad: '40', localidad_id: '', puesto_id: '1', mesa: '2', telefono: '300 111 2233', acepta: true, ...o });

test('formulario público: registra a nombre del líder, con consentimiento', async () => {
  const [info] = await base.como(null, 'select * from enlace_info($1)', [token]);
  assert.deepEqual([info.lider, info.campana], ['Ana', 'Campaña']);
  const [{ r }] = await base.como(null, 'select registrar_por_enlace($1, $2::jsonb) r', [token, persona()]);
  assert.equal(r, 'recibido');
  const [p] = await base.sistema(`select lider_id, origen, consentimiento_canal, consentimiento_en is not null c, telefono, mesa_id, ubicacion_estado from personas where cedula = '1020304'`);
  assert.deepEqual([p.lider_id, p.origen, p.consentimiento_canal, p.c, p.telefono, p.mesa_id, p.ubicacion_estado],
    [ficha, 'formulario', 'formulario', true, '3001112233', 2, 'completa']);
  const [e] = await base.como(lider, 'select registros_enlace from enlace_lider($1)', [ficha]);
  assert.equal(e.registros_enlace, 1);
});

test('formulario público: validaciones y no revela si la cédula ya existe', async () => {
  const reg = (o) => base.como(null, 'select registrar_por_enlace($1, $2::jsonb) r', [token, persona(o)]);
  await assert.rejects(reg({ cedula: '2000001', acepta: false }), /aceptar el tratamiento/);
  await assert.rejects(reg({ cedula: '2000002', edad: '16' }), /mayor de edad/);
  await assert.rejects(reg({ cedula: '12', }), /cédula/);
  await assert.rejects(reg({ cedula: '2000003', sexo: '' }), /sexo/);
  await assert.rejects(reg({ cedula: '2000004', edad: '', fecha_nacimiento: '' }), /edad/);
  const [{ r }] = await reg({ nombres: 'Otra persona' }); // misma cédula
  assert.equal(r, 'recibido');
  const [{ n }] = await base.sistema(`select count(*)::int n from personas where cedula = '1020304'`);
  assert.equal(n, 1);
  // El anónimo no puede leer personas ni líderes
  await assert.rejects(base.como(null, 'select * from personas'), /permission denied/);
  await assert.rejects(base.como(null, 'select * from lideres'), /permission denied/);
});

test('enlace apagado o cambiado deja de servir', async () => {
  await base.como(lider, 'select configurar_enlace($1, false)', [ficha]);
  assert.equal((await base.como(null, 'select * from enlace_info($1)', [token])).length, 0);
  await assert.rejects(base.como(null, 'select registrar_por_enlace($1, $2::jsonb)', [token, persona({ cedula: '3000001' })]), /ya no está activo/);
  await base.como(lider, 'select configurar_enlace($1, true, true)', [ficha]);
  const [{ token: nuevo }] = await base.como(lider, 'select token from enlace_lider($1)', [ficha]);
  assert.notEqual(nuevo, token);
  await assert.rejects(base.como(null, 'select registrar_por_enlace($1, $2::jsonb)', [token, persona({ cedula: '3000002' })]), /ya no está activo/);
  await assert.rejects(base.como(otroLider, 'select configurar_enlace($1, false)', [ficha]), /Sin acceso/);
});

test('límite por conexión', async () => {
  const [{ token: t }] = await base.como(lider, 'select token from enlace_lider($1)', [ficha]);
  await base.sistema(`insert into app.enlace_intentos(token, origen) select $1, '9.9.9.9' from generate_series(1, 30)`, [t]);
  await assert.rejects(
    base.peticion(admin, { metodo: 'POST', encabezados: { 'cf-connecting-ip': '9.9.9.9' } },
      `select registrar_por_enlace('${t}', '${persona({ cedula: '4000001' })}'::jsonb)`),
    /Demasiados registros/);
});

test('sin sesión solo se puede usar el formulario público', async () => {
  const filas = await base.sistema(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`);
  assert.deepEqual(filas.map((f) => f.proname), ['antes_de_peticion', 'enlace_info', 'registrar_por_enlace']);
});

test('las conexiones del formulario se borran a los 2 días', async () => {
  await base.sistema(`insert into app.enlace_intentos(token, origen, en) values ('viejo', '1.1.1.1', now() - interval '3 days')`);
  await base.sistema(`insert into app.enlace_intentos(token, origen) values ('nuevo', '2.2.2.2')`);
  const r = await base.sistema(`select token from app.enlace_intentos where token in ('viejo', 'nuevo')`);
  assert.deepEqual(r.map((x) => x.token), ['nuevo']);
});
