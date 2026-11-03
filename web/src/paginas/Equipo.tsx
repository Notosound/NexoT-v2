import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Mail, MailCheck, RotateCcw, ShieldCheck, ShieldOff, Smartphone, UserMinus, UserPlus, Users } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { ROLES, type Lider, type MiembroEquipo, type Rol } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';
import Invitar from '../componentes/Invitar';
import SelectorVerComo from '../componentes/VerComo';
import { Cifra, Iniciales } from '../componentes/Piezas';

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function Equipo() {
  const { api, sesionReal, verComo } = useSesion();
  const ir = useNavigate();
  const yoId = sesionReal!.usuarioId;
  const [equipo, setEquipo] = useState<MiembroEquipo[] | null>(null);
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [invitando, setInvitando] = useState(false);
  const [verComoDe, setVerComoDe] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [dosPasos, setDosPasos] = useState<Record<string, boolean>>({});

  const cargar = useCallback(() => {
    api.equipo().then(setEquipo).catch((e) => setError(mensajeError(e)));
    api.lideres().then(setLideres).catch(() => {});
    api.equipoDosPasos().then(setDosPasos).catch(() => {});
  }, [api]);
  useEffect(cargar, [cargar]);

  const accion = async (id: string, f: () => Promise<string | void>, exito: string) => {
    setError(''); setMensaje(''); setOcupado(id);
    try { const m = await f(); setMensaje(typeof m === 'string' ? m : exito); cargar(); } catch (e) { setError(mensajeError(e)); } finally { setOcupado(null); }
  };

  const activos = (equipo ?? []).filter((m) => m.activo);
  const pendientes = activos.filter((m) => !m.acepto && m.id !== yoId).length;

  return (
    <>
      <div className="encabezado">
        <div><h1>Equipo</h1><p className="subtitulo">Invita personas, cambia su rol o quítales el acceso. Todo desde aquí.</p></div>
        <button className="boton primario" onClick={() => setInvitando(true)}><UserPlus className="icono" aria-hidden />Invitar a alguien</button>
      </div>
      {mensaje && <div className="aviso ok" role="status" style={{ marginBottom: '1rem' }}>{mensaje}</div>}
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="cifras" style={{ marginBottom: '1.25rem' }}>
        <Cifra icono={Users} valor={equipo ? activos.length : null} etiqueta="personas con acceso" />
        <Cifra icono={MailCheck} valor={equipo ? pendientes : null} etiqueta="invitaciones sin aceptar" tono={pendientes ? 'aviso' : undefined}
          detalle={pendientes ? 'Puedes reenviarles el correo' : undefined} />
        <Cifra icono={ShieldCheck} valor={equipo ? activos.filter((m) => dosPasos[m.id]).length : null} etiqueta="con verificación en dos pasos"
          tono={activos.some((m) => (m.rol === 'admin' || m.rol === 'coordinador') && !dosPasos[m.id]) ? 'aviso' : 'ok'}
          detalle={activos.some((m) => (m.rol === 'admin' || m.rol === 'coordinador') && !dosPasos[m.id]) ? 'Hay administradores o coordinadores sin activarla' : 'Todos los que ven datos sensibles la tienen'} />
      </div>

      {equipo && (
        <div className="envoltura-tabla">
          <table className="tabla apilable">
            <thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {equipo.map((m) => {
                const soyYo = m.id === yoId;
                return (
                  <tr key={m.id} style={m.activo ? undefined : { opacity: 0.6 }}>
                    <td className="principal">
                      <span style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                        <Iniciales nombre={m.nombre} />
                        <span>{m.nombre}{soyYo && ' (tú)'}<small>{m.email}</small></span>
                      </span>
                    </td>
                    <td data-etiqueta="Rol">
                      {soyYo || !m.activo ? ROLES[m.rol] : (
                        <select aria-label={`Rol de ${m.nombre}`} value={m.rol} disabled={ocupado === m.id} style={{ minWidth: 150 }}
                          onChange={(e) => {
                            const r = e.target.value as Rol;
                            if (confirm(`¿Cambiar a ${m.nombre} de ${ROLES[m.rol]} a ${ROLES[r]}? Verá lo que permite el nuevo rol.`))
                              accion(m.id, () => api.cambiarRol(m.id, r), `${m.nombre} ahora es ${ROLES[r].toLowerCase()}.`);
                          }}>
                          {(Object.keys(ROLES) as Rol[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
                        </select>
                      )}
                    </td>
                    <td data-etiqueta="Estado">
                      {!m.activo ? <span className="estado inactivo">Sin acceso</span>
                        : m.acepto ? <span className="estado activo" title={m.ultimo_ingreso ? `Último ingreso: ${fecha(m.ultimo_ingreso)}` : ''}>Activo</span>
                        : <span className="estado pendiente">Invitación enviada</span>}
                      {m.activo && m.ultimo_ingreso && <small>Entró el {fecha(m.ultimo_ingreso)}</small>}
                      {m.activo && (dosPasos[m.id]
                        ? <small className="dos-pasos si"><Smartphone aria-hidden />Dos pasos activa</small>
                        : (m.rol === 'admin' || m.rol === 'coordinador') && <small className="dos-pasos no">Sin dos pasos</small>)}
                    </td>
                    <td data-etiqueta="Acciones">
                      {!soyYo && (
                        <div className="acciones">
                          {m.activo && (
                            <button className="boton chico" disabled={ocupado === m.id} onClick={() => accion(m.id, () => api.reenviarAcceso(m.id), '')}
                              title={m.acepto ? 'Enviarle un enlace para poner contraseña nueva' : 'Reenviar el correo de invitación'}>
                              <Mail className="icono" aria-hidden />{m.acepto ? 'Nueva contraseña' : 'Reenviar'}
                            </button>
                          )}
                          {m.activo && dosPasos[m.id] && (
                            <button className="boton chico" disabled={ocupado === m.id} title="Si perdió el celular: podrá entrar solo con su contraseña y activarla de nuevo"
                              onClick={() => confirm(`¿Quitarle la verificación en dos pasos a ${m.nombre}? Hazlo solo si perdió el celular y confirmaste que es él o ella.`) &&
                                accion(m.id, () => api.quitarDosPasosDe(m.id), '')}>
                              <ShieldOff className="icono" aria-hidden />Quitar dos pasos
                            </button>
                          )}
                          {m.activo && m.rol !== 'admin' && (
                            <button className="boton chico" onClick={() => (m.rol === 'lider' && m.lider_id
                              ? verComo({ objetivo: `lider:${m.lider_id}`, nombre: m.nombre, rol: 'lider' }).then(() => ir('/')).catch((e) => setError(mensajeError(e)))
                              : setVerComoDe(m.id))}><Eye className="icono" aria-hidden />Ver como</button>
                          )}
                          {m.activo ? (
                            <button className="boton chico peligro" disabled={ocupado === m.id}
                              onClick={() => confirm(`¿Quitarle el acceso a ${m.nombre}? Sus registros se conservan.`) &&
                                accion(m.id, () => api.desactivarUsuario(m.id), `${m.nombre} ya no tiene acceso.`)}>
                              <UserMinus className="icono" aria-hidden />Quitar acceso
                            </button>
                          ) : (
                            <button className="boton chico" disabled={ocupado === m.id} onClick={() => accion(m.id, () => api.reactivarUsuario(m.id), `${m.nombre} tiene acceso otra vez.`)}>
                              <RotateCcw className="icono" aria-hidden />Devolver acceso
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {invitando && <Invitar lideres={lideres} alCerrar={() => setInvitando(false)} alTerminar={(m) => { setInvitando(false); setMensaje(m); cargar(); }} />}
      {verComoDe && <SelectorVerComo soloPersona={verComoDe} alCerrar={() => setVerComoDe(null)} />}
    </>
  );
}
