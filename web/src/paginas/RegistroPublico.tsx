// Formulario público: se abre desde el enlace o QR de un líder (sin iniciar sesión)
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import SelectorPuesto from '../componentes/SelectorPuesto';
import { SEXOS, type DatosFormularioPublico, type Localidad, type Puesto, type Sexo } from '../lib/tipos';
import { edadDesde, mensajeError, soloDigitos } from '../lib/utilidades';

const VACIO: DatosFormularioPublico = {
  cedula: '', nombres: '', apellidos: '', sexo: '', fecha_nacimiento: '', edad: '', telefono: '',
  localidad_id: null, puesto_id: null, puesto_reportado: '', direccion_reportada: '', mesa: '', acepta: false,
};

const AVISO_PUBLICO =
  'Autorizo el tratamiento de mis datos personales, incluido el dato sensible de mi preferencia política, con fines logísticos ' +
  'y de conteo de la campaña, conforme a la Ley 1581 de 2012 y la política de tratamiento de datos. Sé que mi autorización es ' +
  'voluntaria y que puedo consultar, corregir o pedir que se eliminen mis datos.';

export default function RegistroPublico() {
  const { token = '' } = useParams();
  const { api } = useSesion();
  const [info, setInfo] = useState<{ lider: string; campana: string } | null | undefined>(undefined);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [d, setD] = useState(VACIO);
  const [puesto, setPuesto] = useState<Puesto | null>(null);
  const [otro, setOtro] = useState(false);
  const [modoEdad, setModoEdad] = useState<'fecha' | 'edad'>('fecha');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    api.enlaceInfo(token).then(setInfo).catch(() => setInfo(null));
    api.localidades().then(setLocalidades).catch(() => {});
  }, [api, token]);

  const poner = <K extends keyof DatosFormularioPublico>(k: K, v: DatosFormularioPublico[K]) => setD((x) => ({ ...x, [k]: v }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const edad = modoEdad === 'fecha' ? edadDesde(d.fecha_nacimiento || null, null, null) : Number(d.edad);
    if (soloDigitos(d.cedula).length < 5) return setError('Revisa la cédula: solo números, entre 5 y 10 dígitos.');
    if (!d.nombres.trim()) return setError('Escribe tu nombre.');
    if (!d.sexo) return setError('Elige una opción en sexo.');
    if (!edad) return setError('Escribe tu fecha de nacimiento o tu edad.');
    if (edad < 18) return setError('Debes ser mayor de edad para registrarte.');
    if (!d.acepta) return setError('Para registrarte debes aceptar el tratamiento de tus datos.');
    setEnviando(true);
    try {
      await api.registrarPorEnlace(token, {
        ...d,
        fecha_nacimiento: modoEdad === 'fecha' ? d.fecha_nacimiento : '',
        edad: modoEdad === 'edad' ? d.edad : '',
        puesto_id: otro ? null : puesto?.id ?? null,
      });
      setListo(true);
      window.scrollTo(0, 0);
    } catch (e) { setError(mensajeError(e)); } finally { setEnviando(false); }
  };

  const cabecera = (
    <div className="cabecera">
      <h1>{info ? info.campana : 'Registro'}</h1>
      {info && <p>Te invita <strong>{info.lider}</strong></p>}
    </div>
  );

  if (info === undefined) return <div className="publico">{cabecera}<div className="tarjeta"><p className="vacio">Cargando…</p></div></div>;
  if (info === null) {
    return (
      <div className="publico">{cabecera}
        <div className="tarjeta"><div className="aviso atencion">Este enlace ya no está activo. Pídele uno nuevo a quien te lo envió.</div></div>
      </div>
    );
  }
  if (listo) {
    return (
      <div className="publico">{cabecera}
        <div className="tarjeta" style={{ textAlign: 'center' }}>
          <CheckCircle2 aria-hidden style={{ width: 56, height: 56, color: 'var(--ok)' }} />
          <h2>¡Gracias! Tu registro quedó listo.</h2>
          <p className="subtitulo">Si ya estabas registrado, no pasa nada: tus datos no se duplican.</p>
          <button className="boton" style={{ marginTop: '1rem' }} onClick={() => { setD(VACIO); setPuesto(null); setOtro(false); setListo(false); }}>
            Registrar a otra persona
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="publico">
      {cabecera}
      <form className="tarjeta formulario" onSubmit={enviar} noValidate>
        <h2>Tus datos</h2>
        <div className="fila-campos">
          <label className="campo"><span>Cédula</span>
            <input type="text" inputMode="numeric" autoComplete="off" value={d.cedula} onChange={(e) => poner('cedula', soloDigitos(e.target.value).slice(0, 10))} />
          </label>
          <label className="campo"><span>Teléfono <span className="opcional">(opcional)</span></span>
            <input type="tel" inputMode="tel" value={d.telefono} onChange={(e) => poner('telefono', soloDigitos(e.target.value).slice(0, 10))} />
          </label>
        </div>
        <div className="fila-campos">
          <label className="campo"><span>Nombres</span><input type="text" autoComplete="given-name" value={d.nombres} onChange={(e) => poner('nombres', e.target.value)} /></label>
          <label className="campo"><span>Apellidos</span><input type="text" autoComplete="family-name" value={d.apellidos} onChange={(e) => poner('apellidos', e.target.value)} /></label>
        </div>
        <fieldset>
          <legend>Sexo</legend>
          <div className="segmentos">
            {(Object.keys(SEXOS) as Sexo[]).map((s) => (
              <button type="button" key={s} className="opcion" aria-pressed={d.sexo === s} onClick={() => poner('sexo', s)}>{SEXOS[s]}</button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Edad</legend>
          <div className="segmentos" style={{ marginBottom: '0.75rem' }}>
            <button type="button" className="opcion" aria-pressed={modoEdad === 'fecha'} onClick={() => setModoEdad('fecha')}>Fecha de nacimiento</button>
            <button type="button" className="opcion" aria-pressed={modoEdad === 'edad'} onClick={() => setModoEdad('edad')}>Solo la edad</button>
          </div>
          {modoEdad === 'fecha'
            ? <input type="date" aria-label="Fecha de nacimiento" value={d.fecha_nacimiento} onChange={(e) => poner('fecha_nacimiento', e.target.value)} />
            : <input type="number" aria-label="Edad" min={18} max={120} value={d.edad} onChange={(e) => poner('edad', e.target.value)} />}
        </fieldset>
        <fieldset>
          <legend>¿Dónde votas? <span className="opcional">(si lo sabes)</span></legend>
          <div className="formulario">
            <label className="campo"><span>Localidad</span>
              <select value={d.localidad_id ?? ''} onChange={(e) => { poner('localidad_id', e.target.value ? Number(e.target.value) : null); setPuesto(null); setOtro(false); }}>
                <option value="">Elige…</option>
                {localidades.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </label>
            {d.localidad_id && !otro && <SelectorPuesto localidadId={d.localidad_id} elegido={puesto} onElegir={setPuesto} onOtro={() => { setOtro(true); setPuesto(null); }} />}
            {d.localidad_id && otro && (
              <>
                <label className="campo"><span>Nombre del puesto como te aparece</span>
                  <input type="text" value={d.puesto_reportado} onChange={(e) => poner('puesto_reportado', e.target.value)} />
                </label>
                <label className="campo"><span>Dirección del puesto <span className="opcional">(opcional)</span></span>
                  <input type="text" placeholder="Ej.: Calle 46 sur # 27-12" value={d.direccion_reportada} onChange={(e) => poner('direccion_reportada', e.target.value)} />
                </label>
                <button type="button" className="enlace" onClick={() => setOtro(false)}>Volver a la lista oficial</button>
              </>
            )}
            {d.localidad_id && (
              <label className="campo"><span>Mesa <span className="opcional">(si la sabes)</span></span>
                <input type="number" min={1} value={d.mesa} onChange={(e) => poner('mesa', e.target.value)} />
              </label>
            )}
            <p className="ayuda">Puedes consultarlo en la página de la Registraduría con tu cédula.</p>
          </div>
        </fieldset>
        <label className="casilla">
          <input type="checkbox" checked={d.acepta} onChange={(e) => poner('acepta', e.target.checked)} />
          <span>{AVISO_PUBLICO}</span>
        </label>
        {error && <div className="aviso error" role="alert">{error}</div>}
        <button className="boton primario bloque" disabled={enviando}>{enviando ? 'Enviando…' : 'Registrarme'}</button>
        <p className="ayuda" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck className="icono" aria-hidden /> Tus datos solo los ve la campaña. Este formulario no muestra datos de nadie.
        </p>
      </form>
    </div>
  );
}
