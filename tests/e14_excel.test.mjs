// E14 desde Excel con doble verificación, y vistas de análisis
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, otra, admin, dig1, dig2, lider, candidato, eleccion, ficha;
const filas = (xs) => JSON.stringify(xs);

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Campaña', 'campana') returning id`);
  [{ id: otra }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Otra', 'otra-org') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  dig1 = await base.crearUsuario(org, 'Ana', 'digitador');
  dig2 = await base.crearUsuario(org, 'Beto', 'digitador');
  lider = await base.crearUsuario(org, 'Líder', 'lider');
  candidato = await base.crearUsuario(org, 'Candidato', 'candidato');
  [{ id: ficha }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, nombre, meta_votos) values ($1,$2,'Líder',10) returning id`, [org, lider]);
  for (const [c, mesa, tel] of [['1', 1, '3001112233'], ['2', 1, null], ['3', 2, null], ['4', 5, null]]) {
    await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, sexo, edad_declarada, edad_declarada_en, mesa_id, telefono)
                        values ($1,$2,$3,'X','otro',30,current_date,$4,$5)`, [org, ficha, `8000${c}`, mesa, tel]);
  }
  await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, puesto_reportado, localidad_votacion_id, origen)
                      values ($1,$2,'80009','Sin datos','Colegio raro',(select id from localidades where codigo='01'),'importacion')`, [org, ficha]);
  [{ id: eleccion }] = await base.sistema(
    `insert into elecciones(organizacion_id, nombre, fecha, municipio_id) values ($1,'Senado','2026-03-08',(select id from municipios where divipola='11001')) returning id`, [org]);
});

const importar = (u, xs, confirmar) => base.como(u, `select * from importar_e14($1, 'e14.xlsx', $2, $3)`, [eleccion, filas(xs), confirmar]);

test('plantilla: mesas con simpatizantes y sus códigos, sin esperados', async () => {
  const p = await base.como(dig1, `select * from v_e14_plantilla where eleccion_id = $1 order by puesto, mesa`, [eleccion]);
  assert.deepEqual(p.map((x) => [x.puesto, x.mesa, x.zona, x.codigo_puesto]),
    [['Colegio Kennedy', 1, '08', '01'], ['Pepe Sierra', 1, '01', '01'], ['Pepe Sierra', 2, '01', '01']]);
  assert.ok(!('esperados' in p[0]));
  assert.equal((await base.como(candidato, `select * from v_e14_plantilla`)).length, 0);
});

const archivoAna = [
  { fila: 2, zona: '1', codigo_puesto: '1', mesa: '1', votos: '2' },                    // por códigos
  { fila: 3, localidad: 'usaquen', puesto: 'PEPE SIERRA', mesa: '2', votos: '0' },       // por nombre
  { fila: 4, localidad: 'Kennedy', puesto: 'Colegio Kennedy', mesa: '1', votos: '1.000' }, // 1000 con punto
  { fila: 5, localidad: 'Kennedy', puesto: 'No existe', mesa: '1', votos: '3' },
  { fila: 6, localidad: 'Usaquén', puesto: 'Pepe Sierra', mesa: '99', votos: '3' },
  { fila: 7, localidad: 'Usaquén', puesto: 'Pepe Sierra', mesa: '1', votos: '5' },       // repetida
  { fila: 8, localidad: 'Usaquén', puesto: 'Pepe Sierra', mesa: '3', votos: 'abc' },
  { fila: 9, localidad: 'Usaquén', puesto: 'Pepe Sierra', mesa: '4', votos: '' },
  { fila: 10, localidad: 'Narnia', puesto: 'X', mesa: '1', votos: '1' },
];

test('prueba en seco: reporta fila por fila y no guarda nada', async () => {
  const r = await importar(dig1, archivoAna, false);
  assert.deepEqual(r.map((x) => [x.fila, x.estado]), [
    [2, 'nueva'], [3, 'nueva'], [4, 'nueva'], [5, 'error'], [6, 'error'], [7, 'error'], [8, 'error'], [9, 'vacia'], [10, 'error'],
  ]);
  assert.match(r[3].mensaje, /puesto no encontrado/);
  assert.match(r[4].mensaje, /mesa 99 no existe/);
  assert.match(r[5].mensaje, /repetida/);
  assert.match(r[8].mensaje, /localidad no encontrada/);
  assert.equal((await base.sistema(`select count(*)::int n from e14_digitaciones`))[0].n, 0);
});

test('confirmar: cuenta como UNA verificación (la de quien sube)', async () => {
  await importar(dig1, archivoAna, true);
  const ds = await base.sistema(`select origen, archivo, digitado_por from e14_digitaciones`);
  assert.equal(ds.length, 3);
  assert.ok(ds.every((d) => d.origen === 'excel' && d.archivo === 'e14.xlsx' && d.digitado_por === dig1));
  const [a] = await base.como(admin, `select * from v_e14_avance`);
  assert.deepEqual([a.una_digitacion, a.verificadas], [3, 0], 'nadie más ha verificado');
});

test('la misma persona no se verifica a sí misma subiendo otra vez', async () => {
  const r = await importar(dig1, archivoAna.slice(0, 3), true);
  assert.deepEqual(r.map((x) => x.estado), ['sin_cambios', 'sin_cambios', 'sin_cambios']);
  const [a] = await base.como(admin, `select * from v_e14_avance`);
  assert.equal(a.verificadas, 0);
});

test('segunda persona: coincide → verificada; distinto → diferencia', async () => {
  await importar(dig2, [
    { fila: 2, localidad: 'Usaquén', puesto: 'Pepe Sierra', mesa: '1', votos: '2' },
    { fila: 3, localidad: 'Usaquén', puesto: 'Pepe Sierra', mesa: '2', votos: '4' },
  ], true);
  await base.como(dig2, `insert into e14_digitaciones(eleccion_id, organizacion_id, mesa_id, votos) values ($1,$2,5,1000)`, [eleccion, org]);
  const ms = await base.como(admin, `select mesa_id, estado from v_e14_mesas order by mesa_id`);
  assert.deepEqual(ms.map((m) => [m.mesa_id, m.estado]), [[1, 'verificado'], [2, 'en_revision'], [5, 'verificado']]);
});

test('corregir con un archivo nuevo reemplaza solo el valor propio', async () => {
  const r = await importar(dig2, [{ fila: 2, localidad: 'Usaquén', puesto: 'Pepe Sierra', mesa: '2', votos: '0' }], true);
  assert.equal(r[0].estado, 'cambia');
  assert.match(r[0].mensaje, /anterior \(4\)/);
  const [m] = await base.como(admin, `select estado, votos_reales from v_e14_mesas where mesa_id = 2`);
  assert.deepEqual(m, { estado: 'verificado', votos_reales: 0 });
});

test('solo admin y digitadores pueden subir', async () => {
  await assert.rejects(importar(candidato, archivoAna, false), /Solo administradores y digitadores/);
  await assert.rejects(importar(lider, archivoAna, false), /Solo administradores y digitadores/);
});

test('análisis: registros por mesa y calidad por líder', async () => {
  const rm = await base.como(candidato, `select puesto, mesa, personas from v_registros_mesa order by puesto, mesa`);
  assert.deepEqual(rm.map((x) => [x.puesto, x.mesa, x.personas]), [['Colegio Kennedy', 1, 1], ['Pepe Sierra', 1, 2], ['Pepe Sierra', 2, 1]]);
  const [c] = await base.como(lider, `select * from v_calidad_lideres`);
  assert.deepEqual([c.total, c.ubicados, c.por_revisar, c.sin_sexo, c.sin_edad, c.sin_telefono, c.sin_consentimiento, c.importados],
    [5, 4, 1, 1, 1, 4, 5, 1]);
  assert.equal((await base.como(dig1, `select * from v_registros_mesa`)).length, 0);
});

test('las exportaciones quedan en la auditoría', async () => {
  await base.como(admin, `select registrar_exportacion('personas', 42, '{"localidad":"Kennedy"}')`);
  const [a] = await base.como(admin, `select accion, usuario_id, despues from auditoria where tabla = 'exportacion'`);
  assert.equal(a.accion, 'EXPORT');
  assert.equal(a.usuario_id, admin);
  assert.deepEqual([a.despues.tipo, a.despues.filas, a.despues.filtros.localidad], ['personas', 42, 'Kennedy']);
});

// Error encontrado en la prueba completa: "B4" se leía como "04" y la mesa
// terminaba en otro puesto. Los códigos con letras deben respetarse.
test('códigos de puesto con letras: no se confunden con el numérico', async () => {
  await base.sistema(`insert into puestos(id, localidad_id, zona, codigo, nombre, direccion, latitud, longitud)
                      values (90, (select localidad_id from puestos where id = 2), '08', 'B1', 'Colegio Letra', 'Cl 1 # 1-1', 4.6, -74.1)`);
  await base.sistema(`insert into mesas(id, puesto_id, numero) values (90, 90, 1)`);
  const r = await importar(dig1, [
    { fila: 2, zona: '8', codigo_puesto: ' b1 ', mesa: '1', votos: '3' },                         // con letras
    { fila: 3, zona: '08', codigo_puesto: '1', puesto: 'Colegio Kennedy', mesa: '1', votos: '3' }, // numérico
    { fila: 4, zona: '08', codigo_puesto: '01', puesto: 'Colegio Letra', mesa: '1', votos: '3' },  // código y nombre no cuadran
  ], false);
  assert.deepEqual(r.map((x) => [x.fila, x.estado === 'error', x.mesa_id]), [[2, false, 90], [3, false, 5], [4, true, null]]);
  assert.match(r[2].mensaje, /el código 08-01 es "Colegio Kennedy", no "Colegio Letra"/);
  const [{ a, b, c }] = await base.sistema(`select app.codigo_oficial('4') a, app.codigo_oficial(' b4 ') b, app.codigo_oficial('-') c`);
  assert.deepEqual([a, b, c], ['04', 'B4', null]);
});
