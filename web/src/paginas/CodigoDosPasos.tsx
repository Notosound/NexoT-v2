// Segundo paso al entrar: el código de 6 dígitos de la app del celular
import { useState, type FormEvent } from 'react';
import { Smartphone } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { mensajeError } from '../lib/utilidades';

export default function CodigoDosPasos() {
  const { api, sesion, recargar } = useSesion();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const verificar = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setEnviando(true);
    try { await api.verificarCodigo(codigo); await recargar(); }
    catch (err) { setError(mensajeError(err)); setCodigo(''); }
    finally { setEnviando(false); }
  };

  return (
    <div className="entrada">
      <div className="tarjeta">
        <div className="logo"><img src="/icono.svg" alt="" /><h1 style={{ margin: 0 }}>NexoT</h1></div>
        <h2 style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><Smartphone className="icono" aria-hidden />Código de verificación</h2>
        <p className="ayuda">Abre la app de códigos de tu celular (Google Authenticator, Microsoft Authenticator…) y escribe el código de NexoT.</p>
        <p className="ayuda">{sesion?.email}</p>
        <form className="formulario" onSubmit={verificar}>
          <label className="campo"><span>Código de 6 dígitos</span>
            <input className="codigo-2fa" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6}
              value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </label>
          {error && <div className="aviso error" role="alert">{error}</div>}
          <button className="boton primario bloque" disabled={enviando || codigo.length !== 6}>{enviando ? 'Verificando…' : 'Entrar'}</button>
          <button type="button" className="enlace" onClick={() => api.cerrarSesion()}>Usar otra cuenta</button>
          <p className="ayuda">¿Perdiste el celular? Pídele a un administrador de la campaña que te quite la verificación desde Equipo.</p>
        </form>
      </div>
    </div>
  );
}
