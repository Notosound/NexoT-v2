// Metas por líder: semáforo según el ritmo y ranking semanal
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, admin, coord, cand, lider, otro, fichas = {};

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Campaña', 'campana-m') returning id`);
  admin = await base.crearUsuario(org, 'Admin', 'admin');
  coord = await base.crearUsuario(org, 'Coord', 'coordinador');
  cand = await base.crearUsuario(org, 'Cand', 'candidato');
  lider = await base.crearUsuario(org, 'Ana', 'lider');
  otro = await base.crearUsuario(org, 'Beto', 'lider');
  // Ana: meta 10, lleva 6 (2 esta semana). Beto: meta 10, lleva 2. Caro: sin meta. Dani: meta 3, lleva 3.
  const defs = [['Ana', 10, lider, coord, 6, 2], ['Beto', 10, otro, null, 2, 2], ['Caro', 0, null, null, 1, 0], ['Dani', 3, null, coord, 3, 3]];
  let n = 0;
  for (const [nombre, meta, perfil, c, total, recientes] of defs) {
    [{ id: fichas[nombre] }] = await base.sistema(`insert into lideres(organizacion_id, perfil_id, coordinador_id, nombre, meta_votos) values ($1,$2,$3,$4,$5) returning id`, [org, perfil, c, nombre, meta]);
    for (let i = 0; i < total; i++) {
      n++;
      await base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, sexo, edad_declarada, edad_declarada_en, telefono, creado_en)
        values ($1,$2,$3,'P','otro',30,current_date,$4, now() - $5::interval)`, [org, fichas[nombre], `8100${String(n).padStart(4, '0')}`, `30077700${String(n).padStart(2, '0')}`, i < recientes ? '1 day' : '20 days']);
    }
  }
});

test('sin fechas: semáforo por porcentaje de la meta', async () => {
  const r = await base.como(admin, 'select nombre, registrados, esta_semana, semaforo, esperado_hoy from v_metas_lideres order by nombre');
  assert.deepEqual(r.map((x) => [x.nombre, x.registrados, x.esta_semana, x.semaforo]),
    [['Ana', 6, 2, 'amarillo'], ['Beto', 2, 2, 'rojo'], ['Caro', 1, 0, 'sin_meta'], ['Dani', 3, 3, 'cumplida']]);
  assert.equal(r[0].esperado_hoy, null);
});

test('con fechas: semáforo según el ritmo esperado', async () => {
  await assert.rejects(base.como(coord, `select configurar_fechas_meta(current_date - 50, current_date + 50)`), /Solo un administrador/);
  await assert.rejects(base.como(admin, `select configurar_fechas_meta(current_date, current_date - 1)`), /posterior/);
  await base.como(admin, `select configurar_fechas_meta(current_date - 50, current_date + 50)`);  // va la mitad del tiempo
  const r = await base.como(admin, 'select nombre, semaforo, esperado_hoy from v_metas_lideres order by nombre');
  assert.deepEqual(r.map((x) => [x.nombre, x.esperado_hoy, x.semaforo]),
    [['Ana', 5, 'verde'], ['Beto', 5, 'rojo'], ['Caro', null, 'sin_meta'], ['Dani', 2, 'cumplida']]);
});

test('cada rol ve sus líderes; el coordinador puede cambiar la meta de los suyos', async () => {
  assert.equal((await base.como(coord, 'select * from v_metas_lideres')).length, 2);
  assert.equal((await base.como(cand, 'select * from v_metas_lideres')).length, 4);
  assert.deepEqual((await base.como(lider, 'select nombre from v_metas_lideres')).map((x) => x.nombre), ['Ana']);
  await base.como(coord, 'update lideres set meta_votos = 20 where id = $1', [fichas.Ana]);
  await base.como(coord, 'update lideres set meta_votos = 99 where id = $1', [fichas.Beto]);  // no es suyo: no cambia
  const m = await base.sistema('select nombre, meta_votos from lideres order by nombre');
  assert.deepEqual(m.map((x) => x.meta_votos), [20, 10, 0, 3]);
  await base.como(lider, 'update lideres set meta_votos = 1 where id = $1', [fichas.Ana]);    // el líder no cambia su meta
  assert.equal((await base.sistema('select meta_votos from lideres where id = $1', [fichas.Ana]))[0].meta_votos, 20);
});

test('ranking semanal: todos lo ven, el líder ve su posición', async () => {
  const r = await base.como(lider, 'select posicion, nombre, registros, soy_yo from ranking_semanal()');
  assert.deepEqual(r.map((x) => [x.posicion, x.nombre, x.registros, x.soy_yo]),
    [[1, 'Dani', 3, false], [2, 'Ana', 2, true], [2, 'Beto', 2, false]]);
  // Caro (0 esta semana) solo aparece si es quien consulta
  assert.equal((await base.como(admin, 'select * from ranking_semanal()')).length, 3);
});
