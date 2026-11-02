// Ventana para elegir con qué ojos ver el panel (solo admin)
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Shield, UsersRound } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { ROLES, type Lider, type OpcionVerComo, type Rol, type VistaComo } from '../lib/tipos';
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
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [buscar, setBuscar] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.opcionesVerComo().then(setOpciones).catch((e) => setError(mensajeError(e)));
    api.lideres().then(setLideres).catch(() => {});
  }, [api]);

  const elegir = async (v: VistaComo) => {
    try {
      await verComo(v);
      alCerrar();
      ir('/');
    } catch (e) { setError(mensajeError(e)); }
  };

  // Los líderes se ven por su ficha (tengan o no usuario); el resto, por persona
  const personas = (opciones ?? []).filter((o) => o.rol !== 'admin' && o.rol !== 'lider' && (!soloPersona || o.id === soloPersona));
  const t = buscar.trim().toLowerCase();
  const listaLideres = soloPersona ? [] : lideres.filter((l) => !t || l.nombre.toLowerCase().includes(t));
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
      {!soloPersona && (
        <>
          <h3 style={{ marginTop: '1rem' }}>Un líder</h3>
          {lideres.length > 6 && <input type="search" placeholder="Buscar líder" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar líder" />}
          <div className="lista-opciones" style={{ maxHeight: 280, overflowY: 'auto' }}>
            {listaLideres.map((l) => (
              <button key={l.id} onClick={() => elegir({ objetivo: `lider:${l.id}`, nombre: l.nombre, rol: 'lider' })}>
                <Iniciales nombre={l.nombre} />
                <span><strong>{l.nombre}</strong><small>{l.registrados} registrados{l.perfil_id ? '' : ' · aún sin usuario'}</small></span>
              </button>
            ))}
            {lideres.length === 0 && <p className="ayuda"><UsersRound className="icono" aria-hidden /> Aún no hay líderes.</p>}
          </div>
        </>
      )}
      {(personas.length > 0 || soloPersona) && <h3 style={{ marginTop: '1rem' }}>Otra persona del equipo</h3>}
      {opciones == null ? <p className="vacio">Cargando…</p> : personas.length === 0 ? null : (
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
