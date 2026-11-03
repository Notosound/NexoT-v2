// Datos personales (solo admin): solicitudes de los titulares, registro de
// acciones sensibles y datos del responsable para la política pública.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, ExternalLink, FileDown, Eye, ShieldCheck, Trash2, UserCog, Inbox } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import {
  TIPOS_SOLICITUD, type AccionSensible, type DatoTitular, type Politica, type SolicitudDatos,
} from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';
import { Cifra, QueEs, Ventana } from '../componentes/Piezas';

type Pestana = 'solicitudes' | 'acciones' | 'responsable';
const DIA = 86_400_000;
const fecha = (iso: string) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const fechaCorta = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

function diasRestantes(vence: string) {
  return Math.ceil((new Date(`${vence}T23:59:59`).getTime() - Date.now()) / DIA);
}

export default function DatosPersonales() {
  const { api } = useSesion();
  const [pestana, setPestana] = useState<Pestana>('solicitudes');
  const [solicitudes, setSolicitudes] = useState<SolicitudDatos[] | null>(null);
  const [politica, setPolitica] = useState<(Politica & { slug: string }) | null>(null);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api.solicitudesDatos(), api.miPolitica()]);
      setSolicitudes(s); setPolitica(p);
    } catch (e) { setError(mensajeError(e)); }
  }, [api]);
  useEffect(() => { cargar(); }, [cargar]);

  const enlace = politica ? `${location.origin}/privacidad/${politica.slug}` : '';
  const pendientes = (solicitudes ?? []).filter((s) => s.estado === 'pendiente');
  const vencidas = pendientes.filter((s) => diasRestantes(s.vence_en) < 0).length;
  const proximas = pendientes.filter((s) => { const d = diasRestantes(s.vence_en); return d >= 0 && d <= 3; }).length;
  const copiar = async () => { try { await navigator.clipboard.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* */ } };

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Datos personales</h1>
          <p className="subtitulo">Lo que pide la Ley 1581: atender a las personas que preguntan por sus datos y dejar rastro de lo sensible.</p>
        </div>
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      {politica && !politica.correo && (
        <div className="aviso atencion" style={{ marginBottom: '1rem' }}>
          Falta el correo del responsable: la política pública debe decir a dónde escribir.{' '}
          <button className="enlace" onClick={() => setPestana('responsable')}>Completar ahora</button>
        </div>
      )}

      <div className="cifras">
        <Cifra icono={Inbox} valor={solicitudes ? pendientes.length : null} etiqueta="solicitudes por atender" tono={pendientes.length ? 'aviso' : 'ok'}
          detalle={vencidas ? `${vencidas} ya vencieron` : proximas ? `${proximas} vencen en 3 días o menos` : 'Ninguna vencida'} />
        <div className="tarjeta enlace-politica">
          <div className="tarjeta-titulo"><h2><ShieldCheck className="icono" aria-hidden /> Política pública</h2></div>
          <p className="ayuda">Este enlace va en el formulario de registro. Compártelo si alguien pregunta por sus datos.</p>
          <div className="acciones">
            <button className="boton chico" onClick={copiar} disabled={!enlace}><Copy className="icono" aria-hidden />{copiado ? 'Copiado' : 'Copiar enlace'}</button>
            {enlace && <a className="boton chico" href={enlace} target="_blank" rel="noreferrer"><ExternalLink className="icono" aria-hidden />Ver página</a>}
          </div>
        </div>
      </div>

      <div className="pestanas" role="tablist">
        {([['solicitudes', `Solicitudes${pendientes.length ? ` (${pendientes.length})` : ''}`], ['acciones', 'Registro de acciones'], ['responsable', 'Responsable']] as [Pestana, string][]).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </div>

      {pestana === 'solicitudes' && <Solicitudes lista={solicitudes} alCambiar={cargar} />}
      {pestana === 'acciones' && <Acciones />}
      {pestana === 'responsable' && politica && <Responsable p={politica} alGuardar={cargar} />}
    </>
  );
}

function Solicitudes({ lista, alCambiar }: { lista: SolicitudDatos[] | null; alCambiar: () => void }) {
  const [abierta, setAbierta] = useState<SolicitudDatos | null>(null);
  const [ver, setVer] = useState<'pendiente' | 'todas'>('pendiente');
  if (!lista) return <div className="tarjeta vacio">Cargando…</div>;
  const filas = ver === 'pendiente' ? lista.filter((s) => s.estado === 'pendiente') : lista;
  return (
    <div className="tarjeta">
      <div className="segmentos" role="group" aria-label="Qué solicitudes ver" style={{ marginBottom: '0.75rem' }}>
        <button type="button" className="opcion" aria-pressed={ver === 'pendiente'} onClick={() => setVer('pendiente')}>Por atender</button>
        <button type="button" className="opcion" aria-pressed={ver === 'todas'} onClick={() => setVer('todas')}>Todas</button>
      </div>
      {filas.length === 0 ? <p className="vacio">{ver === 'pendiente' ? 'No hay solicitudes por atender.' : 'Todavía nadie ha hecho una solicitud.'}</p> : (
        <ul className="lista-solicitudes">
          {filas.map((s) => {
            const d = diasRestantes(s.vence_en);
            const tono = s.estado !== 'pendiente' ? 'cerrada' : d < 0 ? 'vencida' : d <= 3 ? 'pronto' : 'a-tiempo';
            return (
              <li key={s.id} className={`solicitud ${tono}`}>
                <div>
                  <strong>{s.nombre}</strong> <span className="ayuda">· C.C. {s.cedula} · {s.contacto}</span>
                  <div className="solicitud-tipo">{TIPOS_SOLICITUD[s.tipo]}</div>
                  {s.detalle && <p className="ayuda" style={{ margin: '0.25rem 0 0' }}>“{s.detalle}”</p>}
                  <small className="ayuda">Radicado {s.radicado} · recibida {fechaCorta(s.creado_en)}</small>
                </div>
                <div className="solicitud-estado">
                  {s.estado === 'pendiente' ? (
                    <>
                      <span className={`plazo ${tono}`}>{d < 0 ? `Vencida hace ${-d} ${-d === 1 ? 'día' : 'días'}` : d === 0 ? 'Vence hoy' : `Quedan ${d} ${d === 1 ? 'día' : 'días'}`}</span>
                      <button className="boton chico primario" onClick={() => setAbierta(s)}>Atender</button>
                    </>
                  ) : (
                    <span className={`plazo ${s.estado === 'atendida' ? 'cerrada' : 'vencida'}`}>
                      {s.estado === 'atendida' ? 'Atendida' : 'Rechazada'}{s.personas_suprimidas ? ' · datos borrados' : ''}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {abierta && <Atender s={abierta} alCerrar={() => setAbierta(null)} alTerminar={() => { setAbierta(null); alCambiar(); }} />}
    </div>
  );
}

function Atender({ s, alCerrar, alTerminar }: { s: SolicitudDatos; alCerrar: () => void; alTerminar: () => void }) {
  const { api } = useSesion();
  const [datos, setDatos] = useState<DatoTitular[] | null>(null);
  const [respuesta, setRespuesta] = useState('');
  const borrable = s.tipo === 'supresion' || s.tipo === 'revocatoria';
  const [suprimir, setSuprimir] = useState(borrable);
  const [seguro, setSeguro] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { api.datosDelTitular(s.id).then(setDatos).catch((e) => setError(mensajeError(e))); }, [api, s.id]);

  const plantilla = () => {
    const n = (datos ?? []).filter((x) => !x.eliminado).length;
    if (s.tipo === 'consulta') {
      return n
        ? `Hola ${s.nombre.split(' ')[0]}. Tenemos ${n === 1 ? 'un registro' : `${n} registros`} con tu cédula: ${(datos ?? []).map((x) => `${x.nombres} ${x.apellidos}, celular ${x.telefono ?? 'sin celular'}, puesto ${x.puesto ?? 'sin puesto'}, registrado el ${fechaCorta(x.creado_en)}${x.autorizacion_en ? ' con autorización' : ''}`).join('; ')}. Si quieres corregir algo o que borremos tus datos, responde a este mensaje.`
        : `Hola ${s.nombre.split(' ')[0]}. Revisamos nuestra base y no tenemos datos asociados a tu cédula.`;
    }
    if (borrable) return `Hola ${s.nombre.split(' ')[0]}. Atendimos tu solicitud: borramos tus datos personales de nuestra base y no volveremos a contactarte.`;
    return `Hola ${s.nombre.split(' ')[0]}. Corregimos tus datos como lo pediste.`;
  };

  const terminar = async (estado: 'atendida' | 'rechazada') => {
    setError('');
    if (estado === 'atendida' && suprimir && !seguro) return setError('Confirma que entiendes que el borrado no se puede deshacer.');
    setEnviando(true);
    try {
      await api.atenderSolicitud(s.id, estado, respuesta, estado === 'atendida' && suprimir);
      alTerminar();
    } catch (e) { setError(mensajeError(e)); } finally { setEnviando(false); }
  };

  return (
    <Ventana titulo={`${TIPOS_SOLICITUD[s.tipo]} · ${s.nombre}`} icono={UserCog} alCerrar={alCerrar}>
      <p className="ayuda">C.C. {s.cedula} · responder a: <strong>{s.contacto}</strong> · radicado {s.radicado}</p>
      <h3 style={{ margin: '0.75rem 0 0.35rem', fontSize: '0.95rem' }}>Lo que hay en la base con esa cédula</h3>
      {datos == null ? <p className="ayuda">Buscando…</p> : datos.length === 0 ? <p className="ayuda">No hay registros con esa cédula.</p> : (
        <ul className="titular-datos">
          {datos.map((x) => (
            <li key={x.persona_id}>
              <strong>{x.nombres} {x.apellidos}</strong>{x.eliminado && <span className="ayuda"> (eliminado)</span>}
              <span className="ayuda"> · {x.telefono ?? 'sin celular'} · {x.puesto ?? 'sin puesto'} · líder {x.lider} · {x.origen} · {fechaCorta(x.creado_en)}
                {x.autorizacion_en ? ` · autorizó por ${x.autorizacion_canal}` : ' · sin autorización registrada'}</span>
            </li>
          ))}
        </ul>
      )}
      <label className="campo" style={{ marginTop: '0.75rem' }}>
        <span>Respuesta que se le dio al titular</span>
        <textarea rows={4} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="Escribe aquí lo que le respondiste (por WhatsApp, correo o llamada)" />
      </label>
      <button type="button" className="enlace" onClick={() => setRespuesta(plantilla())} disabled={!datos}>Usar texto sugerido</button>
      {borrable && (
        <div className="aviso atencion" style={{ marginTop: '0.5rem' }}>
          <label className="casilla" style={{ margin: 0 }}>
            <input type="checkbox" checked={suprimir} onChange={(e) => setSuprimir(e.target.checked)} />
            <span><strong>Borrar sus datos de toda la base</strong>: registro, seguimiento, testigos, Día D, filas de Excel y la auditoría.</span>
          </label>
          {suprimir && (
            <label className="casilla" style={{ margin: '0.5rem 0 0' }}>
              <input type="checkbox" checked={seguro} onChange={(e) => { setSeguro(e.target.checked); setError(''); }} />
              <span>Entiendo que <strong>no se puede deshacer</strong>.</span>
            </label>
          )}
        </div>
      )}
      {error && <div className="aviso error" role="alert" style={{ marginTop: '0.5rem' }}>{error}</div>}
      <div className="acciones" style={{ marginTop: '0.75rem', justifyContent: 'flex-end' }}>
        <button className="boton" onClick={() => terminar('rechazada')} disabled={enviando}>Rechazar</button>
        <button className="boton primario" onClick={() => terminar('atendida')} disabled={enviando}>
          {borrable && suprimir ? <><Trash2 className="icono" aria-hidden />Borrar y marcar atendida</> : 'Marcar atendida'}
        </button>
      </div>
    </Ventana>
  );
}

const ICONO_ACCION = { EXPORT: FileDown, VER_COMO: Eye, SUPRESION: Trash2, UPDATE: UserCog };
function describir(a: AccionSensible) {
  const d = a.detalle ?? {};
  if (a.accion === 'EXPORT') return `Exportó ${d.tipo ?? 'datos'} (${d.filas ?? '?'} filas)`;
  if (a.accion === 'VER_COMO') return `Entró a "Ver como" (${String(d.objetivo ?? '').replace(/^rol:/, 'rol ').replace(/^lider:.*/, 'un líder')})`;
  if (a.accion === 'SUPRESION') return `Borró los datos de un titular (radicado ${d.radicado}, ${d.personas} ${d.personas === 1 ? 'registro' : 'registros'})`;
  if (d.verificacion_dos_pasos) return 'Quitó la verificación en dos pasos a un usuario';
  return 'Cambió el rol o el acceso de un usuario';
}

function Acciones() {
  const { api } = useSesion();
  const [filas, setFilas] = useState<AccionSensible[] | null>(null);
  useEffect(() => { api.accionesSensibles().then(setFilas).catch(() => setFilas([])); }, [api]);
  return (
    <div className="tarjeta">
      <div className="tarjeta-titulo">
        <h2>Quién hizo qué <QueEs>Cada exportación a Excel, cada "Ver como", cada borrado de datos y cada cambio de rol queda aquí. Nadie lo puede borrar.</QueEs></h2>
        <small>últimas 300</small>
      </div>
      {filas == null ? <p className="vacio">Cargando…</p> : filas.length === 0 ? <p className="vacio">Todavía no hay acciones sensibles.</p> : (
        <ul className="hallazgos">
          {filas.map((a) => {
            const Icono = ICONO_ACCION[a.accion] ?? UserCog;
            return (
              <li key={a.id}>
                <Icono aria-hidden />
                <div><strong>{a.usuario}</strong> · {describir(a)}</div>
                <span className="ayuda" style={{ whiteSpace: 'nowrap' }}>{fecha(a.en)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Responsable({ p, alGuardar }: { p: Politica; alGuardar: () => void }) {
  const { api } = useSesion();
  const [d, setD] = useState({ responsable: p.responsable ?? '', documento: p.documento ?? '', correo: p.correo ?? '', telefono: p.telefono ?? '', direccion: p.direccion ?? '' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const guardar = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setOk('');
    try { await api.configurarPolitica(d); setOk('Guardado. La política pública ya muestra estos datos.'); alGuardar(); } catch (err) { setError(mensajeError(err)); }
  };
  const campo = (k: keyof typeof d, t: string, extra?: string) => (
    <label className="campo"><span>{t}{extra && <span className="opcional"> {extra}</span>}</span>
      <input type="text" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    </label>
  );
  return (
    <form className="tarjeta formulario" onSubmit={guardar} style={{ maxWidth: 640 }}>
      <h2>Responsable del tratamiento</h2>
      <p className="ayuda">Aparece en la política pública. Es quien responde legalmente por la base de datos.</p>
      {campo('responsable', 'Nombre legal', '(persona o campaña)')}
      <div className="fila-campos">{campo('documento', 'NIT o cédula')}{campo('correo', 'Correo para solicitudes')}</div>
      <div className="fila-campos">{campo('telefono', 'Teléfono', '(opcional)')}{campo('direccion', 'Dirección', '(opcional)')}</div>
      {error && <div className="aviso error" role="alert">{error}</div>}
      {ok && <div className="aviso ok" role="status">{ok}</div>}
      <button className="boton primario">Guardar</button>
      <p className="ayuda">El texto de la política sigue la Ley 1581 de 2012 y el Decreto 1377 de 2013. Antes de usar datos reales, conviene que un abogado lo revise.</p>
    </form>
  );
}
