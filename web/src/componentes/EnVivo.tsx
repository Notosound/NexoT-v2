import { RefreshCw } from 'lucide-react';

/** Indicador "En vivo · actualizado a las 4:05 p. m." */
export default function EnVivo({ ultima, conectado, recargar }: { ultima: Date | null; conectado: boolean; recargar: () => void }) {
  return (
    <span className="en-vivo">
      <span className={`punto${conectado ? ' activo' : ''}`} aria-hidden />
      <span>{conectado ? 'En vivo' : 'Actualiza cada minuto'}{ultima && ` · ${ultima.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`}</span>
      <button type="button" className="que-es" onClick={recargar} title="Actualizar ahora" aria-label="Actualizar ahora"><RefreshCw style={{ width: 12, height: 12 }} /></button>
    </span>
  );
}
