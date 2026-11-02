// Formulario para invitar a alguien: le llega un correo para crear su contraseña
import { useState, type FormEvent } from 'react';
import { Mail } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { ROLES, type Lider, type Rol } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';
import { Ventana } from './Piezas';

export const DESCRIPCION_ROL: Record<Rol, string> = {
  admin: 'Todo: importar, revisar puestos, equipo y auditoría.',
  coordinador: 'Gestiona a sus líderes y ve los registros de ellos.',
  lider: 'Registra personas, comparte su enlace y ve solo las suyas.',
  digitador: 'Transcribe los E14. No ve datos de personas.',
  candidato: 'Ve tablero, análisis y resultados: nunca nombres ni cédulas.',
};

export default function Invitar({ lideres, inicial, alCerrar, alTerminar }: {
  lideres: Lider[]; inicial?: { nombre?: string; rol?: Rol; liderId?: string };
  alCerrar: () => void; alTerminar: (mensaje: string) => void;
}) {
  const { api } = useSesion();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [rol, setRol] = useState<Rol>(inicial?.rol ?? 'lider');
  const [liderId, setLiderId] = useState(inicial?.liderId ?? '');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const fijo = !!inicial?.liderId;
  const libres = lideres.filter((l) => !l.perfil_id);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Revisa el correo.');
    if (!nombre.trim()) return setError('Escribe el nombre.');
    setEnviando(true);
    try {
      alTerminar(await api.invitarUsuario({ email: email.trim(), nombre: nombre.trim(), rol, liderId: rol === 'lider' && liderId ? liderId : null }));
    } catch (err) { setError(mensajeError(err)); } finally { setEnviando(false); }
  }

  return (
    <Ventana titulo={fijo ? `Dar acceso a ${inicial?.nombre}` : 'Invitar a alguien'} icono={Mail} alCerrar={alCerrar}>
      <p className="subtitulo">Le llega un correo con un botón para crear su contraseña. Solo verá lo que su rol permite.</p>
      <form className="formulario" onSubmit={enviar} noValidate style={{ marginTop: '1rem' }}>
        <label className="campo"><span>Correo</span>
          <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@correo.com" autoFocus />
        </label>
        <label className="campo"><span>Nombre</span><input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
        {!fijo && (
          <fieldset>
            <legend>Rol</legend>
            <div className="lista-opciones" style={{ margin: 0 }}>
              {(['lider', 'coordinador', 'digitador', 'candidato', 'admin'] as Rol[]).map((r) => (
                <label key={r} className="casilla" style={{ padding: '0.35rem 0' }}>
                  <input type="radio" name="rol" checked={rol === r} onChange={() => setRol(r)} />
                  <span><strong>{ROLES[r]}</strong> <span className="ayuda">— {DESCRIPCION_ROL[r]}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {rol === 'lider' && !fijo && (
          <label className="campo"><span>Ficha de líder</span>
            <select value={liderId} onChange={(e) => setLiderId(e.target.value)}>
              <option value="">Crear una ficha nueva con este nombre</option>
              {libres.map((l) => <option key={l.id} value={l.id}>{l.nombre} (ya existe, sin usuario)</option>)}
            </select>
            <small>Si el líder ya tiene personas registradas a su nombre, elige su ficha para que las vea.</small>
          </label>
        )}
        {error && <div className="aviso error" role="alert">{error}</div>}
        <div className="acciones" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button className="boton primario" disabled={enviando}><Mail className="icono" aria-hidden />{enviando ? 'Enviando…' : 'Enviar invitación'}</button>
        </div>
      </form>
    </Ventana>
  );
}
