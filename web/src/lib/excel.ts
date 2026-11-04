// Generación de archivos Excel en el navegador (plantillas y exportes).
// La librería se descarga solo cuando se usa.
export type Celda = string | number | null | undefined;
export interface Hoja { nombre: string; filas: Celda[][]; anchos?: number[] }

export async function descargarExcel(archivo: string, hojas: Hoja[]) {
  const { default: escribir } = await import('write-excel-file');
  const datos = hojas.map((h) => h.filas.map((fila, i) => fila.map((v) => (v == null || v === ''
    ? null
    : {
        value: v,
        type: typeof v === 'number' ? Number : String,
        ...(i === 0 ? { fontWeight: 'bold' as const, backgroundColor: '#DDF3EF' } : {}),
      }))));
  const columnas = hojas.map((h) => (h.anchos ?? h.filas[0]?.map(() => 18) ?? []).map((width) => ({ width })));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opciones: any = { fileName: archivo, sheets: hojas.map((h) => h.nombre.slice(0, 31)), columns: columnas, stickyRowsCount: 1 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await escribir(datos as any, opciones);
}

export function fechaArchivo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Aviso que acompaña todo archivo con información de la campaña */
const AVISO: Hoja = {
  nombre: 'Aviso legal', anchos: [110],
  filas: [
    ['Información confidencial de la campaña'],
    ['Este archivo contiene datos personales protegidos por la Ley 1581 de 2012, incluido el dato sensible de la preferencia política.'],
    ['Úsalo solo para las tareas de la campaña. No lo compartas, no lo publiques y no lo envíes a personas fuera del equipo.'],
    ['Bórralo cuando ya no lo necesites. La descarga quedó registrada con tu usuario, la fecha y la cantidad de filas.'],
    ['El uso indebido de datos personales puede ser sancionado (Ley 1581 de 2012 y artículo 269F del Código Penal, Ley 1273 de 2009).'],
    [`Descargado el ${new Date().toLocaleString('es-CO')}`],
  ],
};

/** Igual que descargarExcel, con la hoja de aviso de confidencialidad al final */
export function descargarConfidencial(archivo: string, hojas: Hoja[]) {
  return descargarExcel(archivo, [...hojas, { ...AVISO, filas: [...AVISO.filas.slice(0, -1), [`Descargado el ${new Date().toLocaleString('es-CO')}`]] }]);
}
