import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSesion } from '../lib/sesion';
import { mensajeError } from '../lib/utilidades';

export default function CambiarClave() {
  const { api, sesion, claveCambiada } = useSesion();
  const [clave, setClave] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const ir = useNavigate();

  if (!sesion) {
    return (
      <div className="entrada"><div className="tarjeta">
        <h1>Enlace vencido</h1>
        <p>El enlace ya no es válido. Pide uno nuevo con “Olvidé mi contraseña”.</p>
        <a className="boton" href="/">Ir a entrar</a>
      </div></div>
    );
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (clave.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (clave !== repetir) { setError('Las dos contraseñas no coinciden.'); return; }
    try {
      await api.cambiarClave(clave);
      setListo(true);
      history.replaceState(null, '', '/');
      setTimeout(() => { claveCambiada(); ir('/'); }, 1200);
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  return (
    <div className="entrada">
      <div className="tarjeta">
        <h1>Crea tu contraseña</h1>
        <p className="ayuda">{sesion.email}</p>
        <form className="formulario" onSubmit={guardar}>
          <label className="campo"><span>Contraseña nueva</span>
            <input type="password" autoComplete="new-password" minLength={8} required value={clave} onChange={(e) => setClave(e.target.value)} />
            <small>Mínimo 8 caracteres.</small>
          </label>
          <label className="campo"><span>Repítela</span>
            <input type="password" autoComplete="new-password" required value={repetir} onChange={(e) => setRepetir(e.target.value)} />
          </label>
          {error && <div className="aviso error" role="alert">{error}</div>}
          {listo && <div className="aviso ok">Contraseña guardada.</div>}
          <button className="boton primario bloque" disabled={listo}>Guardar</button>
        </form>
      </div>
    </div>
  );
}
