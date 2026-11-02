// Reconocimiento de columnas de un Excel de resultados E14.
// Mismo criterio que el de registros: coincidencia exacta, sin adivinar.
import { normalizarEncabezado, filaACanonica } from '@compartido/importacion/mapeo.mjs';

export const CAMPOS_E14: Record<string, string[]> = {
  localidad: ['localidad', 'comuna'],
  zona: ['zona', 'zz', 'codigo zona', 'cod zona', 'codigo de zona'],
  codigo_puesto: ['codigo puesto', 'codigo de puesto', 'cod puesto', 'pp', 'codigo del puesto'],
  puesto: ['puesto', 'puesto de votacion', 'nombre puesto', 'nombre del puesto', 'lugar de votacion'],
  mesa: ['mesa', 'numero de mesa', 'no mesa', 'nro mesa', 'num mesa'],
  votos: ['votos', 'votos e14', 'votos candidato', 'votos del candidato', 'total votos', 'votos del e14'],
  observacion: ['observacion', 'observaciones', 'nota', 'notas'],
};

export interface MapeoE14 { mapeo: Record<number, string>; faltan: string[]; sinReconocer: string[] }

export function mapearE14(encabezados: unknown[]): MapeoE14 {
  const porAlias = new Map<string, string>();
  for (const [campo, alias] of Object.entries(CAMPOS_E14)) for (const a of alias) porAlias.set(a, campo);
  const mapeo: Record<number, string> = {};
  const usados = new Set<string>();
  const sinReconocer: string[] = [];
  encabezados.forEach((h, i) => {
    const n = normalizarEncabezado(h);
    if (!n) return;
    const campo = porAlias.get(n);
    if (!campo) { sinReconocer.push(String(h)); return; }
    if (usados.has(campo)) return;
    usados.add(campo); mapeo[i] = campo;
  });
  const faltan: string[] = [];
  if (!usados.has('mesa')) faltan.push('Mesa');
  if (!usados.has('votos')) faltan.push('Votos E14');
  const porCodigos = usados.has('zona') && usados.has('codigo_puesto');
  const porNombre = usados.has('localidad') && usados.has('puesto');
  if (!porCodigos && !porNombre) faltan.push('Localidad y Puesto (o Zona y Código de puesto)');
  return { mapeo, faltan, sinReconocer };
}

export function filaE14(celdas: unknown[], mapeo: Record<number, string>): Record<string, string> {
  return filaACanonica(celdas, mapeo) as Record<string, string>;
}

/** Código oficial de zona o puesto, sin perder letras: "4" → "04", " b4 " → "B4".
 *  Mismo criterio que app.codigo_oficial en la base. */
export function codigoOficial(t?: string): string | null {
  const v = String(t ?? '').replace(/\s/g, '').toUpperCase();
  if (!v) return null;
  if (/^[0-9]{1,3}$/.test(v)) return String(Number(v)).padStart(2, '0');
  return /^[A-Z0-9]+$/.test(v) ? v : null;
}

/** Clave para detectar mesas repetidas dentro del mismo archivo */
export function claveMesa(d: Record<string, string>): string {
  const n = (t?: string) => normalizarEncabezado(t ?? '');
  const mesa = (d.mesa ?? '').replace(/\D/g, '');
  const zona = codigoOficial(d.zona), cod = codigoOficial(d.codigo_puesto);
  return zona && cod
    ? `c|${zona}|${cod}|${Number(mesa)}`
    : `n|${n(d.localidad)}|${n(d.puesto)}|${Number(mesa)}`;
}
