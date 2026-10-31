import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion';
import { ESTADOS_UBICACION, SEXOS, type EstadoUbicacion, type PersonaFila } from '../lib/tipos';
import { formatoNumero, mensajeError, nombreCompleto } from '../lib/utilidades';

export default function Personas() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<EstadoUbicacion | ''>('');
  const [filas, setFilas] = useState<PersonaFila[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async (desde: number) => {
    setCargando(true); setError('');
    try {
      const r = await api.personas({ texto, estado, desde });
      setFilas((prev) => (desde === 0 ? r.filas : [...prev, ...r.filas]));
      setTotal(r.total);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  }, [api, texto, estado]);

  useEffect(() => {
    const t = setTimeout(() => cargar(0), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  async function eliminar(p: PersonaFila) {
    if (!confirm(`¿Eliminar a ${nombreCompleto(p)} (${p.cedula})? Queda registro en la auditoría.`)) return;
    try {
      await api.eliminarPersona(p.id);
      setFilas((f) => f.filter((x) => x.id !== p.id));
      setTotal((t) => t - 1);
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  return (
    <>
      <div className="encabezado">
        <div><h1>{rol === 'lider' ? 'Mis registrados' : 'Personas'}</h1><p>{formatoNumero(total)} en total</p></div>
        <Link to="/registrar" className="boton primario">Registrar persona</Link>
      </div>
      <div className="filtros">
        <input type="search" placeholder="Buscar por nombre o cédula" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar" />
        <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoUbicacion | '')} aria-label="Lugar de votación">
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADOS_UBICACION) as EstadoUbicacion[]).map((k) => <option key={k} value={k}>{ESTADOS_UBICACION[k]}</option>)}
        </select>
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="envoltura-tabla">
        <table className="tabla apilable">
          <thead>
            <tr>
              <th>Persona</th><th>Cédula</th><th>Sexo / edad</th>
              {rol !== 'lider' && <th>Líder</th>}
              <th>Lugar de votación</th><th>Estado</th><th><span className="oculto-visual">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.id}>
                <td className="principal">{nombreCompleto(p)}{p.telefono && <small>{p.telefono}</small>}</td>
                <td data-etiqueta="Cédula">{p.cedula}</td>
                <td data-etiqueta="Sexo / edad">{p.sexo ? SEXOS[p.sexo] : '—'}{p.edad != null && ` · ${p.edad}`}</td>
                {rol !== 'lider' && <td data-etiqueta="Líder">{p.lider ?? '—'}</td>}
                <td data-etiqueta="Votación">
                  {p.puesto ?? (p.puesto_reportado ? `“${p.puesto_reportado}”` : '—')}
                  {(p.localidad || p.mesa) && <small>{[p.localidad, p.mesa && `mesa ${p.mesa}`].filter(Boolean).join(' · ')}</small>}
                </td>
                <td data-etiqueta="Estado"><span className={`insignia ${p.ubicacion_estado}`}>{ESTADOS_UBICACION[p.ubicacion_estado]}</span></td>
                <td data-etiqueta=""><button className="boton chico peligro" onClick={() => eliminar(p)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && filas.length === 0 && <div className="vacio">{texto || estado ? 'Nadie coincide con la búsqueda.' : 'Todavía no hay personas registradas.'}</div>}
        {cargando && filas.length === 0 && <div className="vacio">Cargando…</div>}
      </div>
      {filas.length < total && (
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button className="boton" disabled={cargando} onClick={() => cargar(filas.length)}>{cargando ? 'Cargando…' : `Ver más (${formatoNumero(total - filas.length)} restantes)`}</button>
        </div>
      )}
    </>
  );
}
