// Eventos: cada reunión o caravana tiene un QR. Quien lo escanea queda
// como asistente; si es nuevo, entra a la base con el líder del evento.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { CalendarPlus, Copy, Download, ExternalLink, QrCode, UserPlus, Users } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { useEnVivo } from '../lib/enVivo';
import type { Asistente, Evento, Lider, Localidad } from '../lib/tipos';
import { formatoNumero, mensajeError } from '../lib/utilidades';
import { descargarConfidencial, fechaArchivo } from '../lib/excel';
import EnVivo from '../componentes/EnVivo';
import QR from '../componentes/QR';
import { Cifra, Ventana } from '../componentes/Piezas';

export const urlEvento = (token: string) => `${window.location.origin}/e/${token}`;
const fechaEvento = (iso: string) => new Date(iso).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function Eventos() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const puedeCrear = rol === 'admin' || rol === 'coordinador';
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [creando, setCreando] = useState(false);
  const [qr, setQr] = useState<Evento | null>(null);
  const [lista, setLista] = useState<Evento | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(() => api.eventos().then(setEventos).catch((e) => setError(mensajeError(e))), [api]);
  const vivo = useEnVivo(cargar, ['registros']);
  const asistentes = (eventos ?? []).reduce((a, e) => a + e.asistentes, 0);
  const nuevos = (eventos ?? []).reduce((a, e) => a + e.nuevos, 0);

  const alternar = async (e: Evento) => {
    try { await api.cerrarEvento(e.id, !e.activo); cargar(); } catch (err) { setError(mensajeError(err)); }
  };

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Eventos</h1>
          <p className="subtitulo">Reuniones, caravanas y visitas: la gente escanea el QR y queda registrada como asistente.</p>
          <EnVivo {...vivo} />
        </div>
        {puedeCrear && <button className="boton primario" onClick={() => setCreando(true)}><CalendarPlus className="icono" aria-hidden />Nuevo evento</button>}
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="cifras">
        <Cifra icono={CalendarPlus} valor={eventos ? eventos.length : null} etiqueta="eventos" />
        <Cifra icono={Users} valor={eventos ? formatoNumero(asistentes) : null} etiqueta="asistencias" />
        <Cifra icono={UserPlus} valor={eventos ? formatoNumero(nuevos) : null} etiqueta="personas nuevas que llegaron por eventos" tono="ok"
          detalle={asistentes ? `${Math.round((100 * nuevos) / asistentes)}% de los asistentes eran nuevos` : undefined} />
      </div>

      <div className="seccion">
        {eventos == null ? <div className="tarjeta vacio">Cargando…</div> : eventos.length === 0 ? (
          <div className="tarjeta vacio">Todavía no hay eventos.{puedeCrear ? ' Crea el primero y proyecta o imprime su QR en la entrada.' : ''}</div>
        ) : (
          <div className="lista-eventos">
            {eventos.map((e) => (
              <article key={e.id} className={`tarjeta evento${e.activo ? '' : ' cerrado'}`}>
                <div className="evento-cabeza">
                  <div>
                    <h2>{e.nombre}</h2>
                    <p className="ayuda">{fechaEvento(e.fecha)}{e.lugar ? ` · ${e.lugar}` : ''}{e.localidad ? ` · ${e.localidad}` : ''}</p>
                    <p className="ayuda">Los nuevos quedan con <strong>{e.lider}</strong></p>
                  </div>
                  <span className={`estado ${e.activo ? 'activo' : 'inactivo'}`}>{e.activo ? 'Recibiendo' : 'Cerrado'}</span>
                </div>
                <div className="evento-cifras">
                  <span><strong>{formatoNumero(e.asistentes)}</strong> asistentes</span>
                  <span><strong>{formatoNumero(e.nuevos)}</strong> nuevos</span>
                </div>
                <div className="acciones">
                  {rol !== 'candidato' && <button className="boton chico" onClick={() => setQr(e)} disabled={!e.activo}><QrCode className="icono" aria-hidden />QR y enlace</button>}
                  {rol !== 'candidato' && <button className="boton chico" onClick={() => setLista(e)}><Users className="icono" aria-hidden />Asistentes</button>}
                  {puedeCrear && <button className="boton chico" onClick={() => alternar(e)}>{e.activo ? 'Cerrar' : 'Reabrir'}</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {creando && <Crear alCerrar={() => setCreando(false)} alCrear={async (id) => { setCreando(false); const l = await api.eventos(); setEventos(l); setQr(l.find((x) => x.id === id) ?? null); }} />}
      {qr && <VentanaQR e={qr} alCerrar={() => setQr(null)} />}
      {lista && <Asistentes e={lista} alCerrar={() => setLista(null)} />}
    </>
  );
}

function Crear({ alCerrar, alCrear }: { alCerrar: () => void; alCrear: (id: string) => void }) {
  const { api } = useSesion();
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [d, setD] = useState({ nombre: '', fecha: '', lugar: '', localidadId: '', liderId: '' });
  const [error, setError] = useState('');
  useEffect(() => {
    api.lideres().then((l) => { setLideres(l); if (l.length === 1) setD((x) => ({ ...x, liderId: l[0].id })); }).catch(() => {});
    api.localidades().then(setLocalidades).catch(() => {});
  }, [api]);
  const crear = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try { alCrear(await api.crearEvento({ ...d, localidadId: d.localidadId ? Number(d.localidadId) : null })); } catch (err) { setError(mensajeError(err)); }
  };
  return (
    <Ventana titulo="Nuevo evento" icono={CalendarPlus} alCerrar={alCerrar}>
      <form className="formulario" onSubmit={crear}>
        <label className="campo"><span>Nombre</span><input type="text" placeholder="Reunión con líderes de Suba" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} autoFocus /></label>
        <div className="fila-campos">
          <label className="campo"><span>Fecha y hora</span><input type="datetime-local" value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} /></label>
          <label className="campo"><span>Localidad <span className="opcional">(opcional)</span></span>
            <select value={d.localidadId} onChange={(e) => setD({ ...d, localidadId: e.target.value })}>
              <option value="">—</option>{localidades.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </label>
        </div>
        <label className="campo"><span>Lugar <span className="opcional">(opcional)</span></span><input type="text" placeholder="Salón comunal, dirección…" value={d.lugar} onChange={(e) => setD({ ...d, lugar: e.target.value })} /></label>
        <label className="campo"><span>Las personas nuevas quedan con el líder</span>
          <select value={d.liderId} onChange={(e) => setD({ ...d, liderId: e.target.value })}>
            <option value="">Elige un líder</option>{lideres.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </label>
        {error && <div className="aviso error" role="alert">{error}</div>}
        <div className="acciones" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button className="boton primario">Crear y ver el QR</button>
        </div>
      </form>
    </Ventana>
  );
}

function VentanaQR({ e, alCerrar }: { e: Evento; alCerrar: () => void }) {
  const url = urlEvento(e.token);
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => { try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* */ } };
  const descargar = async () => {
    const datos = await QRCode.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: 'M' });
    const a = document.createElement('a');
    a.href = datos; a.download = `QR_${e.nombre.replace(/[^\p{L}\p{N}]+/gu, '_')}.png`; a.click();
  };
  return (
    <Ventana titulo={e.nombre} icono={QrCode} alCerrar={alCerrar}>
      <p className="ayuda">Proyéctalo o imprímelo en la entrada. Cada persona lo escanea con la cámara del celular y llena sus datos en un minuto.</p>
      <div className="qr-evento"><QR texto={url} /></div>
      <div className="caja-enlace">{url}</div>
      <div className="acciones" style={{ marginTop: '0.75rem' }}>
        <button className="boton chico" onClick={copiar}><Copy className="icono" aria-hidden />{copiado ? 'Copiado' : 'Copiar enlace'}</button>
        <button className="boton chico" onClick={descargar}><Download className="icono" aria-hidden />Descargar QR</button>
        <a className="boton chico" href={url} target="_blank" rel="noreferrer"><ExternalLink className="icono" aria-hidden />Abrir formulario</a>
      </div>
    </Ventana>
  );
}

function Asistentes({ e, alCerrar }: { e: Evento; alCerrar: () => void }) {
  const { api } = useSesion();
  const [filas, setFilas] = useState<Asistente[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.asistentes(e.id).then(setFilas).catch((err) => setError(mensajeError(err))); }, [api, e.id]);
  const exportar = async () => {
    if (!filas) return;
    try {
      await api.registrarExportacion('asistentes_evento', filas.length, { evento: e.nombre });
      await descargarConfidencial(`Asistentes_${e.nombre.replace(/[^\p{L}\p{N}]+/gu, '_')}_${fechaArchivo()}.xlsx`, [{ nombre: 'Asistentes', filas: [
        ['Nombres', 'Apellidos', 'Celular', 'Líder', 'Nuevo', 'Llegó'],
        ...filas.map((f) => [f.nombres, f.apellidos, f.telefono, f.lider, f.nueva ? 'Sí' : 'No', new Date(f.en).toLocaleString('es-CO')]),
      ] }]);
    } catch (err) { setError(mensajeError(err)); }
  };
  return (
    <Ventana titulo={`Asistentes · ${e.nombre}`} icono={Users} alCerrar={alCerrar}>
      {error && <div className="aviso error" role="alert">{error}</div>}
      {filas == null ? <p className="ayuda">Cargando…</p> : filas.length === 0 ? <p className="ayuda">Todavía no ha llegado nadie (o los asistentes son de líderes que no ves).</p> : (
        <>
          <p className="ayuda">{filas.length} asistentes · {filas.filter((f) => f.nueva).length} nuevos <button className="enlace" onClick={exportar}>Exportar a Excel</button></p>
          <ul className="titular-datos" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {filas.map((f) => (
              <li key={f.persona_id}><strong>{f.nombres} {f.apellidos}</strong>{f.nueva && <span className="chip-compromiso confirmado" style={{ marginLeft: 6 }}>Nuevo</span>}
                <span className="ayuda"> · {f.telefono ?? 'sin celular'} · {f.lider}</span></li>
            ))}
          </ul>
        </>
      )}
    </Ventana>
  );
}
