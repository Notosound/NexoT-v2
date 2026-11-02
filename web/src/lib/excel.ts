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
