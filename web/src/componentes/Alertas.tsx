// Alertas de datos sospechosos (idea del piloto: duplicados probables)
import { useEffect, useState } from 'react';
import { AlertTriangle, Phone, Timer, Users } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import type { AlertaCalidad, PersonaFila } from '../lib/tipos';
import { QueEs } from './Piezas';

const ICONO = { celular_repetido: Phone, nombre_repetido: Users, rafaga: Timer };
const QUE = {
  celular_repetido: 'Varias personas con el mismo celular: puede ser una familia, pero también registros inventados o un error al escribir.',
  nombre_repetido: 'El mismo nombre en el mismo puesto con cédulas distintas: casi siempre es la misma persona con la cédula mal escrita.',
  rafaga: 'Muchos registros manuales en pocos minutos: revisa que sean personas reales y no listas copiadas.',
};

export default function Alertas() {
  const { api } = useSesion();
  const [alertas, setAlertas] = useState<AlertaCalidad[] | null>(null);
  useEffect(() => { api.alertasCalidad().then(setAlertas).catch(() => setAlertas([])); }, [api]);
  if (!alertas) return null;
  return (
    <div className="tarjeta" style={{ marginBottom: '1rem' }}>
      <div className="tarjeta-titulo">
        <h2><AlertTriangle className="icono" aria-hidden /> Datos sospechosos <QueEs>El sistema revisa solo si hay celulares repetidos, nombres repetidos en el mismo puesto y ráfagas de registros. No borra nada: tú decides.</QueEs></h2>
        <small>{alertas.length ? `${alertas.length} para revisar` : 'nada raro'}</small>
      </div>
      {alertas.length === 0 ? <p className="ayuda">No encontramos nada sospechoso.</p> : (
        <ul className="hallazgos">
          {alertas.slice(0, 30).map((a, i) => <Grupo key={i} a={a} />)}
        </ul>
      )}
    </div>
  );
}

function Grupo({ a }: { a: AlertaCalidad }) {
  const { api } = useSesion();
  const [personas, setPersonas] = useState<PersonaFila[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const Icono = ICONO[a.tipo];
  const abrir = () => {
    setAbierto(!abierto);
    if (!personas) api.personasPorIds(a.persona_ids).then(setPersonas).catch(() => setPersonas([]));
  };
  return (
    <li className="atencion">
      <Icono aria-hidden />
      <div>
        {a.titulo} <span className="ayuda">· {a.lideres}</span>
        <div className="ayuda" style={{ marginTop: 2 }}>{QUE[a.tipo]}</div>
        {abierto && (
          personas == null ? <p className="ayuda">Cargando…</p> : (
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', fontSize: '0.9rem' }}>
              {personas.map((p) => <li key={p.id}>{p.nombres} {p.apellidos} · C.C. {p.cedula} · {p.telefono ?? 'sin celular'} · {p.puesto ?? 'sin puesto'} · {p.lider}</li>)}
            </ul>
          )
        )}
      </div>
      <button className="ir" onClick={abrir}>{abierto ? 'Ocultar' : `Ver ${a.personas} →`}</button>
    </li>
  );
}
