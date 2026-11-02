// Ventana para elegir con qué ojos ver el panel (solo admin)
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Shield } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { ROLES, type OpcionVerComo, type Rol, type VistaComo } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';
import { Iniciales, Ventana } from './Piezas';

const DESCRIPCION: Record<Rol, string> = {
  admin: '',
  coordinador: 'Ve a sus líderes y las personas de ellos',
  lider: 'Registra personas y ve solo las suyas',
  candidato: 'Ve el tablero, el análisis y los resultados, sin datos personales',
  digitador: 'Solo digita E14; no ve personas ni cuántos votos se esperan',
};

export default function SelectorVerComo({ alCerrar, soloPersona }: { alCerrar: () => void; soloPersona?: string }) {
  const { api, verComo } = useSesion();
  const ir = useNavigate();
  const [opciones, setOpciones] = useState<OpcionVerComo[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { api.opcionesVerComo().then(setOpciones).catch((e) => setError(mensajeError(e))); }, [api]);

  const elegir = async (v: VistaComo) => {
    try {
      await verComo(v);
      alCerrar();
      ir('/');
    } catch (e) { setError(mensajeError(e)); }
  };

  const personas = (opciones ?? []).filter((o) => o.rol !== 'admin' && (!soloPersona || o.id === soloPersona));
  return (
    <Ventana titulo="Ver como" icono={Eye} alCerrar={alCerrar}>
      <p className="subtitulo">Mira el panel exactamente como lo ve otra persona, con sus datos reales. Es <strong>solo lectura</strong>: no se puede cambiar nada mientras estés ahí, y queda registrado en la auditoría.</p>
      {error && <div className="aviso error">{error}</div>}
      {!soloPersona && (
        <>
          <h3 style={{ marginTop: '1rem' }}>Por rol</h3>
          <div className="lista-opciones">
            {(['candidato', 'digitador'] as Rol[]).map((r) => (
              <button key={r} onClick={() => elegir({ objetivo: `rol:${r}`, nombre: `cualquier ${ROLES[r].toLowerCase()}`, rol: r })}>
                <span className="avatar"><Shield className="icono" aria-hidden /></span>
                <span><strong>{ROLES[r]}</strong><small>{DESCRIPCION[r]}</small></span>
              </button>
            ))}
          </div>
        </>
      )}
      <h3 style={{ marginTop: '1rem' }}>Una persona concreta</h3>
      {opciones == null ? <p className="vacio">Cargando…</p> : personas.length === 0 ? (
        <p className="ayuda">Aún no hay más personas en el equipo. Invítalas desde <strong>Equipo</strong>.</p>
      ) : (
        <div className="lista-opciones">
          {personas.map((o) => (
            <button key={o.id} onClick={() => elegir({ objetivo: o.id, nombre: o.nombre, rol: o.rol })}>
              <Iniciales nombre={o.nombre} />
              <span><strong>{o.nombre}</strong><small>{ROLES[o.rol]} · {DESCRIPCION[o.rol]}</small></span>
            </button>
          ))}
        </div>
      )}
      <div className="acciones" style={{ justifyContent: 'flex-end' }}>
        <button className="boton" onClick={alCerrar}>Cancelar</button>
      </div>
    </Ventana>
  );
}
