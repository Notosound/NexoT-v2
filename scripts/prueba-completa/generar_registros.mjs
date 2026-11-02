// Genera el Excel de 200 registros FALSOS para la prueba completa.
// Cédulas 99000100–99000299 (marca de datos de prueba). Usa el catálogo
// oficial (vía la base temporal con las migraciones reales) para elegir
// puestos con nombre único y direcciones que el sistema sabe leer.
import ExcelJS from 'exceljs';
import { writeFile } from 'node:fs/promises';
import { crearBase } from '../../tests/entorno.mjs';

const salida = process.argv[2] ?? 'registros_200.xlsx';
let semilla = 7;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
const uno = (xs) => xs[Math.floor(azar() * xs.length)];

const base = await crearBase();
// Puestos con nombre único en su localidad, en 12 localidades
const puestos = await base.sistema(`
  select p.id, l.nombre localidad, l.codigo, p.nombre, p.direccion, p.mesas_total, p.direccion_clave
  from puestos p join localidades l on l.id = p.localidad_id
  where l.codigo in ('01','02','04','07','08','09','10','11','16','18','19','13')
    and (select count(*) from puestos q where q.localidad_id = p.localidad_id and app.normalizar(q.nombre) = app.normalizar(p.nombre)) = 1
    and p.mesas_total >= 4
  order by p.id`);
const elegidos = [];
for (const cod of ['01','02','04','07','08','09','10','11','16','18','19','13']) {
  const ps = puestos.filter((p) => p.codigo === cod);
  for (let k = 0; k < 3; k++) elegidos.push(ps[Math.floor(azar() * ps.length)]);
}
// Puestos con dirección legible y única (para probar la ubicación por dirección)
const conDir = puestos.filter((p) => p.direccion_clave && /^(cl|kr) /.test(p.direccion_clave)
  && puestos.filter((q) => q.direccion_clave === p.direccion_clave).length === 1).slice(0, 40);
const porDireccion = [conDir[3], conDir[17], conDir[29]];
const variante = (d) => d.replace(/\bCLL?\.?\b/i, 'Calle').replace(/\bK?RA?\.?\b|\bCRA\.?\b|\bKR\b/i, 'Carrera').replace(/#/g, 'No.');

const NF = ['Ana','Luz','Marta','Sandra','Paola','Diana','Carolina','Gloria','Yolanda','Natalia','Lina','Rosa','Claudia','Adriana','Mónica','Ángela'];
const NM = ['Carlos','Jorge','Luis','Andrés','Javier','Óscar','Fabio','Hernán','Wilson','Diego','Camilo','Edgar','Mauricio','Felipe','Julián','Álvaro'];
const AP = ['Rojas','Gómez','Díaz','Torres','Moreno','Vargas','Castro','Ruiz','Ortiz','Suárez','Pardo','Niño','Cárdenas','Mejía','Rincón','Quintero'];
const LIDERES = ['99000901','99000902','99000903','99000904','99000905'];

const filas = [];
const fila = (i, o) => filas.push({ cedula: String(99000100 + i), lider: uno(LIDERES), ...o });
const persona = () => {
  const f = azar() < 0.53;
  const anio = 1950 + Math.floor(azar() * 55);
  const nac = azar() < 0.6 ? `${String(1 + Math.floor(azar() * 28)).padStart(2,'0')}/${String(1 + Math.floor(azar() * 12)).padStart(2,'0')}/${anio}` : '';
  return {
    nombres: f ? uno(NF) : uno(NM), apellidos: `${uno(AP)} ${uno(AP)}`, sexo: f ? uno(['Femenino','F','Mujer']) : uno(['Masculino','M','Hombre']),
    nacimiento: nac, edad: nac ? '' : String(2026 - anio), telefono: azar() < 0.7 ? `3${Math.floor(100000000 + azar() * 899999999)}` : '',
  };
};
// 1–170: ubicados en puestos oficiales; mesas 1..5 para que se compartan
for (let i = 0; i < 170; i++) {
  const p = elegidos[Math.floor(azar() * azar() * elegidos.length)];   // concentra en algunos puestos
  fila(i, { ...persona(), localidad: uno([p.localidad, p.localidad.toUpperCase(), p.localidad.normalize('NFD').replace(/[̀-ͯ]/g, '')]),
    puesto: uno([p.nombre, p.nombre.toLowerCase()]), mesa: String(1 + Math.floor(azar() * Math.min(5, p.mesas_total))), caso: 'oficial', puesto_id: p.id });
}
// 171–178: nombres alternativos (4 iguales, 4 distintos)
const alt = elegidos[4];
for (let i = 170; i < 174; i++) fila(i, { ...persona(), localidad: alt.localidad, puesto: 'Colegio Distrital Las Brisas sede B', mesa: String(1 + (i % 3)), caso: 'alterno_grupo', puesto_real: alt.id });
for (let i = 174; i < 178; i++) fila(i, { ...persona(), localidad: elegidos[i - 160].localidad, puesto: `Salón comunal prueba ${i - 173}`, mesa: '1', caso: 'alterno' });
// 179–181: nombre alterno pero con la dirección oficial escrita de otra forma
porDireccion.forEach((p, k) => fila(178 + k, { ...persona(), localidad: p.localidad, puesto: `Institución prueba ${k + 1}`, direccion: variante(p.direccion), mesa: '2', caso: 'direccion', puesto_id: p.id }));
// 182–185: sin lugar de votación
for (let i = 181; i < 185; i++) fila(i, { ...persona(), caso: 'sin_lugar' });
// 186–188: votan fuera de Bogotá
['Meta','Boyacá','Tolima'].forEach((d, k) => fila(185 + k, { ...persona(), departamento: d, localidad: d, puesto: 'Escuela rural', mesa: '1', caso: 'fuera' }));
// 189–191: errores
fila(188, { ...persona(), cedula: '12.34A', caso: 'error_cedula' });
fila(189, { ...persona(), nacimiento: '', edad: '16', caso: 'error_menor' });
fila(190, { ...persona(), nombres: '', apellidos: '', caso: 'error_nombre' });
// 192–193: duplicados (en el archivo y ya existente en la base)
fila(191, { ...persona(), cedula: filas[4].cedula, caso: 'duplicada_archivo' });
fila(192, { ...persona(), cedula: '99000001', caso: 'duplicada_base' });
// 194–196: advertencias
fila(193, { ...persona(), telefono: '123', localidad: elegidos[0].localidad, puesto: elegidos[0].nombre, mesa: '1', caso: 'tel_invalido', puesto_id: elegidos[0].id });
fila(194, { ...persona(), sexo: 'X?', localidad: elegidos[1].localidad, puesto: elegidos[1].nombre, mesa: '2', caso: 'sexo_raro', puesto_id: elegidos[1].id });
fila(195, { ...persona(), localidad: elegidos[2].localidad, puesto: elegidos[2].nombre, mesa: '999', caso: 'mesa_inexistente', puesto_id: elegidos[2].id });
// 197–200: normales
for (let i = 196; i < 200; i++) { const p = elegidos[i - 190]; fila(i, { ...persona(), localidad: p.localidad, puesto: p.nombre, mesa: '3', caso: 'oficial', puesto_id: p.id }); }

const libro = new ExcelJS.Workbook();
const hoja = libro.addWorksheet('Registros');
hoja.addRow(['Cédula','Nombres','Apellidos','Sexo','Fecha de nacimiento','Edad','Teléfono','Barrio','Departamento','Localidad','Puesto','Dirección del puesto','Mesa','Cédula del líder']);
for (const f of filas) hoja.addRow([f.cedula, f.nombres, f.apellidos, f.sexo, f.nacimiento, f.edad, f.telefono, '', f.departamento ?? '', f.localidad ?? '', f.puesto ?? '', f.direccion ?? '', f.mesa ?? '', f.lider]);
await libro.xlsx.writeFile(salida);
await writeFile(salida.replace(/\.xlsx$/, '.json'), JSON.stringify(filas, null, 1));
const c = {}; for (const f of filas) c[f.caso] = (c[f.caso] ?? 0) + 1;
console.log(filas.length, 'filas', c);
console.log('puestos distintos (oficiales):', new Set(filas.filter((f) => f.caso === 'oficial').map((f) => f.puesto_id)).size);
console.log('por dirección:', porDireccion.map((p) => `${p.nombre} | ${p.direccion} -> ${variante(p.direccion)}`));
