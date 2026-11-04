// Vista del candidato: "simple" (solo Mi campaña y el mapa) o "avanzada"
// (además análisis, metas, eventos, Día D y resultados E14). Es una
// preferencia de este navegador; si no se puede guardar, dura la sesión.
import { useEffect, useState } from 'react';

const CLAVE = 'candidato-vista';
const EVENTO = 'nexot-vista-candidato';
let enMemoria: boolean | null = null;

function leer(): boolean {
  if (enMemoria != null) return enMemoria;
  try { return localStorage.getItem(CLAVE) === 'avanzada'; } catch { return false; }
}

export function cambiarVistaAvanzada(avanzada: boolean) {
  enMemoria = avanzada;
  try { localStorage.setItem(CLAVE, avanzada ? 'avanzada' : 'simple'); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(EVENTO));
}

export function useVistaAvanzada(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(leer);
  useEffect(() => {
    const f = () => setV(leer());
    window.addEventListener(EVENTO, f);
    return () => window.removeEventListener(EVENTO, f);
  }, []);
  return [v, cambiarVistaAvanzada];
}
