import type { Api } from './tipos';

// En modo demo se carga la implementación en memoria; en el build normal,
// Vite reemplaza VITE_MODO y la demo ni siquiera se incluye.
export async function cargarApi(): Promise<Api> {
  if (import.meta.env.VITE_MODO === 'demo') return (await import('./demo')).api;
  return (await import('./real')).api;
}
