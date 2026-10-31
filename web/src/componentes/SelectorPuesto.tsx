import { useEffect, useMemo, useState } from 'react';
import { useSesion } from '../lib/sesion';
import type { Puesto } from '../lib/tipos';
import { normalizar } from '../lib/utilidades';

interface Props {
  localidadId: number;
  elegido: Puesto | null;
  onElegir: (p: Puesto | null) => void;
  onOtro?: () => void;          // si se pasa, aparece la opción "No aparece en la lista"
  etiqueta?: string;
}

/** Lista buscable de puestos oficiales de una localidad (por nombre o dirección). */
export default function SelectorPuesto({ localidadId, elegido, onElegir, onOtro, etiqueta = 'Puesto de votación' }: Props) {
  const { api } = useSesion();
  const [puestos, setPuestos] = useState<Puesto[] | null>(null);
  const [texto, setTexto] = useState('');

  useEffect(() => {
    setPuestos(null);
    api.puestos(localidadId).then(setPuestos).catch(() => setPuestos([]));
  }, [api, localidadId]);

  const filtrados = useMemo(() => {
    if (!puestos) return [];
    const t = normalizar(texto);
    if (!t) return puestos;
    return puestos.filter((p) => normalizar(p.nombre).includes(t) || normalizar(p.direccion ?? '').includes(t));
  }, [puestos, texto]);

  if (elegido) {
    return (
      <div className="campo">
        <span>{etiqueta}</span>
        <div className="elegido">
          <div><strong>{elegido.nombre}</strong><small>{elegido.direccion} · {elegido.mesas_total} mesas</small></div>
          <button type="button" className="boton chico" onClick={() => onElegir(null)}>Cambiar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="campo">
      <span id={`etq-puesto-${localidadId}`}>{etiqueta}</span>
      <div className="buscador-lista">
        <input
          type="search" placeholder="Busca por nombre o dirección…" value={texto}
          onChange={(e) => setTexto(e.target.value)} aria-labelledby={`etq-puesto-${localidadId}`}
        />
        <ul role="listbox" aria-labelledby={`etq-puesto-${localidadId}`}>
          {puestos === null && <li className="vacio">Cargando puestos…</li>}
          {filtrados.slice(0, 80).map((p) => (
            <li key={p.id}>
              <button type="button" role="option" aria-selected={false} onClick={() => onElegir(p)}>
                {p.nombre}<small>{p.direccion}</small>
              </button>
            </li>
          ))}
          {puestos && filtrados.length > 80 && <li className="vacio">Escribe para ver más ({filtrados.length - 80} más)…</li>}
          {puestos && filtrados.length === 0 && <li className="vacio">Ningún puesto coincide con “{texto}”.</li>}
          {onOtro && (
            <li className="otro">
              <button type="button" onClick={onOtro}>No aparece en la lista (Otro)…</button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
