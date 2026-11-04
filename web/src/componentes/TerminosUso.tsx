// Texto de los términos de uso y compromiso de confidencialidad del equipo.
// Si se cambia algo importante, se sube TERMINOS_VERSION en tipos.ts.
export default function TerminosUso({ campana }: { campana: string | null }) {
  return (
    <div className="politica terminos">
      <h2>1. Para qué es esta plataforma</h2>
      <p>NexoT es una herramienta interna de {campana ?? 'la campaña'} para organizar simpatizantes, líderes, eventos, seguimiento y resultados electorales.
        Solo la usa el equipo autorizado, con el rol que le asignó un administrador.</p>
      <h2>2. Datos personales y confidencialidad</h2>
      <ul>
        <li>Aquí hay datos personales de muchas personas, incluido un <strong>dato sensible</strong>: su preferencia política (Ley 1581 de 2012).</li>
        <li>Te comprometes a usarlos <strong>solo para las tareas de la campaña</strong> que te corresponden.</li>
        <li>No los compartes, no los vendes, no los publicas y no los pasas a otras campañas, partidos o personas, ni durante ni después de la campaña.</li>
        <li>Solo registras personas que te dieron su autorización, y respetas a quien no quiere ser contactado.</li>
        <li>Si descargas un Excel, lo guardas en un lugar seguro y lo borras cuando ya no lo necesites.</li>
      </ul>
      <h2>3. Tu cuenta</h2>
      <ul>
        <li>Tu usuario es personal: no prestas tu contraseña ni dejas la sesión abierta en equipos ajenos.</li>
        <li>Si crees que alguien entró con tu cuenta, avisa de inmediato a un administrador.</li>
        <li>Se recomienda activar la verificación en dos pasos (en Mi cuenta); para administradores y coordinadores es lo esperado.</li>
      </ul>
      <h2>4. Registro de actividad</h2>
      <p>La plataforma registra quién crea, cambia o borra información, quién exporta datos y cuándo. Ese registro no se puede borrar y puede revisarse
        ante cualquier uso indebido.</p>
      <h2>5. Consecuencias</h2>
      <p>El uso indebido lleva al retiro inmediato del acceso y puede tener consecuencias legales: la Ley 1581 de 2012 prevé sanciones de la
        Superintendencia de Industria y Comercio, y el artículo 269F del Código Penal (Ley 1273 de 2009) castiga la violación de datos personales.</p>
      <h2>6. Sobre las cifras</h2>
      <p>Las cifras, proyecciones y simulaciones son estimaciones basadas en los datos registrados por el equipo: ayudan a tomar decisiones pero no son
        resultados oficiales. Los resultados oficiales son los de la Registraduría Nacional del Estado Civil.</p>
    </div>
  );
}
