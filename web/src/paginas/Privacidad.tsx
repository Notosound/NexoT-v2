// Página pública: política de tratamiento de datos (Ley 1581 de 2012) y
// formulario para que el titular haga su solicitud. No requiere sesión.
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { TIPOS_SOLICITUD, type Politica, type TipoSolicitud } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';

const VACIO = { tipo: '' as TipoSolicitud | '', cedula: '', nombre: '', contacto: '', detalle: '' };

export default function Privacidad() {
  const { slug = '' } = useParams();
  const { api } = useSesion();
  const [p, setP] = useState<Politica | null | undefined>(undefined);
  const [d, setD] = useState(VACIO);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [radicado, setRadicado] = useState('');

  useEffect(() => { api.politica(slug).then(setP).catch(() => setP(null)); }, [api, slug]);
  useEffect(() => { document.title = p ? `Tratamiento de datos · ${p.campana}` : 'Tratamiento de datos'; }, [p]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!d.tipo) return setError('Elige qué quieres solicitar.');
    setEnviando(true);
    try {
      setRadicado(await api.solicitarDatos(slug, { ...d, tipo: d.tipo }));
      setD(VACIO);
    } catch (err) { setError(mensajeError(err)); } finally { setEnviando(false); }
  };

  if (p === undefined) return <div className="publico"><div className="tarjeta"><p className="vacio">Cargando…</p></div></div>;
  if (p === null) return <div className="publico"><div className="tarjeta"><div className="aviso atencion">No encontramos esta política.</div></div></div>;

  const fecha = p.actualizada ? new Date(`${p.actualizada}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <div className="publico">
      <div className="cabecera">
        <h1>Tratamiento de datos personales</h1>
        <p>{p.campana}</p>
      </div>

      <article className="tarjeta politica">
        <h2>¿Quién es el responsable?</h2>
        <p>
          <strong>{p.responsable}</strong>{p.documento ? `, identificado con ${p.documento}` : ''}.
          {p.correo && <> Correo: <a href={`mailto:${p.correo}`}>{p.correo}</a>.</>}
          {p.telefono && <> Teléfono: {p.telefono}.</>}
          {p.direccion && <> Dirección: {p.direccion}.</>}
        </p>

        <h2>¿Qué datos recogemos?</h2>
        <p>
          Cédula, nombres, celular, sexo, edad o fecha de nacimiento, barrio y lugar de votación. También queda
          registrado que apoyas la campaña: esa es tu <strong>preferencia política, un dato sensible</strong>. No estás
          obligado a entregarlo; solo lo guardamos si lo autorizas de forma expresa.
        </p>

        <h2>¿Para qué los usamos?</h2>
        <ul>
          <li>Organizar la campaña: saber cuántas personas apoyan y en qué lugares votan.</li>
          <li>Contactarte para invitarte a eventos y recordarte el día de la elección.</li>
          <li>Coordinar la logística del día de elecciones (puestos, mesas y testigos).</li>
          <li>Hacer estadísticas generales en las que no se identifica a nadie.</li>
        </ul>
        <p>No vendemos ni cedemos tus datos. Solo los ve el equipo de la campaña que los necesita para su tarea, y
          los proveedores de tecnología que alojan la información, con medidas de seguridad.</p>

        <h2>¿Cuánto tiempo los guardamos?</h2>
        <p>Mientras dure la campaña y el tiempo que exija la ley después de ella. Luego se suprimen.</p>

        <h2>Tus derechos</h2>
        <ul>
          <li>Conocer qué datos tenemos de ti, actualizarlos y corregirlos.</li>
          <li>Pedir prueba de la autorización que diste.</li>
          <li>Saber cómo se han usado tus datos.</li>
          <li>Retirar tu autorización y pedir que borremos tus datos.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC), después de hacer tu solicitud aquí.</li>
        </ul>
        <p>
          Respondemos las <strong>consultas en máximo 10 días hábiles</strong> y los <strong>reclamos</strong> (corregir,
          borrar o retirar la autorización) <strong>en máximo 15 días hábiles</strong>, como dice la Ley 1581 de 2012.
        </p>
        {fecha && <p className="ayuda">Última actualización: {fecha}.</p>}
      </article>

      {radicado ? (
        <div className="tarjeta" style={{ textAlign: 'center' }}>
          <CheckCircle2 aria-hidden style={{ width: 56, height: 56, color: 'var(--ok)' }} />
          <h2>Recibimos tu solicitud</h2>
          <p className="subtitulo">Tu número de radicado es</p>
          <p className="radicado">{radicado}</p>
          <p className="ayuda">Guárdalo. Te responderemos al contacto que dejaste dentro del plazo de ley.</p>
          <button className="boton" style={{ marginTop: '1rem' }} onClick={() => setRadicado('')}>Hacer otra solicitud</button>
        </div>
      ) : (
        <form className="tarjeta formulario" onSubmit={enviar} noValidate>
          <h2>Haz tu solicitud</h2>
          <fieldset>
            <legend>¿Qué quieres?</legend>
            <div className="opciones-solicitud">
              {(Object.keys(TIPOS_SOLICITUD) as TipoSolicitud[]).map((t) => (
                <button type="button" key={t} className="opcion" aria-pressed={d.tipo === t} onClick={() => setD({ ...d, tipo: t })}>{TIPOS_SOLICITUD[t]}</button>
              ))}
            </div>
          </fieldset>
          <div className="fila-campos">
            <label className="campo"><span>Cédula</span>
              <input type="text" inputMode="numeric" value={d.cedula} onChange={(e) => setD({ ...d, cedula: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
            </label>
            <label className="campo"><span>Nombre completo</span>
              <input type="text" autoComplete="name" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} />
            </label>
          </div>
          <label className="campo"><span>Celular o correo para responderte</span>
            <input type="text" value={d.contacto} onChange={(e) => setD({ ...d, contacto: e.target.value })} />
          </label>
          <label className="campo"><span>Detalle <span className="opcional">(opcional)</span></span>
            <textarea rows={3} maxLength={2000} value={d.detalle} onChange={(e) => setD({ ...d, detalle: e.target.value })}
              placeholder={d.tipo === 'correccion' ? 'Qué dato está mal y cuál es el correcto' : ''} />
          </label>
          {error && <div className="aviso error" role="alert">{error}</div>}
          <button className="boton primario bloque" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar solicitud'}</button>
          <p className="ayuda" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck className="icono" aria-hidden /> Para proteger tus datos, la respuesta solo se da al titular.
          </p>
        </form>
      )}
    </div>
  );
}
