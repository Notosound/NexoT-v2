// Formulario público de un evento: se abre al escanear el QR (sin sesión)
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { SEXOS, type DatosAsistencia, type Sexo } from '../lib/tipos';
import { mensajeError, soloDigitos } from '../lib/utilidades';

const VACIO: DatosAsistencia = { cedula: '', nombres: '', apellidos: '', telefono: '', sexo: '', edad: '', acepta: false };

export default function EventoPublico() {
  const { token = '' } = useParams();
  const { api } = useSesion();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.eventoInfo>> | undefined>(undefined);
  const [d, setD] = useState(VACIO);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  useEffect(() => { api.eventoInfo(token).then(setInfo).catch(() => setInfo(null)); }, [api, token]);
  const poner = <K extends keyof DatosAsistencia>(k: K, v: DatosAsistencia[K]) => setD((x) => ({ ...x, [k]: v }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (soloDigitos(d.cedula).length < 5) return setError('Revisa la cédula: solo números, entre 5 y 10 dígitos.');
    if (!d.nombres.trim()) return setError('Escribe tu nombre.');
    if (!/^3\d{9}$/.test(d.telefono)) return setError('Escribe tu celular: 10 dígitos, empieza por 3.');
    if (!d.sexo) return setError('Elige una opción en sexo.');
    if (!(Number(d.edad) >= 18)) return setError('Escribe tu edad (debes ser mayor de edad).');
    if (!d.acepta) return setError('Para registrarte debes aceptar el tratamiento de tus datos.');
    setEnviando(true);
    try { await api.registrarAsistencia(token, d); setListo(true); window.scrollTo(0, 0); } catch (err) { setError(mensajeError(err)); } finally { setEnviando(false); }
  };

  const cabecera = (
    <div className="cabecera">
      <h1>{info ? info.evento : 'Evento'}</h1>
      {info && <p>{info.campana} · {new Date(info.fecha).toLocaleString('es-CO', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}{info.lugar ? ` · ${info.lugar}` : ''}</p>}
    </div>
  );
  if (info === undefined) return <div className="publico">{cabecera}<div className="tarjeta"><p className="vacio">Cargando…</p></div></div>;
  if (info === null) return <div className="publico">{cabecera}<div className="tarjeta"><div className="aviso atencion">Este evento ya no recibe asistencias.</div></div></div>;
  if (listo) {
    return (
      <div className="publico">{cabecera}
        <div className="tarjeta" style={{ textAlign: 'center' }}>
          <CheckCircle2 aria-hidden style={{ width: 56, height: 56, color: 'var(--ok)' }} />
          <h2>¡Gracias por venir!</h2>
          <p className="subtitulo">Tu asistencia quedó registrada.</p>
          <button className="boton" style={{ marginTop: '1rem' }} onClick={() => { setD(VACIO); setListo(false); }}>Registrar a otra persona</button>
        </div>
      </div>
    );
  }
  return (
    <div className="publico">
      {cabecera}
      <form className="tarjeta formulario" onSubmit={enviar} noValidate>
        <h2>Registra tu asistencia</h2>
        <div className="fila-campos">
          <label className="campo"><span>Cédula</span><input type="text" inputMode="numeric" value={d.cedula} onChange={(e) => poner('cedula', soloDigitos(e.target.value).slice(0, 10))} /></label>
          <label className="campo"><span>Celular</span><input type="tel" inputMode="tel" value={d.telefono} onChange={(e) => poner('telefono', soloDigitos(e.target.value).slice(0, 10))} /></label>
        </div>
        <div className="fila-campos">
          <label className="campo"><span>Nombres</span><input type="text" autoComplete="given-name" value={d.nombres} onChange={(e) => poner('nombres', e.target.value)} /></label>
          <label className="campo"><span>Apellidos</span><input type="text" autoComplete="family-name" value={d.apellidos} onChange={(e) => poner('apellidos', e.target.value)} /></label>
        </div>
        <div className="fila-campos">
          <fieldset><legend>Sexo</legend>
            <div className="segmentos">
              {(Object.keys(SEXOS) as Sexo[]).map((s) => <button type="button" key={s} className="opcion" aria-pressed={d.sexo === s} onClick={() => poner('sexo', s)}>{SEXOS[s]}</button>)}
            </div>
          </fieldset>
          <label className="campo" style={{ maxWidth: 140 }}><span>Edad</span><input type="number" inputMode="numeric" min={18} max={120} value={d.edad} onChange={(e) => poner('edad', e.target.value)} /></label>
        </div>
        <label className="casilla">
          <input type="checkbox" checked={d.acepta} onChange={(e) => poner('acepta', e.target.checked)} />
          <span>Autorizo el tratamiento de mis datos personales, incluido el dato sensible de mi preferencia política, con fines logísticos y de conteo de la campaña,
            conforme a la Ley 1581 de 2012. <a href={`/privacidad/${info.slug}`} target="_blank" rel="noreferrer">Leer la política de datos</a></span>
        </label>
        {error && <div className="aviso error" role="alert">{error}</div>}
        <button className="boton primario bloque" disabled={enviando}>{enviando ? 'Enviando…' : 'Registrar asistencia'}</button>
        <p className="ayuda" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck className="icono" aria-hidden /> Si ya estabas registrado, solo se marca tu asistencia: tus datos no cambian.
        </p>
      </form>
    </div>
  );
}
