// E14 → Cómo funciona: el recorrido completo con imágenes de ejemplo
// (formularios INVENTADOS, generados por scripts/demo/generar_ejemplos_e14.py).
import { useState } from 'react';
import { ArrowRight, CheckCircle2, Download, FileSpreadsheet, Keyboard, ScanLine, Scale, ShieldCheck, Upload } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import type { Eleccion, ResultadoLectura } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';
import { leerCsv } from './LecturasE14';

type Ir = (vista: string) => void;

export default function E14Guia({ eleccion, ir, onCambio }: { eleccion: Eleccion | undefined; ir: Ir; onCambio: () => void }) {
  const { sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const esAdmin = rol === 'admin';
  const puedeDigitar = rol === 'admin' || rol === 'digitador';

  return (
    <div className="e14-guia">
      <div className="tarjeta">
        <h2>¿Qué es esto?</h2>
        <p>
          El día de la elección, en cada mesa los jurados llenan el <strong>formulario E14</strong> con los votos de cada candidato,
          y la Registraduría publica una foto de cada uno. Aquí se pasan esos votos a NexoT para ver, mesa por mesa,
          <strong> cuántos votos sacó el candidato frente a los simpatizantes que la campaña tenía registrados</strong>.
        </p>
        <p className="ayuda" style={{ marginBottom: 0 }}>
          Para no equivocarse, cada mesa se pasa <strong>dos veces</strong> por caminos distintos. Si las dos coinciden, la mesa queda
          verificada; si no, un administrador mira la foto y decide.
        </p>
      </div>

      <h2 className="e14-guia-titulo">El recorrido de una mesa</h2>
      <ol className="e14-flujo">
        <li>
          <span className="paso-n">1</span>
          <figure><a href="/ejemplos-e14/e14_ejemplo.jpg" target="_blank" rel="noreferrer" title="Ver en grande"><img src="/ejemplos-e14/e14_ejemplo.jpg" alt="Formulario E14 inventado de ejemplo" loading="lazy" /></a></figure>
          <h3>La Registraduría publica el E14</h3>
          <p>Una foto por mesa. El <strong>lector</strong> (un programa que corre en un computador de la campaña) las descarga sin saturar el portal.</p>
        </li>
        <li>
          <span className="paso-n">2</span>
          <figure><a href="/ejemplos-e14/calibracion_ejemplo.jpg" target="_blank" rel="noreferrer" title="Ver en grande"><img className="contener" src="/ejemplos-e14/calibracion_zoom.jpg" alt="El formulario con la casilla del candidato marcada en rojo" loading="lazy" /></a></figure>
          <h3>Recorta la casilla del candidato</h3>
          <p>Se le indica una vez dónde está la casilla (rectángulo rojo). De cada E14 recorta solo ese pedazo y lee el número.</p>
        </li>
        <li>
          <span className="paso-n">3</span>
          <figure className="dos"><img src="/ejemplos-e14/recorte_claro.png" alt="Recorte claro" loading="lazy" /><img src="/ejemplos-e14/recorte_borroso.png" alt="Recorte borroso" loading="lazy" /></figure>
          <h3>Claro o dudoso</h3>
          <p><strong>Claro:</strong> cuenta como 1.ª digitación. <strong>Dudoso</strong> (borroso, un 1 que parece 7): va a la cola “Revisar con la imagen”.</p>
        </li>
        <li>
          <span className="paso-n">4</span>
          <div className="paso-icono"><Keyboard aria-hidden /></div>
          <h3>Una persona lo confirma</h3>
          <p>El digitador ve el recorte y escribe el número. Así cada mesa tiene siempre una mirada humana.</p>
        </li>
        <li>
          <span className="paso-n">5</span>
          <div className="paso-icono ok"><ShieldCheck aria-hidden /></div>
          <h3>Verificada o diferencia</h3>
          <p>Si las dos lecturas coinciden, la mesa queda <strong>verificada</strong>. Si no, aparece en <strong>Diferencias</strong> para el administrador.</p>
        </li>
      </ol>

      <h2 className="e14-guia-titulo">Tres formas de pasar los votos <small>(se pueden mezclar)</small></h2>
      <div className="e14-formas">
        <Forma icono={ScanLine} titulo="Lectura automática" cuando="Para miles de mesas: el lector hace el trabajo pesado y la gente solo confirma lo dudoso."
          boton={puedeDigitar ? 'Ir a Lectura automática' : undefined} alIr={() => ir('lecturas')} recomendada />
        <Forma icono={Keyboard} titulo="Digitar a mano" cuando="Mesa por mesa mirando la foto. También es la 2.ª digitación de lo que leyó el lector."
          boton={puedeDigitar ? 'Ir a Digitar' : undefined} alIr={() => ir('digitar')} />
        <Forma icono={FileSpreadsheet} titulo="Subir un Excel" cuando="Cuando un equipo trae las cifras en la plantilla oficial de mesas (descárgala ahí mismo)."
          boton={puedeDigitar ? 'Ir a Subir Excel' : undefined} alIr={() => ir('excel')} />
      </div>
      <div className="e14-formas" style={{ marginTop: '0.75rem' }}>
        <Forma icono={Scale} titulo="Diferencias" cuando="Mesas cuyas dos digitaciones no coinciden: el administrador mira la foto y elige el valor."
          boton={esAdmin ? 'Ir a Diferencias' : undefined} alIr={() => ir('revisar')} />
        <Forma icono={CheckCircle2} titulo="Resultados" cuando="Votos frente a simpatizantes por localidad, puesto, mesa y líder. Solo cuentan mesas verificadas."
          boton={rol !== 'digitador' ? 'Ir a Resultados' : undefined} alIr={() => ir('resultados')} />
      </div>

      <Ejemplo eleccion={eleccion} esAdmin={esAdmin} ir={ir} onCambio={onCambio} />
    </div>
  );
}

function Forma({ icono: Icono, titulo, cuando, boton, alIr, recomendada }: {
  icono: typeof ScanLine; titulo: string; cuando: string; boton?: string; alIr: () => void; recomendada?: boolean;
}) {
  return (
    <div className={`tarjeta e14-forma${recomendada ? ' recomendada' : ''}`}>
      <div className="e14-forma-cabeza"><span className="ficha-icono"><Icono aria-hidden /></span><h3>{titulo}</h3>
        {recomendada && <span className="chip">recomendada</span>}</div>
      <p>{cuando}</p>
      {boton && <button className="boton chico" onClick={alIr}>{boton}<ArrowRight className="icono" aria-hidden /></button>}
    </div>
  );
}

function Ejemplo({ eleccion, esAdmin, ir, onCambio }: { eleccion: Eleccion | undefined; esAdmin: boolean; ir: Ir; onCambio: () => void }) {
  const { api, vista } = useSesion();
  const [estado, setEstado] = useState<'' | 'cargando' | 'listo'>('');
  const [reporte, setReporte] = useState<ResultadoLectura[] | null>(null);
  const [error, setError] = useState('');
  // Solo en una elección de práctica, para no mezclar datos inventados con una elección real
  const dePractica = !!eleccion && /simulacro|prueba|pr[aá]ctica|ejemplo|demo/i.test(eleccion.nombre);

  const cargar = async () => {
    if (!eleccion) return;
    setError(''); setEstado('cargando');
    try {
      const texto = await (await fetch('/ejemplos-e14/lecturas_ejemplo.csv')).text();
      const filas = leerCsv(texto).map((f) => ({ ...f, recorte: f.recorte ? `ejemplo/${f.recorte}` : '' }));
      const r = await api.cargarLecturasE14(eleccion.id, filas, []);
      setReporte(r); setEstado('listo'); onCambio();
    } catch (e) { setError(mensajeError(e)); setEstado(''); }
  };
  const n = (e: ResultadoLectura['estado']) => (reporte ?? []).filter((x) => x.estado === e).length;

  return (
    <div className="tarjeta e14-ejemplo">
      <h2>Pruébalo con un ejemplo</h2>
      <p>
        Preparamos 36 formularios E14 <strong>inventados</strong> (no son reales) y los pasamos por el lector de verdad.
        Leyó bien unos y dudó en otros: justo lo que pasa con fotos reales. Así queda lo que entrega el lector:
      </p>
      <div className="e14-ejemplo-acciones">
        <a className="boton" href="/ejemplos-e14/paquete_ejemplo.zip" download><Download className="icono" aria-hidden />Paquete del lector (.zip)</a>
        <a className="boton" href="/ejemplos-e14/lecturas_ejemplo.csv" download><Download className="icono" aria-hidden />Solo lecturas.csv</a>
        {esAdmin && !vista && dePractica && (
          <button className="boton primario" onClick={cargar} disabled={estado === 'cargando'}>
            <Upload className="icono" aria-hidden />{estado === 'cargando' ? 'Cargando…' : `Cargar el ejemplo en “${eleccion!.nombre}”`}
          </button>
        )}
      </div>
      {esAdmin && !dePractica && (
        <p className="ayuda">Para cargar el ejemplo con un clic, crea en “Elecciones” una elección de práctica (por ejemplo “Simulacro”):
          así nunca se mezcla con una elección real. También puedes descomprimir el paquete y subirlo en “Lectura automática”.</p>
      )}
      {error && <div className="aviso error" role="alert">{error}</div>}
      {reporte && (
        <div className="aviso ok" role="status">
          Ejemplo cargado: {n('automatica')} lecturas claras, {n('por_revisar')} para revisar con la imagen
          {n('omitida') ? ` y ${n('omitida')} que ya estaban revisadas` : ''}{n('error') ? `; ${n('error')} mesas del ejemplo no existen en esta elección` : ''}.{' '}
          <button className="enlace" onClick={() => ir('lecturas')}>Ver la cola de revisión</button>
        </div>
      )}
    </div>
  );
}
