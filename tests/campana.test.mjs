// Seguimiento de simpatizantes, Día D, testigos electorales y alertas
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, otra, admin, coord, lider, otroLider, cand, dig, fichaA, fichaB, eleccion, p = {};

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Campaña', 'campana') returning id`);
  [{ id: otra }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Otra', 'otra-org') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  coord = await base.crearUsuario(org, 'Coord', 'coordinador');
  lider = await base.crearUsuario(org, 'Ana', 'lider');
  otroLider = await base.crearUsuario(org, 'Beto', 'lider');
  cand = await base.crearUsuario(org, 'Cand', 'candidato');
  dig = await base.crearUsuario(org, 'Digi', 'digitador');
  [{ id: fichaA }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, coordinador_id, nombre) values ($1,$2,$3,'Ana') returning id`, [org, lider, coord]);
  [{ id: fichaB }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre) values ($1,$2,'Beto') returning id`, [org, otroLider]);
  const nueva = async (clave, ficha, cedula, mesa, tel, nombres = 'Persona', apellidos = clave) => {
    [{ id: p[clave] }] = await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, apellidos, sexo, edad_declarada, edad_declarada_en, mesa_id, telefono)
      values ($1,$2,$3,$4,$5,'otro',30,current_date,$6,$7) returning id`, [org, ficha, cedula, nombres, apellidos, mesa, tel]);
  };
  await nueva('a1', fichaA, '61000001', 1, '3001110001', 'Carlos', 'Rojas');
  await nueva('a2', fichaA, '61000002', 1, '3001110002', 'Diana', 'Torres');
  await nueva('a3', fichaA, '61000003', 2, '3009999999', 'Luz Marina', 'Gómez Díaz');
  await nueva('b1', fichaB, '61000004', 2, '3009999999', 'LUZ MARINA', 'GOMEZ DIAZ');
  await nueva('b2', fichaB, '61000005', 5, null, 'Hugo', 'Pardo');
  [{ id: eleccion }] = await base.sistema(
    `insert into elecciones(organizacion_id, nombre, fecha, municipio_id) values ($1,'Senado','2026-03-08',(select id from municipios where divipola='11001')) returning id`, [org]);
});

test('seguimiento: el líder registra contactos de su gente y cambia el estado', async () => {
  await base.como(lider, `select registrar_contacto($1, 'no_contesta', 'llamada', null)`, [p.a1]);
  let [x] = await base.sistema('select compromiso, contactos_n from personas where id = $1', [p.a1]);
  assert.deepEqual([x.compromiso, x.contactos_n], ['sin_contactar', 1]);  // no contesta: solo suma intento
  await base.como(lider, `select registrar_contacto($1, 'confirmado', 'whatsapp', 'Va con la familia')`, [p.a1]);
  [x] = await base.sistema('select compromiso, contactos_n, compromiso_en is not null c from personas where id = $1', [p.a1]);
  assert.deepEqual([x.compromiso, x.contactos_n, x.c], ['confirmado', 2, true]);
  await base.como(lider, `select registrar_contacto($1, 'dudoso')`, [p.a2]);
  await assert.rejects(base.como(lider, `select registrar_contacto($1, 'confirmado')`, [p.b1]), /no está en tu lista/);
  await assert.rejects(base.como(cand, `select registrar_contacto($1, 'confirmado')`, [p.a3]), /no puede registrar/);
  await assert.rejects(base.como(lider, `select registrar_contacto($1, 'quizas')`, [p.a3]), /check/);
  // Historial visible para el líder y el admin; no para otro líder
  assert.equal((await base.como(lider, 'select * from contactos')).length, 3);
  assert.equal((await base.como(otroLider, 'select * from contactos')).length, 0);
  assert.equal((await base.como(admin, 'select * from contactos')).length, 3);
});

test('seguimiento: tasas por líder; el candidato ve cifras, no personas', async () => {
  const filas = await base.como(cand, 'select nombre, total, confirmados, dudosos, sin_contactar, contactados from v_seguimiento_lideres order by nombre');
  assert.deepEqual(filas.map((f) => [f.nombre, f.total, f.confirmados, f.dudosos, f.sin_contactar, f.contactados]),
    [['Ana', 3, 1, 1, 1, 2], ['Beto', 2, 0, 0, 2, 0]]);
  assert.equal((await base.como(lider, 'select * from v_seguimiento_lideres')).length, 1);
  assert.equal((await base.como(cand, 'select * from contactos')).length, 0);
});

test('Día D: el líder marca quién votó; el candidato ve el avance', async () => {
  await base.como(lider, 'select marcar_voto($1, $2, true)', [eleccion, p.a1]);
  await base.como(lider, 'select marcar_voto($1, $2, true)', [eleccion, p.a1]); // dos veces: no duplica
  await base.como(lider, 'select marcar_voto($1, $2, true)', [eleccion, p.a3]);
  await base.como(lider, 'select marcar_voto($1, $2, false)', [eleccion, p.a3]); // se equivocó y desmarca
  await assert.rejects(base.como(lider, 'select marcar_voto($1, $2, true)', [eleccion, p.b2]), /no está en tu lista/);
  await assert.rejects(base.como(dig, 'select marcar_voto($1, $2, true)', [eleccion, p.a2]), /no puede marcar/);
  const r = await base.como(cand, `select lider, sum(personas)::int n, sum(votaron)::int v from v_dia_d where eleccion_id = $1 group by lider order by lider`, [eleccion]);
  assert.deepEqual(r.map((x) => [x.lider, x.n, x.v]), [['Ana', 3, 1], ['Beto', 2, 0]]);
  const propia = await base.como(lider, `select sum(personas)::int n from v_dia_d where eleccion_id = $1`, [eleccion]);
  assert.equal(propia[0].n, 3);
});

test('testigos: asignación, validaciones y cobertura de mesas', async () => {
  await base.como(admin, `select asignar_testigo($1, $2, 1, '{1}')`, [eleccion, p.a2]);       // Pepe Sierra mesa 1
  await assert.rejects(base.como(admin, `select asignar_testigo($1, $2, 1, '{1}')`, [eleccion, p.b2]), /celular/);
  await assert.rejects(base.como(admin, `select asignar_testigo($1, $2, 1, '{9}')`, [eleccion, p.a1]), /mesas de la 1 a la 4/);
  await assert.rejects(base.como(lider, `select asignar_testigo($1, $2, 1, '{}')`, [eleccion, p.a1]), /Solo administradores/);
  await assert.rejects(base.como(coord, `select asignar_testigo($1, $2, 1, '{}')`, [eleccion, p.b1]), /no es de tus líderes/);
  const cob = await base.como(cand, `select puesto, mesa, simpatizantes, cubierta from v_testigos_cobertura where eleccion_id = $1 order by puesto, mesa`, [eleccion]);
  assert.deepEqual(cob.map((c) => [c.mesa, c.simpatizantes, c.cubierta]), [[1, 1, false], [1, 2, true], [2, 2, false]]);
  // Un testigo sin mesas concretas cubre todo el puesto
  await base.como(coord, `select asignar_testigo($1, $2, 1, '{}')`, [eleccion, p.a3]);
  const cob2 = await base.como(admin, `select mesa, cubierta from v_testigos_cobertura where eleccion_id = $1 and puesto_id = 1 order by mesa`, [eleccion]);
  assert.deepEqual(cob2.map((c) => c.cubierta), [true, true]);
  // Datos de contacto: solo admin y coordinador
  assert.equal((await base.como(admin, 'select * from v_testigos')).length, 2);
  assert.equal((await base.como(cand, 'select * from v_testigos')).length, 0);
  assert.equal((await base.como(lider, 'select * from v_testigos')).length, 0);
  const [{ id }] = await base.sistema('select id from testigos where persona_id = $1', [p.a3]);
  await base.como(admin, 'select quitar_testigo($1)', [id]);
  assert.equal((await base.como(admin, 'select * from v_testigos')).length, 1);
});

test('alertas: celular repetido y mismo nombre en el mismo puesto', async () => {
  const al = await base.como(admin, 'select tipo, personas, lideres from v_alertas_calidad order by tipo');
  assert.deepEqual(al.map((a) => [a.tipo, a.personas]), [['celular_repetido', 2], ['nombre_repetido', 2]]);
  assert.match(al[0].lideres, /Ana/);
  assert.match(al[0].lideres, /Beto/);
  // El coordinador solo ve alertas de sus líderes (Ana): ninguna alcanza 2 personas
  assert.equal((await base.como(coord, 'select * from v_alertas_calidad')).length, 0);
  assert.equal((await base.como(lider, 'select * from v_alertas_calidad')).length, 0);
});

test('alertas: ráfaga de registros manuales', async () => {
  for (let i = 0; i < 15; i++) {
    await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, sexo, edad_declarada, edad_declarada_en, telefono, creado_en)
      values ($1,$2,$3,'R','otro',30,current_date,$4, now() - interval '1 day')`, [org, fichaB, `6200${String(i).padStart(4, '0')}`, `31000000${String(i).padStart(2, '0')}`]);
  }
  const r = await base.como(admin, `select titulo, personas from v_alertas_calidad where tipo = 'rafaga'`);
  assert.equal(r.length >= 1, true);
  assert.match(r[0].titulo, /Beto registró \d+ personas en 10 minutos/);
});
