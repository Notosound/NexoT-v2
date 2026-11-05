// Plantilla oficial de registros con listas desplegables: se elige la
// localidad y la columna Puesto muestra solo los puestos de esa localidad
// (igual que el formulario de registro). Se arma con ExcelJS, que se carga
// solo al descargar la plantilla.
import type { PuestoCodigos } from './tipos';
import { PLANTILLA_REGISTROS } from './tipos';

export const ENCABEZADOS_ADMIN = ['Cédula', 'Nombres', 'Apellidos', 'Sexo', 'Fecha de nacimiento', 'Edad', 'Teléfono', 'Barrio', 'Localidad', 'Puesto', 'Dirección del puesto', 'Mesa', 'Cédula del líder'];
export const ENCABEZADOS_LIDER = ENCABEZADOS_ADMIN.slice(0, -1);
const FILAS = 3000; // filas con listas desplegables

const col = (n: number) => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

export async function descargarPlantillaRegistros(opc: {
  archivo: string; esLider: boolean; puestos: PuestoCodigos[]; instrucciones: string[][];
}) {
  const { default: ExcelJS } = await import('exceljs');
  const libro = new ExcelJS.Workbook();
  libro.creator = 'NexoT';
  const encabezados = opc.esLider ? ENCABEZADOS_LIDER : ENCABEZADOS_ADMIN;
  const iLoc = encabezados.indexOf('Localidad'), iPue = encabezados.indexOf('Puesto'), iMesa = encabezados.indexOf('Mesa'), iSexo = encabezados.indexOf('Sexo');

  // Localidades y sus puestos (orden alfabético)
  const porLocalidad = new Map<string, PuestoCodigos[]>();
  for (const p of opc.puestos) porLocalidad.set(p.localidad, [...(porLocalidad.get(p.localidad) ?? []), p]);
  const localidades = [...porLocalidad.keys()].sort((a, b) => a.localeCompare(b, 'es'));
  for (const l of localidades) porLocalidad.get(l)!.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  // ── Registros ──────────────────────────────────────────────────────
  const hoja = libro.addWorksheet('Registros', { views: [{ state: 'frozen', ySplit: 1 }] });
  const ins = libro.addWorksheet('Instrucciones');
  const of = libro.addWorksheet('Puestos oficiales', { views: [{ state: 'frozen', ySplit: 1 }] });
  const control = libro.addWorksheet('Control');
  const listas = libro.addWorksheet('Listas', { state: 'hidden' });
  hoja.columns = encabezados.map((h, i) => ({ header: h, key: String(i), width: [14, 18, 20, 12, 18, 7, 13, 16, 20, 44, 26, 7, 16][i] }));
  hoja.getRow(1).eachCell((c) => {
    c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDF3EF' } };
  });
  const usaquen = porLocalidad.get('Usaquén')?.[0]?.nombre ?? '';
  const ejemplo = ['1020304050', 'Ejemplo', 'Borrar Esta Fila', 'Femenino', '21/05/1990', '', '3001234567', 'Cedritos', 'Usaquén', usaquen, '', 3, ''];
  hoja.addRow(ejemplo.slice(0, encabezados.length));
  for (const c of [0, 6, encabezados.indexOf('Cédula del líder')].filter((x) => x >= 0)) hoja.getColumn(c + 1).numFmt = '@';

  // ── Listas (oculta): localidades y los puestos de cada una ─────────
  listas.getCell('A1').value = 'Localidad'; listas.getCell('B1').value = 'Nombre de la lista';
  localidades.forEach((l, i) => {
    const nombreLista = `PUESTOS_${String(i + 1).padStart(2, '0')}`;
    listas.getCell(`A${i + 2}`).value = l;
    listas.getCell(`B${i + 2}`).value = nombreLista;
    const c = col(i + 2);
    const ps = porLocalidad.get(l)!;
    listas.getCell(`${c}1`).value = l;
    ps.forEach((p, j) => { listas.getCell(`${c}${j + 2}`).value = p.nombre; });
    libro.definedNames.add(`Listas!$${c}$2:$${c}$${ps.length + 1}`, nombreLista);
  });
  libro.definedNames.add(`Listas!$A$2:$A$${localidades.length + 1}`, 'LOCALIDADES');
  const tabla = `Listas!$A$2:$B$${localidades.length + 1}`;

  // ── Listas desplegables en cada fila ───────────────────────────────
  const L = col(iLoc);
  const vLoc = {
    type: 'list' as const, allowBlank: true, formulae: ['LOCALIDADES'],
    showErrorMessage: true, errorStyle: 'stop' as const, errorTitle: 'Localidad',
    error: 'Elige la localidad de la lista.',
    showInputMessage: true, promptTitle: 'Localidad', prompt: 'Elige la localidad donde vota la persona.',
  };
  const vPue = {
    type: 'list' as const, allowBlank: true, formulae: [`INDIRECT(VLOOKUP($${L}2,${tabla},2,FALSE))`],
    showErrorMessage: true, errorStyle: 'warning' as const, errorTitle: 'Puesto que no está en la lista',
    error: 'Ese puesto no está en la lista oficial de esa localidad. Si de verdad la persona vota ahí, déjalo como le aparece en la Registraduría y escribe la Dirección del puesto.',
    showInputMessage: true, promptTitle: 'Puesto', prompt: 'Primero elige la Localidad: aquí salen solo sus puestos oficiales.',
  };
  const vSexo = { type: 'list' as const, allowBlank: true, formulae: ['"Femenino,Masculino,Otro,No informa"'], showErrorMessage: true, errorStyle: 'warning' as const, error: 'Usa Femenino, Masculino, Otro o No informa.' };
  const vMesa = { type: 'whole' as const, operator: 'between' as const, allowBlank: true, formulae: [1, 400], showErrorMessage: true, errorStyle: 'warning' as const, error: 'La mesa es un número (1, 2, 3…).' };
  // Una validación por rango (no por celda): la fórmula del puesto es relativa a la fila 2
  const rango = (i: number) => `${col(i)}2:${col(i)}${FILAS + 1}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv = (hoja as any).dataValidations as { add: (rango: string, v: unknown) => void };
  dv.add(rango(iLoc), vLoc);
  dv.add(rango(iPue), vPue);
  dv.add(rango(iSexo), vSexo);
  dv.add(rango(iMesa), vMesa);

  // ── Instrucciones, puestos oficiales y control ─────────────────────
  ins.getColumn(1).width = 120;
  opc.instrucciones.forEach((f, i) => { ins.getCell(`A${i + 1}`).value = f[0]; if (i === 0) ins.getCell('A1').font = { bold: true, size: 13 }; });

  of.columns = [{ header: 'Localidad', width: 20 }, { header: 'Puesto', width: 44 }, { header: 'Dirección', width: 44 }, { header: 'Mesas', width: 8 }];
  of.getRow(1).font = { bold: true };
  for (const l of localidades) for (const p of porLocalidad.get(l)!) of.addRow([l, p.nombre, p.direccion ?? '', p.mesas_total]);
  of.autoFilter = 'A1:D1';

  control.getCell('A1').value = PLANTILLA_REGISTROS;
  control.getCell('A2').value = 'Plantilla oficial de registros de NexoT. No borres ni cambies esta hoja.';
  control.getColumn(1).width = 90;

  const datos = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = opc.archivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
