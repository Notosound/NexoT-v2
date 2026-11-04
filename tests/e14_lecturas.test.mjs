// Lectura automática de E14: primera digitación automática y cola de revisión
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, admin, dig, dig2, lider, eleccion, simple;
const filas = (f) => JSON.stringify(f.map((x, i) => ({ fila: i + 1, ...x })));

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('C', 'c-lec') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  dig = await base.crearUsuario(org, 'Digi', 'digitador');
  dig2 = await base.crearUsuario(org, 'Digi2', 'digitador');
  lider = await base.crearUsuario(org, 'Ana', 'lider');
  [{ id: eleccion }] = await base.sistema(`insert into elecciones(organizacion_id, nombre, fecha, municipio_id) values ($1,'Senado','2026-03-08',(select id from municipios where divipola='11001')) returning id`, [org]);
  [{ id: simple }] = await base.sistema(`insert into elecciones(organizacion_id, nombre, fecha, municipio_id, modo_digitacion) values ($1,'Simple','2026-03-08',(select id from municipios where divipola='11001'),'simple') returning id`, [org]);
});

test('cargar: las claras son primera digitación; las dudosas van a revisión', async () => {
  const r = await base.como(admin, `select * from cargar_lecturas_e14($1, $2::jsonb)`, [eleccion, filas([
    { zona: '01', codigo_puesto: '01', mesa: '1', votos: '23', confianza: '0.97', recorte: 'org/e/1.png' },   // clara
    { zona: '01', codigo_puesto: '01', mesa: '2', votos: '18', confianza: '0.55' },                          // poco clara
    { zona: '01', codigo_puesto: '01', mesa: '3', votos: '7', alternativa: '1', confianza: '0.95' },        // duda entre dos
    { zona: '01', codigo_puesto: '01', mesa: '4', votos: '', confianza: '0' },                              // ilegible
    { zona: '99', codigo_puesto: '01', mesa: '1', votos: '5', confianza: '0.99' },                          // no existe
  ])]);
  assert.deepEqual(r.map((x) => x.estado), ['automatica', 'por_revisar', 'por_revisar', 'por_revisar', 'error']);
  const d = await base.sistema('select mesa_id, votos, digitado_por from e14_digitaciones where eleccion_id = $1', [eleccion]);
  assert.equal(d.length, 1);
  assert.equal(d[0].digitado_por, '00000000-0000-4000-8000-00000000e14a');
  const [res] = await base.sistema('select estado from e14_resultados where eleccion_id = $1 and mesa_id = 1', [eleccion]);
  assert.equal(res.estado, 'una_digitacion');
  const motivos = await base.como(dig, `select mesa, motivo from v_e14_lecturas where estado = 'por_revisar' order by mesa`);
  assert.match(motivos[1].motivo, /podría ser 7 o 1/);
  assert.match(motivos[2].motivo, /no se pudo leer/);
  await assert.rejects(base.como(dig, `select * from cargar_lecturas_e14($1, '[{"mesa":"1"}]'::jsonb)`, [eleccion]), /Solo un administrador/);
  assert.equal((await base.como(lider, 'select * from v_e14_lecturas')).length, 0);
});

test('la segunda digitación humana verifica la mesa si coincide con el lector', async () => {
  await base.como(dig, `insert into e14_digitaciones(eleccion_id, organizacion_id, mesa_id, votos) values ($1,$2,1,23)`, [eleccion, org]);
  const [res] = await base.sistema('select estado, votos, fuente from e14_resultados where eleccion_id = $1 and mesa_id = 1', [eleccion]);
  assert.deepEqual([res.estado, res.votos, res.fuente], ['verificado', 23, 'doble_coincidente']);
});

test('revisar: lo que escribe la persona cuenta como su digitación', async () => {
  const [{ id }] = await base.como(dig, `select id from v_e14_lecturas where mesa = 2`);
  const [{ e }] = await base.como(dig, 'select revisar_lectura_e14($1, 18) e', [id]);
  assert.equal(e, 'una_digitacion');
  await assert.rejects(base.como(dig2, 'select revisar_lectura_e14($1, 18)', [id]), /ya fue revisada/);
  // Otra persona digita la misma mesa: si coincide queda verificada
  await base.como(dig2, `insert into e14_digitaciones(eleccion_id, organizacion_id, mesa_id, votos) values ($1,$2,2,18)`, [eleccion, org]);
  const [res] = await base.sistema('select estado from e14_resultados where eleccion_id = $1 and mesa_id = 2', [eleccion]);
  assert.equal(res.estado, 'verificado');
  // Una nueva carga no reabre una mesa revisada
  const r = await base.como(admin, `select * from cargar_lecturas_e14($1, $2::jsonb)`, [eleccion, filas([{ zona: '01', codigo_puesto: '01', mesa: '2', votos: '99', confianza: '0.99' }])]);
  assert.equal(r[0].estado, 'omitida');
});

test('si el lector y la persona no coinciden, la revisión del admin muestra quién leyó qué', async () => {
  await base.como(admin, `select * from cargar_lecturas_e14($1, $2::jsonb)`, [eleccion, filas([{ zona: '08', codigo_puesto: '01', mesa: '1', votos: '40', confianza: '0.98' }])]);
  await base.como(dig, `insert into e14_digitaciones(eleccion_id, organizacion_id, mesa_id, votos) values ($1,$2,5,46)`, [eleccion, org]);
  const [rev] = await base.como(admin, 'select digitaciones from v_e14_revision where eleccion_id = $1 and mesa_id = 5', [eleccion]);
  assert.deepEqual(rev.digitaciones.map((x) => [x.por, x.votos]), [['Lectura automática', 40], ['Digi', 46]]);
});

test('elección con digitación simple: todo lo confirma una persona', async () => {
  const r = await base.como(admin, `select * from cargar_lecturas_e14($1, $2::jsonb)`, [simple, filas([{ zona: '01', codigo_puesto: '01', mesa: '1', votos: '30', confianza: '0.99' }])]);
  assert.equal(r[0].estado, 'por_revisar');
  assert.equal((await base.sistema('select count(*)::int n from e14_digitaciones where eleccion_id = $1', [simple]))[0].n, 0);
  const [{ recorte }] = await base.como(dig, 'select recorte_mesa($1, 1) recorte', [eleccion]);
  assert.equal(recorte, 'org/e/1.png');
});

test('acepta el archivo del lector tal cual (alterno, documento, motivo)', async () => {
  const r = await base.como(admin, `select * from cargar_lecturas_e14($1, $2::jsonb)`, [eleccion, filas([
    { zona: '01', codigo_puesto: '01', mesa: '3', votos: '17', alterno: '11', confianza: '0.97', documento: 'Z01_P01_M3.pdf', motivo: '' },
    { zona: '01', codigo_puesto: '01', mesa: '4', votos: '20', alterno: '', confianza: '0.99', motivo: 'casilla vacía entre dígitos' },
  ])]);
  assert.deepEqual(r.map((x) => x.estado), ['por_revisar', 'por_revisar']);
  const l = await base.como(admin, `select mesa, alternativa, documento_url, motivo from v_e14_lecturas where eleccion_id = $1 and mesa in (3, 4) and puesto = 'Pepe Sierra' order by mesa`, [eleccion]);
  assert.deepEqual(l.map((x) => [x.alternativa, x.documento_url]), [[11, 'Z01_P01_M3.pdf'], [null, null]]);
  assert.equal(l[1].motivo, 'casilla vacía entre dígitos');
});
