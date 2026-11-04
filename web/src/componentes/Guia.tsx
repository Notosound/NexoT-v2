// Franja "Para qué sirve" arriba de cada página. Se puede cerrar; el botón
// "Ayuda" de la barra la vuelve a mostrar.
import { useEffect, useState } from 'react';
import { ChevronDown, Lightbulb, X } from 'lucide-react';
import { guiaDe } from '../lib/guias';
import type { Rol } from '../lib/tipos';

const CLAVE = 'guias-cerradas';
const leer = (): string[] => { try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]'); } catch { return []; } };
const guardar = (v: string[]) => { try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch { /* */ } };
export const EVENTO_AYUDA = 'nexot-ayuda';

export default function Guia({ ruta, rol }: { ruta: string; rol: Rol }) {
  const guia = guiaDe(ruta, rol);
  const clave = `${rol}:${ruta}`;
  const [cerrada, setCerrada] = useState(() => leer().includes(clave));
  const [pasos, setPasos] = useState(false);
  useEffect(() => { setCerrada(leer().includes(clave)); setPasos(false); }, [clave]);
  useEffect(() => {
    const abrir = () => { setCerrada(false); setPasos(true); guardar(leer().filter((x) => x !== clave)); };
    window.addEventListener(EVENTO_AYUDA, abrir);
    return () => window.removeEventListener(EVENTO_AYUDA, abrir);
  }, [clave]);
  if (!guia || cerrada) return null;
  return (
    <div className="guia" role="note">
      <Lightbulb className="guia-ic" aria-hidden />
      <div className="guia-texto">
        <p><strong>Para qué sirve:</strong> {guia.para}</p>
        {pasos && <ol>{guia.pasos.map((p) => <li key={p}>{p}</li>)}</ol>}
        <button type="button" className="guia-mas" aria-expanded={pasos} onClick={() => setPasos(!pasos)}>
          {pasos ? 'Ocultar pasos' : 'Cómo se usa'} <ChevronDown aria-hidden className={pasos ? 'girada' : ''} />
        </button>
      </div>
      <button type="button" className="guia-cerrar" aria-label="Cerrar la guía de esta página" title="Ya entendí (la puedes abrir con Ayuda)"
        onClick={() => { setCerrada(true); guardar([...new Set([...leer(), clave])]); }}><X aria-hidden /></button>
    </div>
  );
}
