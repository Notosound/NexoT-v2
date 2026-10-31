import { useCallback, useEffect, useState } from 'react';
import SelectorPuesto from '../componentes/SelectorPuesto';
import { useSesion } from '../lib/sesion';
import type { GrupoRevision, Localidad, Puesto } from '../lib/tipos';
import { formatoNumero, mensajeError } from '../lib/utilidades';

const METODOS: Record<string, string> = {
  misma_cuadra: 'misma cuadra',
  nombre_parecido: 'nombre parecido',
  nombre_oficial: 'nombre oficial',
  alias: 'nombre ya aprendido',
  direccion: 'misma dirección',
};

function Grupo({ g, localidades, onResuelto }: { g: GrupoRevision; localidades: Localidad[]; onResuelto: (n: number, puesto: string) => void }) {
  const { api } = useSesion();
  const [eligiendo, setEligiendo] = useState(false);
  const [localidadId, setLocalidadId] = useState<number | null>(g.localidad_id);
  const [puesto, setPuesto] = useState<Puesto | null>(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function resolver(puestoId: number, nombre: string) {
    setEnviando(true); setError('');
    try {
      const n = await api.resolverUbicacion(g.persona_ejemplo, puestoId);
      onResuelto(n, nombre);
    } catch (e) {
      setError(mensajeError(e));
      setEnviando(false);
    }
  }

  return (
    <div className="tarjeta">
      <div className="encabezado" style={{ marginBottom: '0.5rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.2rem' }}>“{g.puesto_reportado ?? g.direccion_reportada}”</h2>
          <p className="ayuda">
            {g.localidad ?? 'Sin localidad'} · {formatoNumero(g.personas)} {g.personas === 1 ? 'persona' : 'personas'}
            {g.puesto_reportado && g.direccion_reportada && <> · dirección: {g.direccion_reportada}</>}
          </p>
        </div>
      </div>

      {!eligiendo && g.sugerencia_puesto_id && (
        <div className="aviso atencion" style={{ marginBottom: '0.75rem' }}>
          <p>Sugerencia ({METODOS[g.sugerencia_metodo ?? ''] ?? g.sugerencia_metodo}): <strong>{g.sugerencia_puesto}</strong> <small>{g.sugerencia_direccion}</small></p>
        </div>
      )}

      {eligiendo && (
        <div className="formulario" style={{ marginBottom: '0.75rem' }}>
          {!g.localidad_id && (
            <label className="campo"><span>Localidad</span>
              <select value={localidadId ?? ''} onChange={(e) => { setLocalidadId(e.target.value ? Number(e.target.value) : null); setPuesto(null); }}>
                <option value="">Elige…</option>
                {localidades.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </label>
          )}
          {localidadId && <SelectorPuesto localidadId={localidadId} elegido={puesto} onElegir={setPuesto} etiqueta="Puesto oficial correcto" />}
        </div>
      )}

      {error && <div className="aviso error" role="alert" style={{ marginBottom: '0.75rem' }}>{error}</div>}

      <div className="acciones">
        {!eligiendo && g.sugerencia_puesto_id && (
          <button className="boton primario" disabled={enviando} onClick={() => resolver(g.sugerencia_puesto_id!, g.sugerencia_puesto!)}>
            Sí, es {g.sugerencia_puesto}
          </button>
        )}
        {!eligiendo && <button className="boton" onClick={() => setEligiendo(true)}>{g.sugerencia_puesto_id ? 'Es otro puesto' : 'Elegir puesto'}</button>}
        {eligiendo && (
          <>
            <button className="boton primario" disabled={!puesto || enviando} onClick={() => puesto && resolver(puesto.id, puesto.nombre)}>Confirmar</button>
            <button className="boton" onClick={() => { setEligiendo(false); setPuesto(null); }}>Cancelar</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Revision() {
  const { api } = useSesion();
  const [grupos, setGrupos] = useState<GrupoRevision[] | null>(null);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    api.porRevisar().then(setGrupos).catch((e) => setError(mensajeError(e)));
  }, [api]);

  useEffect(() => {
    cargar();
    api.localidades().then(setLocalidades).catch(() => {});
  }, [api, cargar]);

  const total = grupos?.reduce((s, g) => s + g.personas, 0) ?? 0;

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Puestos por revisar</h1>
          <p>{grupos ? `${formatoNumero(total)} personas en ${formatoNumero(grupos.length)} nombres distintos` : 'Cargando…'}</p>
        </div>
      </div>
      <div className="aviso info" style={{ marginBottom: '1rem' }}>
        <p>Cada tarjeta agrupa a quienes escribieron el mismo puesto. Al confirmar, todas quedan ubicadas (cada una con su mesa) y el sistema <strong>aprende ese nombre</strong>: quien lo vuelva a escribir se ubicará solo.</p>
      </div>
      {mensaje && <div className="aviso ok" role="status" style={{ marginBottom: '1rem' }}>{mensaje}</div>}
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}
      {grupos?.length === 0 && <div className="tarjeta vacio">No hay puestos por revisar.</div>}
      {grupos?.map((g) => (
        <Grupo
          key={`${g.localidad_id}|${g.puesto_reportado}|${g.direccion_reportada}`}
          g={g}
          localidades={localidades}
          onResuelto={(n, puesto) => {
            setMensaje(`${formatoNumero(n)} ${n === 1 ? 'persona ubicada' : 'personas ubicadas'} en ${puesto}. Nombre aprendido.`);
            setGrupos((gs) => gs?.filter((x) => x !== g) ?? null);
            cargar();
          }}
        />
      ))}
    </>
  );
}
