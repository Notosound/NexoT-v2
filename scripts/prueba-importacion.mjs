// Prueba en seco de un Excel: lo valida contra una base temporal en
// memoria (con las migraciones reales) y muestra SOLO conteos y tipos de
// problema. No imprime nombres, cédulas ni teléfonos, y no guarda nada.
//
//   node scripts/prueba-importacion.mjs ruta/al/archivo.xlsx

import ExcelJS from 'exceljs';
import { crearBase } from '../tests/entorno.mjs';
import { mapearEncabezados, filaACanonica, filaVacia } from '../src/importacion/mapeo.mjs';

const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: node scripts/prueba-importacion.mjs archivo.xlsx');
  process.exit(1);
}

const libro = new ExcelJS.Workbook();
await libro.xlsx.readFile(archivo);
const hoja = libro.worksheets[0];
const filas = [];
hoja.eachRow({ includeEmpty: false }, (fila, n) => filas.push({ n, celdas: fila.values.slice(1) }));

const [encabezado, ...datos] = filas;
const { mapeo, faltan, sinReconocer, repetidos } = mapearEncabezados(encabezado.celdas);

console.log(`\nArchivo: hoja "${hoja.name}", ${datos.length} filas de datos`);
console.log('Columnas reconocidas:', Object.entries(mapeo).map(([i, c]) => `${encabezado.celdas[i]} → ${c}`).join(', '));
if (sinReconocer.length) console.log('Columnas no reconocidas (se ignoran):', sinReconocer.join(', '));
if (repetidos.length) console.log('Columnas repetidas:', repetidos.join('; '));
if (faltan.length) {
  console.error('Faltan columnas obligatorias:', faltan.join(', '));
  process.exit(1);
}

// Base temporal con un líder por defecto (el archivo es de un solo líder)
const base = await crearBase();
const [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Prueba', 'prueba') returning id`);
const admin = await base.crearUsuario(org, 'Admin', 'admin');
const [{ id: lider }] = await base.sistema(`insert into lideres(organizacion_id, nombre) values ($1, 'Líder del archivo') returning id`, [org]);
const [{ id: imp }] = await base.como(admin,
  `insert into importaciones(organizacion_id, archivo, municipio_id, lider_id_defecto)
   values ($1, $2, (select id from municipios where divipola = '11001'), $3) returning id`, [org, archivo.split('/').pop(), lider]);

for (const { n, celdas } of datos) {
  const d = filaACanonica(celdas, mapeo);
  if (filaVacia(d)) continue;
  await base.como(admin, `insert into importacion_filas(importacion_id, organizacion_id, fila, datos) values ($1,$2,$3,$4)`,
    [imp, org, n, JSON.stringify(d)]);
}

const [r] = await base.como(admin, `select * from app.validar_importacion($1)`, [imp]);
console.log(`\nResultado: ${r.total_filas} filas`);
console.log(`  válidas:        ${r.filas_validas}`);
console.log(`  con errores:    ${r.filas_con_errores}`);
console.log(`  duplicadas:     ${r.filas_duplicadas}`);

// Tipos de problema, sin el valor concreto (puede ser un dato personal)
const tipos = async (col) => base.sistema(`
  select split_part(m, ':', 1) as tipo, count(*)::int as filas
  from importacion_filas, unnest(${col}) m where importacion_id = $1
  group by 1 order by 2 desc`, [imp]);
const imprimir = (titulo, lista) => {
  if (!lista.length) return;
  console.log(`\n${titulo}:`);
  for (const t of lista) console.log(`  ${String(t.filas).padStart(5)}  ${t.tipo}`);
};
imprimir('Errores (la fila NO entra)', await tipos('errores'));
imprimir('Advertencias (la fila entra, con el dato vacío)', await tipos('advertencias'));

// Localidades y destinos fuera del municipio: son nombres de lugares, no datos personales
const lugares = await base.sistema(`
  select coalesce(datos->>'localidad','(vacía)') localidad, coalesce(datos->>'departamento','') departamento,
         count(*)::int filas, bool_or(exists (select 1 from unnest(advertencias) a where a like 'localidad no encontrada%' or a like 'vota fuera%')) no_ubicada
  from importacion_filas where importacion_id = $1 group by 1, 2 order by 3 desc`, [imp]);
const noUbicadas = lugares.filter((l) => l.no_ubicada);
if (noUbicadas.length) {
  console.log('\nLocalidades que no son de Bogotá o no se reconocen:');
  for (const l of noUbicadas) console.log(`  ${String(l.filas).padStart(5)}  ${l.localidad}${l.departamento ? ` (${l.departamento})` : ''}`);
}
console.log(`\nLocalidades de Bogotá reconocidas: ${new Set(lugares.filter((l) => !l.no_ubicada).map((l) => l.localidad)).size}`);
console.log('\n(No se guardó nada. Base temporal en memoria.)\n');
