import { useState, type FormEvent } from 'react';
import { useSesion } from '../lib/sesion';
import { ROLES, type Rol } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';

export default function Entrar() {
  const { api } = useSesion();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [rolDemo, setRolDemo] = useState<Rol>('admin');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const demo = api.modo === 'demo';

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setError(''); setAviso(''); setEnviando(true);
    try {
      await api.iniciarSesion(email, clave, rolDemo);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function olvide() {
    setError(''); setAviso('');
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Escribe tu correo arriba y vuelve a intentar.'); return; }
    try {
      await api.recuperarClave(email);
      setAviso('Si el correo está registrado, te llegará un enlace para crear una contraseña nueva.');
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  return (
    <div className="entrada">
      <div className="tarjeta">
        <div className="logo"><img src="/icono.svg" alt="" /><h1 style={{ margin: 0 }}>NexoT</h1></div>
        {demo && <div className="aviso info" style={{ marginBottom: '1rem' }}>Modo demostración: entra con cualquier correo y contraseña, y elige el rol que quieres ver.</div>}
        <form className="formulario" onSubmit={entrar}>
          <label className="campo"><span>Correo</span>
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="campo"><span>Contraseña</span>
            <input type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
          {demo && (
            <label className="campo"><span>Ver como</span>
              <select value={rolDemo} onChange={(e) => setRolDemo(e.target.value as Rol)}>
                {Object.entries(ROLES).map(([r, t]) => <option key={r} value={r}>{t}</option>)}
              </select>
            </label>
          )}
          {error && <div className="aviso error" role="alert">{error}</div>}
          {aviso && <div className="aviso ok">{aviso}</div>}
          <button className="boton primario bloque" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
          {!demo && <button type="button" className="enlace" onClick={olvide}>Olvidé mi contraseña</button>}
        </form>
      </div>
    </div>
  );
}
