// Mi cuenta: contraseña y verificación en dos pasos
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, ShieldCheck, ShieldAlert, Smartphone, Trash2 } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { ROLES, type FactorDosPasos } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';

export default function MiCuenta() {
  const { api, sesionReal } = useSesion();
  const yo = sesionReal!;
  const [factores, setFactores] = useState<FactorDosPasos[] | null>(null);
  const [inscripcion, setInscripcion] = useState<{ factorId: string; qr: string; secreto: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [verSecreto, setVerSecreto] = useState(false);

  const cargar = useCallback(() => api.factoresDosPasos().then(setFactores).catch((e) => setError(mensajeError(e))), [api]);
  useEffect(() => { cargar(); }, [cargar]);
  const activos = (factores ?? []).filter((f) => f.verificado);
  const importante = yo.perfil?.rol === 'admin' || yo.perfil?.rol === 'coordinador';

  const empezar = async () => {
    setError(''); setAviso(''); setCodigo(''); setVerSecreto(false);
    try { setInscripcion(await api.inscribirDosPasos()); } catch (e) { setError(mensajeError(e)); }
  };
  const confirmar = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try {
      await api.confirmarDosPasos(inscripcion!.factorId, codigo);
      setInscripcion(null);
      setAviso(activos.length ? 'Listo: agregaste otro celular.' : 'Listo: la verificación en dos pasos quedó activa. La próxima vez que entres te pediremos el código.');
      cargar();
    } catch (err) { setError(mensajeError(err)); setCodigo(''); }
  };
  const quitar = async (f: FactorDosPasos) => {
    setError(''); setAviso('');
    try { await api.quitarDosPasos(f.id); setAviso(`Quitamos “${f.nombre}”.`); cargar(); } catch (e) { setError(mensajeError(e)); }
  };

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Mi cuenta</h1>
          <p className="subtitulo">{yo.perfil?.nombre} · {yo.email}{yo.perfil ? ` · ${ROLES[yo.perfil.rol]}` : ''}</p>
        </div>
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}
      {aviso && <div className="aviso ok" role="status" style={{ marginBottom: '1rem' }}>{aviso}</div>}

      <div className="rejilla dos">
        <div className="tarjeta">
          <div className="tarjeta-titulo">
            <h2>{activos.length ? <ShieldCheck className="icono" aria-hidden style={{ color: 'var(--ok)' }} /> : <ShieldAlert className="icono" aria-hidden style={{ color: 'var(--aviso)' }} />} Verificación en dos pasos</h2>
            <small>{factores == null ? '' : activos.length ? 'Activa' : 'Apagada'}</small>
          </div>
          <p className="ayuda">
            Además de la contraseña, al entrar se pide un código que cambia cada 30 segundos en tu celular.
            Si alguien roba tu contraseña, igual no puede entrar.
            {importante && !activos.length && <strong> Con tu rol ves datos de muchas personas: actívala.</strong>}
          </p>

          {activos.length > 0 && (
            <ul className="factores">
              {activos.map((f) => (
                <li key={f.id}>
                  <Smartphone className="icono" aria-hidden />
                  <span>{f.nombre}</span>
                  <button className="boton chico" onClick={() => quitar(f)} title="Quitar este celular"><Trash2 className="icono" aria-hidden />Quitar</button>
                </li>
              ))}
            </ul>
          )}

          {!inscripcion ? (
            <button className={`boton${activos.length ? '' : ' primario'}`} onClick={empezar} disabled={factores == null}>
              {activos.length ? 'Agregar otro celular (respaldo)' : 'Activar verificación en dos pasos'}
            </button>
          ) : (
            <form className="formulario inscripcion-2fa" onSubmit={confirmar}>
              <ol>
                <li>Instala en tu celular <strong>Google Authenticator</strong> o <strong>Microsoft Authenticator</strong> (son gratis).</li>
                <li>En la app toca <strong>+</strong> y escanea este código:</li>
              </ol>
              <img src={inscripcion.qr} alt="Código QR para la app de verificación" className="qr-2fa" />
              <button type="button" className="enlace" onClick={() => setVerSecreto(!verSecreto)}>¿No puedes escanear? Escribe la clave a mano</button>
              {verSecreto && <code className="secreto-2fa">{inscripcion.secreto}</code>}
              <label className="campo"><span>3. Escribe el código de 6 dígitos que aparece en la app</span>
                <input className="codigo-2fa" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              </label>
              <div className="acciones">
                <button className="boton primario" disabled={codigo.length !== 6}>Confirmar</button>
                <button type="button" className="boton" onClick={() => setInscripcion(null)}>Cancelar</button>
              </div>
            </form>
          )}
          {activos.length === 1 && !inscripcion && (
            <p className="ayuda" style={{ marginTop: '0.75rem' }}>Consejo: agrega un segundo celular de confianza. Si pierdes uno, entras con el otro.</p>
          )}
        </div>

        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2><KeyRound className="icono" aria-hidden /> Contraseña</h2></div>
          <p className="ayuda">Te enviamos un enlace al correo para que pongas una contraseña nueva.</p>
          <BotonClave email={yo.email} />
        </div>
      </div>
    </>
  );
}

function BotonClave({ email }: { email: string }) {
  const { api } = useSesion();
  const [estado, setEstado] = useState<'' | 'enviando' | 'listo'>('');
  const [error, setError] = useState('');
  return (
    <>
      <button className="boton" disabled={estado !== ''} onClick={async () => {
        setEstado('enviando'); setError('');
        try { await api.recuperarClave(email); setEstado('listo'); } catch (e) { setError(mensajeError(e)); setEstado(''); }
      }}>{estado === 'listo' ? 'Revisa tu correo' : estado === 'enviando' ? 'Enviando…' : 'Cambiar contraseña'}</button>
      {error && <div className="aviso error" role="alert" style={{ marginTop: '0.5rem' }}>{error}</div>}
    </>
  );
}
