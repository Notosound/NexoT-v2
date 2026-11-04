// Registros sin señal: si no hay internet al registrar, la persona queda
// guardada en este celular y se envía sola cuando vuelve la conexión.
// Se guarda en el almacenamiento del navegador de este dispositivo; al
// cerrar sesión se avisa si quedan pendientes.
import type { Api, NuevaPersona } from './tipos';
import { mensajeError } from './utilidades';

const CLAVE = 'nexot-cola-registros';
export interface Pendiente { id: string; usuario: string; datos: NuevaPersona; nombre: string; capturado: string; error?: string }

const oyentes = new Set<(p: Pendiente[]) => void>();
function leer(): Pendiente[] {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]'); } catch { return []; }
}
function escribir(p: Pendiente[]) {
  try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
  oyentes.forEach((f) => f(p));
}

/** Pendientes de un usuario (en un celular compartido cada quien ve solo los suyos) */
export const pendientes = (usuario?: string) => leer().filter((p) => !usuario || p.usuario === usuario);
export function alCambiarCola(f: (p: Pendiente[]) => void) { oyentes.add(f); return () => { oyentes.delete(f); }; }

/** ¿El error es por falta de conexión (y no porque los datos estén mal)? */
export function esSinSenal(e: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET/i.test(String((e as Error)?.message ?? e));
}

export function guardarSinSenal(datos: NuevaPersona, usuario: string): Pendiente {
  const capturado = new Date().toISOString();
  const p: Pendiente = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, usuario, datos: { ...datos, capturadoEn: capturado },
    nombre: `${datos.nombres} ${datos.apellidos}`.trim(), capturado };
  escribir([...leer(), p]);
  return p;
}

export function descartar(id: string) { escribir(leer().filter((p) => p.id !== id)); }

let enviando = false;
/** Envía los pendientes. Para en el primer error de conexión; los que tienen
 *  datos con problemas (p. ej. cédula ya registrada) quedan marcados. */
export async function enviarPendientes(api: Api, usuario: string): Promise<{ enviados: number; conError: number }> {
  if (enviando) return { enviados: 0, conError: 0 };
  enviando = true;
  let enviados = 0;
  try {
    for (const p of pendientes(usuario)) {
      if (p.error) continue;
      try {
        await api.registrarPersona(p.datos);
        descartar(p.id);
        enviados++;
      } catch (e) {
        if (esSinSenal(e)) break;
        const mensaje = /duplicate|personas_cedula_uq|ya existe/i.test(String((e as Error)?.message)) ? 'Esa cédula ya estaba registrada' : mensajeError(e);
        escribir(leer().map((x) => (x.id === p.id ? { ...x, error: mensaje } : x)));
      }
    }
  } finally { enviando = false; }
  return { enviados, conError: pendientes(usuario).filter((p) => p.error).length };
}
