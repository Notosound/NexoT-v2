import { useSesion } from '../lib/sesion';

export default function SinAcceso() {
  const { api, sesion } = useSesion();
  return (
    <div className="entrada">
      <div className="tarjeta">
        <h1>Aún no tienes acceso</h1>
        <p>Tu cuenta <strong>{sesion?.email}</strong> existe, pero un administrador todavía no te ha asignado un rol, o tu acceso fue desactivado.</p>
        <p className="ayuda">Pídele al administrador de la campaña que te agregue en la sección “Equipo”.</p>
        <button className="boton" onClick={() => api.cerrarSesion()}>Salir</button>
      </div>
    </div>
  );
}
