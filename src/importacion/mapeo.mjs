// Mapeo de columnas de Excel al formato canónico de importación.
//
// Lo usa el script de prueba en seco y lo usará el panel web: la misma
// lógica en ambos lados, para que no se contradigan.
//
// Solo se reconocen encabezados por coincidencia EXACTA (tras normalizar).
// El piloto usaba "contiene", y así "fecha" podía confundirse con
// "fecha de nacimiento". Lo no reconocido se reporta, no se adivina.

export const CAMPOS = {
  cedula:           { obligatorio: true,  alias: ['cedula', 'cc', 'documento', 'numero de documento', 'no documento', 'nro documento', 'identificacion', 'cedula de ciudadania'] },
  nombres:          { obligatorio: true,  alias: ['nombres', 'nombre', 'nombre completo', 'nombres y apellidos'] },
  apellidos:        { obligatorio: false, alias: ['apellidos', 'apellido'] },
  sexo:             { obligatorio: false, alias: ['sexo', 'genero'] },
  fecha_nacimiento: { obligatorio: false, alias: ['fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'f nacimiento'] },
  edad:             { obligatorio: false, alias: ['edad'] },
  telefono:         { obligatorio: false, alias: ['telefono', 'celular', 'tel', 'movil', 'whatsapp', 'numero de telefono', 'numero celular'] },
  barrio:           { obligatorio: false, alias: ['barrio'] },
  departamento:     { obligatorio: false, alias: ['departamento', 'depto'] },
  localidad:        { obligatorio: false, alias: ['localidad', 'comuna'] },
  puesto:           { obligatorio: false, alias: ['puesto', 'puesto de votacion', 'lugar de votacion'] },
  mesa:             { obligatorio: false, alias: ['mesa', 'numero de mesa', 'no mesa', 'nro mesa'] },
  lider_cedula:     { obligatorio: false, alias: ['cedula lider', 'cedula del lider', 'documento lider'] },
  fecha_registro:   { obligatorio: false, alias: ['fecha', 'fecha de registro', 'fecha registro'] },
};

// Columnas conocidas que se ignoran a propósito (no generan aviso)
const IGNORADAS = new Set(['estado', 'id', 'n', 'no', '#', 'item']);

export function normalizarEncabezado(texto) {
  return repararTexto(String(texto ?? ''))
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[._:\-/()#°º]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Repara texto con doble codificación (UTF-8 leído como Latin-1),
// p. ej. "BogotÃ¡" → "Bogotá". Solo actúa si el resultado es válido.
export function repararTexto(texto) {
  if (typeof texto !== 'string' || !/[ÃÂ]/.test(texto)) return texto;
  if ([...texto].some((c) => c.charCodeAt(0) > 0xff)) return texto;
  try {
    // Funciona igual en Node y en el navegador
    const bytes = Uint8Array.from(texto, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return texto;   // no era doble codificación
  }
}

/**
 * Decide qué columna del Excel corresponde a cada campo.
 * @param {string[]} encabezados  fila de encabezados tal cual
 * @returns {{ mapeo: Record<number,string>, faltan: string[], sinReconocer: string[], repetidos: string[] }}
 */
export function mapearEncabezados(encabezados) {
  const porAlias = new Map();
  for (const [campo, def] of Object.entries(CAMPOS)) for (const a of def.alias) porAlias.set(a, campo);

  const mapeo = {};
  const usados = new Map();
  const sinReconocer = [];
  const repetidos = [];

  encabezados.forEach((h, i) => {
    const n = normalizarEncabezado(h);
    if (!n) return;
    const campo = porAlias.get(n);
    if (!campo) {
      if (!IGNORADAS.has(n)) sinReconocer.push(String(h));
      return;
    }
    if (usados.has(campo)) { repetidos.push(`${campo}: "${encabezados[usados.get(campo)]}" y "${h}"`); return; }
    usados.set(campo, i);
    mapeo[i] = campo;
  });

  const faltan = Object.entries(CAMPOS).filter(([c, d]) => d.obligatorio && !usados.has(c)).map(([c]) => c);
  return { mapeo, faltan, sinReconocer, repetidos };
}

/** Convierte una fila (array de celdas) en el objeto canónico que espera la base. */
export function filaACanonica(celdas, mapeo) {
  const datos = {};
  for (const [i, campo] of Object.entries(mapeo)) {
    const v = valorCelda(celdas[i]);
    if (v !== '') datos[campo] = v;
  }
  return datos;
}

function valorCelda(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === 'object') {
    if ('text' in v) return valorCelda(v.text);               // celdas de texto enriquecido
    if ('result' in v) return valorCelda(v.result);           // celdas con fórmula
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    return '';
  }
  const s = repararTexto(String(v)).replace(/\s+/g, ' ').trim();
  return /^invalid date$/i.test(s) ? '' : s;
}

/** Fila vacía = todas las celdas mapeadas vacías */
export function filaVacia(datos) {
  return Object.keys(datos).length === 0;
}
