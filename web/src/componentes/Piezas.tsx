// Piezas visuales reutilizables: cifras con ícono, explicaciones y ventanas
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { formatoNumero } from '../lib/utilidades';

export function Cifra({ icono: Icono, valor, etiqueta, detalle, tono, a }: {
  icono: LucideIcon; valor: number | string | null | undefined; etiqueta: string; detalle?: ReactNode;
  tono?: 'ok' | 'aviso' | 'info'; a?: string;
}) {
  const contenido = (
    <>
      <span className="ic"><Icono aria-hidden /></span>
      <span className="valor">{valor == null ? '…' : typeof valor === 'number' ? formatoNumero(valor) : valor}</span>
      <span className="etiqueta">{etiqueta}</span>
      {detalle && <span className="detalle">{detalle}</span>}
    </>
  );
  const clase = `cifra-tarjeta${tono ? ` tono-${tono}` : ''}`;
  return a ? <Link to={a} className={clase}>{contenido}</Link> : <div className={clase}>{contenido}</div>;
}

/** Botón "?" que muestra una explicación en palabras sencillas */
export function QueEs({ children, titulo = '¿Qué significa?' }: { children: ReactNode; titulo?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="que-es" aria-expanded={abierto} aria-label={titulo} title={titulo} onClick={() => setAbierto(!abierto)}>?</button>
      {abierto && <div className="explicacion" role="note">{children}</div>}
    </>
  );
}

export function Ventana({ titulo, icono: Icono, alCerrar, children }: { titulo: string; icono?: LucideIcon; alCerrar: () => void; children: ReactNode }) {
  return (
    <div className="velo" onClick={alCerrar} role="presentation">
      <div className="ventana" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') alCerrar(); }}>
        <h2>{Icono && <Icono aria-hidden className="icono" />}{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function Iniciales({ nombre }: { nombre: string }) {
  const ini = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return <span className="avatar" aria-hidden>{ini || '·'}</span>;
}

export const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);
export { formatoNumero };

/** Sección que se abre y se cierra (para listas y tablas largas) */
export function Plegable({ titulo, cuenta, abierto = false, children, acciones }: {
  titulo: ReactNode; cuenta?: ReactNode; abierto?: boolean; children: ReactNode; acciones?: ReactNode;
}) {
  return (
    <details className="tarjeta plegable" open={abierto}>
      <summary>
        <span>{titulo}</span>
        {cuenta != null && <span className="cuenta">{cuenta}</span>}
        <ChevronDown className="flecha" aria-hidden />
      </summary>
      <div className="contenido-plegable">
        {acciones && <div className="acciones" style={{ justifyContent: 'flex-end', marginBottom: '0.75rem' }}>{acciones}</div>}
        {children}
      </div>
    </details>
  );
}
