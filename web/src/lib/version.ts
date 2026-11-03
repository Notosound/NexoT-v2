// Cuando se publica una versión nueva, los archivos de la anterior dejan de
// existir. Una pestaña abierta desde antes falla al abrir una sección.
// Aquí se detecta y se recarga la página (una sola vez, para no entrar en ciclo).

const CLAVE = 'nexot-recarga';

export const esErrorDeVersion = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS/i
    .test(String((e as Error)?.message ?? e));

/** Recarga la página si no se recargó hace menos de 30 s. Devuelve si recargó. */
export function recargarPorVersion(): boolean {
  let antes = 0;
  try { antes = Number(sessionStorage.getItem(CLAVE) ?? 0); } catch { /* */ }
  if (Date.now() - antes < 30_000) return false;
  try { sessionStorage.setItem(CLAVE, String(Date.now())); } catch { /* */ }
  window.location.reload();
  return true;
}

/** Script principal con el que se cargó esta pestaña */
const actual = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src') ?? '';

/** ¿Hay una versión publicada distinta a la que tiene abierta esta pestaña? */
export async function hayVersionNueva(): Promise<boolean> {
  const mia = actual();
  if (!mia || import.meta.env.DEV) return false;
  try {
    const r = await fetch('/', { cache: 'no-store' });
    const html = await r.text();
    const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/) ?? html.match(/src="(\/assets\/index-[^"]+\.js)"/);
    return !!m && m[1] !== mia;
  } catch { return false; }
}
