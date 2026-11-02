import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Eye, KeyRound, QrCode, UserPlus } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import type { Lider } from '../lib/tipos';
import { formatoNumero, mensajeError, soloDigitos } from '../lib/utilidades';
import Invitar from '../componentes/Invitar';
import EnlaceRegistro from '../componentes/EnlaceRegistro';
import SelectorVerComo from '../componentes/VerComo';
import { Ventana } from '../componentes/Piezas';

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
  const [darAcceso, setDarAcceso] = useState<Lider | null>(null);
  const [enlaceDe, setEnlaceDe] = useState<Lider | null>(null);
  const [verComoDe, setVerComoDe] = useState<string | null>(null);
  const esAdmin = rol === 'admin';

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
        {!abierto && <button className="boton primario" onClick={() => setAbierto(true)}><UserPlus className="icono" aria-hidden />Nuevo líder</button>}
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
          <p className="ayuda">Después de crearlo, usa “Dar acceso” para enviarle por correo su usuario, o compártele su enlace y QR.</p>
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
            <thead><tr><th>Líder</th><th className="num">Registrados</th><th className="num">Meta</th><th>Avance</th>{esAdmin && <th>Coordinador</th>}<th>Acciones</th></tr></thead>
            <tbody>
              {lideres.map((l) => (
                <tr key={l.id}>
                  <td className="principal">{l.nombre}{(l.cedula || l.telefono) && <small>{[l.cedula && `C.C. ${l.cedula}`, l.telefono].filter(Boolean).join(' · ')}</small>}</td>
                  <td className="num" data-etiqueta="Registrados">{formatoNumero(l.registrados)}</td>
                  <td className="num" data-etiqueta="Meta">{l.meta_votos ? formatoNumero(l.meta_votos) : '—'}</td>
                  <td data-etiqueta="Avance">
                    {l.meta_votos ? (
                      <span className="cumplimiento" style={{ justifyContent: 'flex-start' }}>
                        <span className="pista"><span style={{ width: `${Math.min(100, (100 * l.registrados) / l.meta_votos)}%` }} /></span>
                        {Math.round((100 * l.registrados) / l.meta_votos)}%
                      </span>
                    ) : '—'}
                  </td>
                  {esAdmin && <td data-etiqueta="Coordinador">{(l.coordinador_id && coord.get(l.coordinador_id)) ?? '—'}</td>}
                  <td data-etiqueta="Acciones">
                    <div className="acciones">
                      <button className="boton chico" onClick={() => setEnlaceDe(l)}><QrCode className="icono" aria-hidden />Enlace y QR</button>
                      {esAdmin && !l.perfil_id && <button className="boton chico" onClick={() => setDarAcceso(l)}><KeyRound className="icono" aria-hidden />Dar acceso</button>}
                      {esAdmin && l.perfil_id && <button className="boton chico" onClick={() => setVerComoDe(l.perfil_id)}><Eye className="icono" aria-hidden />Ver como</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {darAcceso && (
        <Invitar lideres={lideres ?? []} inicial={{ nombre: darAcceso.nombre, rol: 'lider', liderId: darAcceso.id }}
          alCerrar={() => setDarAcceso(null)} alTerminar={(m) => { setDarAcceso(null); setMensaje(m); cargar(); }} />
      )}
      {enlaceDe && (
        <Ventana titulo={`Enlace de ${enlaceDe.nombre}`} icono={QrCode} alCerrar={() => setEnlaceDe(null)}>
          <EnlaceRegistro liderId={enlaceDe.id} nombre={enlaceDe.nombre} />
          <div className="acciones" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}><button className="boton" onClick={() => setEnlaceDe(null)}>Cerrar</button></div>
        </Ventana>
      )}
      {verComoDe && <SelectorVerComo soloPersona={verComoDe} alCerrar={() => setVerComoDe(null)} />}
    </>
  );
}
