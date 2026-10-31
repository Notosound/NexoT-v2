import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSesion } from '../lib/sesion';
import type { Lider } from '../lib/tipos';
import { formatoNumero, mensajeError, soloDigitos } from '../lib/utilidades';

export default function Lideres() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const [lideres, setLideres] = useState<Lider[] | null>(null);
  const [coordinadores, setCoordinadores] = useState<{ id: string; nombre: string }[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const [meta, setMeta] = useState('');
  const [coordinadorId, setCoordinadorId] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const cargar = useCallback(() => {
    api.lideres().then(setLideres).catch((e) => setError(mensajeError(e)));
  }, [api]);

  useEffect(() => {
    cargar();
    if (rol === 'admin') api.coordinadores().then(setCoordinadores).catch(() => {});
  }, [api, cargar, rol]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(''); setMensaje('');
    const ced = soloDigitos(cedula);
    const tel = soloDigitos(telefono);
    if (!nombre.trim()) { setError('Escribe el nombre del líder.'); return; }
    if (cedula && !/^\d{3,10}$/.test(ced)) { setError('Cédula inválida.'); return; }
    if (telefono && !/^\d{7,10}$/.test(tel)) { setError('Teléfono inválido.'); return; }
    try {
      await api.crearLider({ nombre, cedula: ced || null, telefono: tel || null, meta: Number(meta) || 0, coordinadorId: coordinadorId || null });
      setMensaje(`${nombre.trim()} quedó creado.`);
      setNombre(''); setCedula(''); setTelefono(''); setMeta(''); setCoordinadorId(''); setAbierto(false);
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  const coord = new Map(coordinadores.map((c) => [c.id, c.nombre]));

  return (
    <>
      <div className="encabezado">
        <div><h1>Líderes</h1><p>{lideres ? `${lideres.length} ${rol === 'coordinador' ? 'a tu cargo' : 'activos'}` : 'Cargando…'}</p></div>
        {!abierto && <button className="boton primario" onClick={() => setAbierto(true)}>Nuevo líder</button>}
      </div>
      {mensaje && <div className="aviso ok" role="status" style={{ marginBottom: '1rem' }}>{mensaje}</div>}
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      {abierto && (
        <form className="tarjeta formulario" onSubmit={crear} style={{ marginBottom: '1rem' }}>
          <h2>Nuevo líder</h2>
          <div className="fila-campos">
            <label className="campo"><span>Nombre</span><input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required /></label>
            <label className="campo"><span>Cédula <span className="opcional">(opcional)</span></span><input type="text" inputMode="numeric" value={cedula} onChange={(e) => setCedula(e.target.value)} />
              <small>Sirve para asignarle personas al importar Excel.</small></label>
          </div>
          <div className="fila-campos">
            <label className="campo"><span>Teléfono <span className="opcional">(opcional)</span></span><input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></label>
            <label className="campo"><span>Meta de personas</span><input type="number" min={0} inputMode="numeric" value={meta} onChange={(e) => setMeta(e.target.value)} /></label>
            {rol === 'admin' && (
              <label className="campo"><span>Coordinador <span className="opcional">(opcional)</span></span>
                <select value={coordinadorId} onChange={(e) => setCoordinadorId(e.target.value)}>
                  <option value="">Sin coordinador</option>
                  {coordinadores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </label>
            )}
          </div>
          <p className="ayuda">Para que el líder entre al sistema con su propio usuario, vincúlalo después en “Equipo”.</p>
          <div className="acciones">
            <button className="boton primario">Crear líder</button>
            <button type="button" className="boton" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {lideres && lideres.length === 0 && <div className="tarjeta vacio">Todavía no hay líderes.</div>}
      {lideres && lideres.length > 0 && (
        <div className="envoltura-tabla">
          <table className="tabla apilable">
            <thead><tr><th>Líder</th><th className="num">Registrados</th><th className="num">Meta</th><th className="num">Avance</th>{rol === 'admin' && <th>Coordinador</th>}<th>Usuario</th></tr></thead>
            <tbody>
              {lideres.map((l) => (
                <tr key={l.id}>
                  <td className="principal">{l.nombre}{(l.cedula || l.telefono) && <small>{[l.cedula && `C.C. ${l.cedula}`, l.telefono].filter(Boolean).join(' · ')}</small>}</td>
                  <td className="num" data-etiqueta="Registrados">{formatoNumero(l.registrados)}</td>
                  <td className="num" data-etiqueta="Meta">{l.meta_votos ? formatoNumero(l.meta_votos) : '—'}</td>
                  <td className="num" data-etiqueta="Avance">{l.meta_votos ? `${Math.round((100 * l.registrados) / l.meta_votos)}%` : '—'}</td>
                  {rol === 'admin' && <td data-etiqueta="Coordinador">{(l.coordinador_id && coord.get(l.coordinador_id)) ?? '—'}</td>}
                  <td data-etiqueta="Usuario">{l.perfil_id ? <span className="insignia completa">Con acceso</span> : <span className="insignia sin_dato">Sin usuario</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
