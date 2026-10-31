import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSesion } from '../lib/sesion';
import { ROLES, type Lider, type MiembroEquipo, type Rol } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';

const DESCRIPCION: Record<Rol, string> = {
  admin: 'Todo: importar, revisar puestos, equipo y auditoría.',
  coordinador: 'Gestiona a sus líderes y ve sus registros.',
  lider: 'Registra personas y ve solo las suyas.',
  digitador: 'Transcribe los E14. No ve datos de personas.',
  candidato: 'Ve solo cifras agregadas: nunca nombres ni cédulas.',
};

export default function Equipo() {
  const { api, sesion } = useSesion();
  const [equipo, setEquipo] = useState<MiembroEquipo[] | null>(null);
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('lider');
  const [liderId, setLiderId] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    api.equipo().then(setEquipo).catch((e) => setError(mensajeError(e)));
    api.lideres().then(setLideres).catch(() => {});
  }, [api]);
  useEffect(cargar, [cargar]);

  async function vincular(e: FormEvent) {
    e.preventDefault();
    setError(''); setMensaje(''); setEnviando(true);
    try {
      await api.vincularUsuario(email.trim(), nombre.trim(), rol, rol === 'lider' && liderId ? liderId : null);
      setMensaje(`${nombre.trim()} ya tiene acceso como ${ROLES[rol].toLowerCase()}.`);
      setEmail(''); setNombre(''); setLiderId('');
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function desactivar(m: MiembroEquipo) {
    if (!confirm(`¿Quitar el acceso a ${m.nombre}? Podrás devolvérselo vinculándolo otra vez.`)) return;
    try {
      await api.desactivarUsuario(m.id);
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  const fichasLibres = lideres.filter((l) => !l.perfil_id);

  return (
    <>
      <div className="encabezado"><div><h1>Equipo</h1><p>Quién entra al sistema y con qué rol.</p></div></div>
      {mensaje && <div className="aviso ok" role="status" style={{ marginBottom: '1rem' }}>{mensaje}</div>}
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      <form className="tarjeta formulario" onSubmit={vincular}>
        <h2>Dar acceso a una persona</h2>
        {api.modo === 'real' && (
          <div className="aviso info">
            <p><strong>Paso 1:</strong> en Supabase → Authentication → Users → <em>Invite user</em>, invita su correo. Le llega un enlace para crear su contraseña.</p>
            <p><strong>Paso 2:</strong> aquí, asígnale nombre y rol.</p>
          </div>
        )}
        <div className="fila-campos">
          <label className="campo"><span>Correo</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="campo"><span>Nombre</span><input type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
        </div>
        <label className="campo"><span>Rol</span>
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
            {(Object.keys(ROLES) as Rol[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
          </select>
          <small>{DESCRIPCION[rol]}</small>
        </label>
        {rol === 'lider' && (
          <label className="campo"><span>Ficha de líder</span>
            <select value={liderId} onChange={(e) => setLiderId(e.target.value)}>
              <option value="">Crear una ficha nueva con su nombre</option>
              {fichasLibres.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
            <small>Si el líder ya existe (por ejemplo, con personas importadas), elígelo para que vea a sus registrados.</small>
          </label>
        )}
        <div><button className="boton primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Dar acceso'}</button></div>
      </form>

      <div className="envoltura-tabla" style={{ marginTop: '1rem' }}>
        <table className="tabla apilable">
          <thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th><span className="oculto-visual">Acciones</span></th></tr></thead>
          <tbody>
            {equipo?.map((m) => (
              <tr key={m.id}>
                <td className="principal">{m.nombre}<small>{m.email}</small></td>
                <td data-etiqueta="Rol">{ROLES[m.rol]}</td>
                <td data-etiqueta="Estado">{m.activo ? <span className="insignia completa">Activo</span> : <span className="insignia sin_dato">Sin acceso</span>}</td>
                <td data-etiqueta="">{m.activo && m.id !== sesion!.usuarioId && <button className="boton chico peligro" onClick={() => desactivar(m)}>Quitar acceso</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {equipo === null && <div className="vacio">Cargando…</div>}
      </div>
    </>
  );
}
