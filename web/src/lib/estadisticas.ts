// Cálculos para gráficos a partir de listas ya filtradas por permisos.
import type { Demografia, PersonaFila, Sexo, Tendencia } from './tipos';
import { SEXOS } from './tipos';

export const ORDEN_EDAD = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

export function rangoEdad(edad: number | null): string {
  if (edad == null) return 'sin dato';
  if (edad < 25) return '18-24';
  if (edad < 35) return '25-34';
  if (edad < 45) return '35-44';
  if (edad < 55) return '45-54';
  if (edad < 65) return '55-64';
  return '65+';
}

export function contar<T>(xs: T[], clave: (x: T) => string, peso: (x: T) => number = () => 1): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(clave(x), (m.get(clave(x)) ?? 0) + peso(x));
  return m;
}

export const nombreSexo = (s: string | null) => (s ? SEXOS[s as Sexo] ?? 'Sin dato' : 'Sin dato');

/** Serie diaria continua (rellena los días sin registros con 0) */
export function serieDiaria(fechasISO: string[], dias: number): { etiqueta: string; valor: number }[] {
  const hoy = new Date();
  const conteo = contar(fechasISO, (f) => diaLocal(new Date(f)));
  const salida: { etiqueta: string; valor: number }[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i);
    salida.push({ etiqueta: etiquetaDia(d), valor: conteo.get(diaLocal(d)) ?? 0 });
  }
  return salida;
}
export function serieDesdeTendencia(t: Tendencia[], dias: number) {
  const m = new Map(t.map((x) => [x.dia.slice(0, 10), x.nuevos]));
  const hoy = new Date();
  const salida: { etiqueta: string; valor: number }[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i);
    salida.push({ etiqueta: etiquetaDia(d), valor: m.get(diaLocal(d)) ?? 0 });
  }
  return salida;
}
const diaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const etiquetaDia = (d: Date) => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '');

/** Resumen demográfico de la vista agregada (nunca personas sueltas) */
export function resumirDemografia(demo: Demografia[]) {
  const total = demo.reduce((a, d) => a + d.personas, 0);
  const sexo = contar(demo, (d) => nombreSexo(d.sexo), (d) => d.personas);
  const edad = contar(demo, (d) => d.rango_edad, (d) => d.personas);
  const localidad = contar(demo.filter((d) => d.localidad_id != null), (d) => d.localidad, (d) => d.personas);
  const sinLugar = demo.filter((d) => d.localidad_id == null).reduce((a, d) => a + d.personas, 0);
  const piramide = ORDEN_EDAD.map((r) => ({
    rango: r,
    mujeres: demo.filter((d) => d.rango_edad === r && d.sexo === 'femenino').reduce((a, d) => a + d.personas, 0),
    hombres: demo.filter((d) => d.rango_edad === r && d.sexo === 'masculino').reduce((a, d) => a + d.personas, 0),
  }));
  return { total, sexo, edad, localidad, sinLugar, piramide };
}

export function resumirPersonas(ps: PersonaFila[]) {
  return resumirDemografia(ps.map((p) => ({
    localidad_id: p.localidad ? 1 : null, localidad: p.localidad ?? 'Sin lugar', puesto_id: null, puesto: p.puesto,
    rango_edad: rangoEdad(p.edad), sexo: p.sexo ?? 'sin_dato', personas: 1,
  })));
}

export function partesSexo(sexo: Map<string, number>, colores: string[]) {
  const orden = ['Femenino', 'Masculino', 'Otro', 'Prefiere no decir', 'Sin dato'];
  return orden.filter((n) => (sexo.get(n) ?? 0) > 0).map((n, i) => ({ nombre: n, valor: sexo.get(n) ?? 0, color: colores[i] ?? 'var(--texto-3)' }));
}
