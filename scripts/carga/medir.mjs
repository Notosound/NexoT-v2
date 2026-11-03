// Prueba de carga: 40.000 personas inventadas en Postgres local (PGlite)
// con las migraciones reales y el catálogo oficial de Bogotá. Mide lo que
// el panel consulta como administrador, coordinador y líder.
//   node scripts/carga/medir.mjs [personas]
import { crearBase } from '../../tests/entorno.mjs';

const N = Number(process.argv[2] ?? 40000);
const LIDERES = 200;
const t0 = Date.now();
const base = await crearBase();
const [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Carga', 'carga') returning id`);
const admin = await base.crearUsuario(org, 'Admin', 'admin');
const coord = await base.crearUsuario(org, 'Coord', 'coordinador');
const cand = await base.crearUsuario(org, 'Cand', 'candidato');
const lider = await base.crearUsuario(org, 'Lider', 'lider');

await base.sistema(`
  insert into lideres(organizacion_id, nombre, meta_votos, coordinador_id, perfil_id)
  select $1, 'Líder ' || g, 150 + (g % 7) * 50, case when g <= 20 then $2::uuid end, case when g = 1 then $3::uuid end
  from generate_series(1, ${LIDERES}) g`, [org, coord, lider]);
const [{ n: mesas }] = await base.sistema('select count(*)::int n from mesas');
console.log(`Catálogo: ${mesas} mesas oficiales`);

// Personas: 88 % con mesa, 7 % con puesto reportado sin ubicar, 5 % sin lugar
await base.sistema(`alter table personas disable trigger user`);
await base.sistema(`
  with m as (select id, puesto_id, row_number() over (order by id) rn, count(*) over () total from mesas),
       l as (select id, row_number() over (order by nombre) rn from lideres where organizacion_id = $1)
  insert into personas(organizacion_id, lider_id, cedula, nombres, apellidos, sexo, edad_declarada, edad_declarada_en,
                       telefono, mesa_id, puesto_id, puesto_reportado, origen, creado_en, compromiso, ubicacion_estado)
  select $1, l.id, (10000000 + g)::text,
         (array['Ana','Luis','Marta','Jorge','Paula','Andrés','Diana','Carlos'])[1 + g % 8],
         (array['Rojas','Gómez','Díaz','Torres','Pardo','López'])[1 + g % 6],
         case when g % 2 = 0 then 'femenino' else 'masculino' end, 18 + g % 60, current_date,
         '3' || lpad((100000000 + g)::text, 9, '0'),
         case when g % 100 < 88 then m.id end, case when g % 100 < 88 then m.puesto_id end,
         case when g % 100 between 88 and 94 then 'Colegio del barrio ' || (g % 300) end,
         case when g % 10 = 0 then 'importacion' else 'manual' end,
         now() - (g % 120) * interval '1 day' - (g % 1440) * interval '1 minute',
         (array['sin_contactar','sin_contactar','confirmado','dudoso','no_apoya'])[1 + g % 5],
         case when g % 100 < 88 then 'completa' when g % 100 < 95 then 'por_revisar' else 'sin_dato' end
  from generate_series(1, ${N}) g
  join l on l.rn = 1 + g % ${LIDERES}
  join m on m.rn = 1 + (g * 7919) % m.total`, [org]);
await base.sistema(`alter table personas enable trigger user`);
await base.sistema('analyze');
const [{ n: total }] = await base.sistema('select count(*)::int n from personas');
console.log(`Cargadas ${total} personas en ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

const consultas = [
  ['Inicio: demografía', admin, 'select * from v_demografia'],
  ['Inicio: tendencia diaria', admin, 'select * from v_tendencia_diaria'],
  ['Líderes: avance', admin, 'select * from v_avance_lideres'],
  ['Personas: página 1 + total', admin, `select count(*) over () total, * from personas where eliminado_en is null order by creado_en desc limit 50`],
  ['Personas: buscar por cédula', admin, `select * from personas where eliminado_en is null and cedula like '100123%' limit 50`],
  ['Personas: buscar por nombre', admin, `select * from personas where eliminado_en is null and (nombres ilike '%marta%' or apellidos ilike '%rojas%') order by creado_en desc limit 50`],
  ['Análisis: registros por mesa', admin, 'select * from v_registros_mesa'],
  ['Análisis: calidad por líder', admin, 'select * from v_calidad_lideres'],
  ['Análisis: datos sospechosos', admin, 'select * from v_alertas_calidad'],
  ['Seguimiento por líder', admin, 'select * from v_seguimiento_lideres'],
  ['Revisión de puestos', admin, 'select * from v_ubicaciones_por_revisar'],
  ['Coordinador: avance', coord, 'select * from v_avance_lideres'],
  ['Coordinador: personas', coord, 'select count(*) from personas where eliminado_en is null'],
  ['Candidato: demografía', cand, 'select * from v_demografia'],
  ['Líder: mis registros', lider, `select count(*) over () total, * from personas where eliminado_en is null order by creado_en desc limit 50`],
];

const resultados = [];
for (const [nombre, usuario, sql] of consultas) {
  await base.como(usuario, sql);              // calentar
  const veces = [];
  let filas = 0;
  for (let i = 0; i < 3; i++) {
    const a = performance.now();
    filas = (await base.como(usuario, sql)).length;
    veces.push(performance.now() - a);
  }
  const ms = Math.min(...veces);
  resultados.push({ nombre, ms, filas });
  console.log(`${ms < 300 ? '✓' : ms < 1000 ? '~' : '✗'} ${nombre.padEnd(34)} ${ms.toFixed(0).padStart(6)} ms  (${filas} filas)`);
}
console.log('\n✓ < 0,3 s   ~ < 1 s   ✗ ≥ 1 s   (PGlite corre en un solo hilo y en WebAssembly: Supabase suele ser 3 a 10 veces más rápido)');
if (process.env.EXPLICAR) {
  for (const [nombre, usuario, sql] of consultas.filter((c) => process.env.EXPLICAR.split(',').some((e) => c[0].includes(e)))) {
    console.log(`\n── ${nombre}`);
    for (const f of await base.como(usuario, `explain analyze ${sql}`)) console.log(f['QUERY PLAN']);
  }
}
