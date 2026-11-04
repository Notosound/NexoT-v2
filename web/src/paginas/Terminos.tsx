// Términos de uso: aceptación obligatoria la primera vez, y consulta después.
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { TERMINOS_VERSION } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';
import TerminosUso from '../componentes/TerminosUso';

/** Pantalla que bloquea la entrada hasta aceptar los términos */
export function AceptarTerminos() {
  const { api, sesion, recargar } = useSesion();
  const [acepto, setAcepto] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const aceptar = async () => {
    setError(''); setEnviando(true);
    try { await api.aceptarTerminos(TERMINOS_VERSION); await recargar(); } catch (e) { setError(mensajeError(e)); } finally { setEnviando(false); }
  };
  return (
    <div className="entrada terminos-entrada">
      <div className="tarjeta">
        <div className="logo"><img src="/icono.svg" alt="" /><h1 style={{ margin: 0 }}>NexoT</h1></div>
        <h2 style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><ShieldCheck className="icono" aria-hidden />Antes de empezar</h2>
        <p className="ayuda">Hola, {sesion?.perfil?.nombre.split(' ')[0]}. Vas a ver datos personales de muchas personas. Lee y acepta estas reglas: toma un minuto.</p>
        <div className="terminos-caja"><TerminosUso campana={sesion?.organizacion ?? null} /></div>
        <label className="casilla" style={{ marginTop: '0.75rem' }}>
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
          <span>Leí y acepto los términos de uso y el compromiso de confidencialidad.</span>
        </label>
        {error && <div className="aviso error" role="alert">{error}</div>}
        <button className="boton primario bloque" disabled={!acepto || enviando} onClick={aceptar}>{enviando ? 'Guardando…' : 'Aceptar y entrar'}</button>
        <button type="button" className="enlace" onClick={() => api.cerrarSesion()}>No acepto, salir</button>
      </div>
    </div>
  );
}

/** Consulta de los términos desde el pie de página */
export default function Terminos() {
  const { sesion } = useSesion();
  return (
    <>
      <div className="encabezado"><div><h1>Términos de uso</h1><p className="ayuda">Versión {TERMINOS_VERSION}</p></div></div>
      <div className="tarjeta" style={{ maxWidth: 820 }}><TerminosUso campana={sesion?.organizacion ?? null} /></div>
    </>
  );
}
