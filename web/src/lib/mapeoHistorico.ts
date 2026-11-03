// Columnas de un Excel de resultados históricos (Registraduría o propio).
// Se aceptan filas por puesto o por mesa; antes de enviar se suman por
// puesto en el navegador, para mandar pocas filas aunque el archivo traiga
// las 18.000 mesas de Bogotá.
import { normalizarEncabezado, filaACanonica } from '@compartido/importacion/mapeo.mjs';
import { codigoOficial } from './mapeoE14';

export const CAMPOS_HISTORICO: Record<string, string[]> = {
  localidad: ['localidad', 'comuna'],
  zona: ['zona', 'zz', 'codigo zona', 'cod zona', 'codigo de zona'],
  codigo_puesto: ['codigo puesto', 'codigo de puesto', 'cod puesto', 'pp', 'codigo del puesto'],
  puesto: ['puesto', 'puesto de votacion', 'nombre puesto', 'nombre del puesto', 'lugar de votacion'],
  mesa: ['mesa', 'numero de mesa', 'no mesa', 'nro mesa', 'num mesa'],
  votos: ['votos', 'votos candidato', 'votos del candidato', 'votos partido', 'votos del partido', 'votos nuestros'],
  validos: ['votos validos', 'validos', 'total validos', 'total votos validos', 'votos totales', 'total votos'],
};

export function mapearHistorico(encabezados: unknown[]) {
  const porAlias = new Map<string, string>();
  for (const [campo, alias] of Object.entries(CAMPOS_HISTORICO)) for (const a of alias) porAlias.set(a, campo);
  const mapeo: Record<number, string> = {};
  const usados = new Set<string>();
  encabezados.forEach((h, i) => {
    const campo = porAlias.get(normalizarEncabezado(h));
    if (campo && !usados.has(campo)) { usados.add(campo); mapeo[i] = campo; }
  });
  const faltan: string[] = [];
  if (!usados.has('votos')) faltan.push('Votos');
  if (!(usados.has('zona') && usados.has('codigo_puesto')) && !(usados.has('localidad') && usados.has('puesto'))) {
    faltan.push('Localidad y Puesto (o Zona y Código de puesto)');
  }
  return { mapeo, faltan, conValidos: usados.has('validos'), porMesa: usados.has('mesa') };
}

const numero = (t?: string) => Number(String(t ?? '').replace(/[\s.,]/g, ''));

/** Suma las filas por puesto. Devuelve las filas a enviar y los repetidos detectados. */
export function sumarPorPuesto(celdas: unknown[][], mapeo: Record<number, string>, primeraFila: number) {
  const grupos = new Map<string, Record<string, string>>();
  const mesasVistas = new Map<string, number>();
  const repetidas: { fila: number; mensaje: string }[] = [];
  celdas.forEach((c, i) => {
    const fila = primeraFila + i;
    const d = filaACanonica(c, mapeo) as Record<string, string>;
    if (!String(d.votos ?? '').trim()) return;
    const zona = codigoOficial(d.zona), cod = codigoOficial(d.codigo_puesto);
    const clave = zona && cod ? `c|${zona}|${cod}` : `n|${normalizarEncabezado(d.localidad ?? '')}|${normalizarEncabezado(d.puesto ?? '')}`;
    const mesa = String(d.mesa ?? '').replace(/\D/g, '');
    const claveMesa = `${clave}|${mesa || '*'}`;
    if (mesasVistas.has(claveMesa)) { repetidas.push({ fila, mensaje: `fila repetida (igual a la fila ${mesasVistas.get(claveMesa)})` }); return; }
    mesasVistas.set(claveMesa, fila);
    const g = grupos.get(clave);
    if (!g) { grupos.set(clave, { ...d, fila: String(fila), mesa: '' }); return; }
    if (!Number.isFinite(numero(d.votos)) || !Number.isFinite(numero(g.votos))) { repetidas.push({ fila, mensaje: `votos inválidos: "${d.votos}"` }); return; }
    g.votos = String(numero(g.votos) + numero(d.votos));
    g.validos = String(d.validos ?? '').trim() && String(g.validos ?? '').trim() ? String(numero(g.validos) + numero(d.validos)) : '';
  });
  return { filas: [...grupos.values()], repetidas };
}
