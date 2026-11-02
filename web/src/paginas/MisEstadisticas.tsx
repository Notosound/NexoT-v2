// Estadísticas del líder (como "Mis estadísticas" del piloto), con sus propios datos
import { useState } from 'react';
import { useEnVivo } from '../lib/enVivo';
import EnVivo from '../componentes/EnVivo';
import { CalendarDays, CheckCircle2, MapPinOff, Target, Users } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import type { Lider, PersonaFila } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';
import { contar, ORDEN_EDAD, partesSexo, resumirPersonas, serieDiaria } from '../lib/estadisticas';
import { BarrasH, Dona, Linea, Segmentos, SERIES } from '../componentes/Graficos';
import { Cifra, pct, QueEs } from '../componentes/Piezas';

export default function MisEstadisticas() {
  const { api } = useSesion();
  const [personas, setPersonas] = useState<PersonaFila[] | null>(null);
  const [ficha, setFicha] = useState<Lider | null>(null);
  const [error, setError] = useState('');
  const vivo = useEnVivo(() => Promise.all([api.personasTodas({ texto: '', estado: '' }).then(setPersonas), api.lideres().then((l) => setFicha(l[0] ?? null))])
    .catch((e) => setError(mensajeError(e))), ['registros']);

  const ps = personas ?? [];
  const r = resumirPersonas(ps);
  const estados = contar(ps, (p) => p.ubicacion_estado);
  const serie = serieDiaria(ps.map((p) => p.creado_en), 14);
  const semana = serie.slice(-7).reduce((a, p) => a + p.valor, 0);
  const meta = ficha?.meta_votos ?? 0;
  const puestos = contar(ps.filter((p) => p.puesto), (p) => p.puesto!);

  return (
    <>
      <div className="encabezado"><div><h1>Mis estadísticas</h1><p className="subtitulo">Cómo va tu equipo, actualizado al momento</p><EnVivo {...vivo} /></div></div>
      {error && <div className="aviso error">{error}</div>}
      <div className="cifras">
        <Cifra icono={Users} valor={personas ? ps.length : null} etiqueta="personas registradas" />
        <Cifra icono={CalendarDays} valor={personas ? semana : null} etiqueta="en los últimos 7 días" />
        <Cifra icono={CheckCircle2} valor={personas ? estados.get('completa') ?? 0 : null} etiqueta="con puesto y mesa" tono="ok"
          detalle={personas && ps.length ? `${pct(estados.get('completa') ?? 0, ps.length)}% de tu gente` : undefined} />
        {meta > 0 && <Cifra icono={Target} valor={personas ? `${pct(ps.length, meta)}%` : null} etiqueta={`de tu meta de ${meta}`} tono="info"
          detalle={personas && ps.length < meta ? `Te faltan ${meta - ps.length}` : personas ? '¡Meta cumplida!' : undefined} />}
      </div>

      <div className="graficos seccion">
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2>Registros por día</h2><small>últimos 14 días</small></div>
          <Linea puntos={serie} nombre="Registros" />
        </div>
        <div className="tarjeta">
          <div className="tarjeta-titulo">
            <h2>¿Saben dónde votan? <QueEs>Para contar los votos con el E14 necesitamos el puesto y la mesa de cada persona. Las que están “por revisar” o “sin dato” no se pueden contar todavía: pregúntales dónde votan.</QueEs></h2>
          </div>
          <Segmentos partes={[
            { nombre: 'Puesto y mesa', valor: estados.get('completa') ?? 0, color: SERIES[2] },
            { nombre: 'Falta la mesa', valor: estados.get('sin_mesa') ?? 0, color: SERIES[0] },
            { nombre: 'Puesto por revisar', valor: estados.get('por_revisar') ?? 0, color: SERIES[3] },
            { nombre: 'No sabe dónde vota', valor: estados.get('sin_dato') ?? 0, color: 'var(--texto-3)' },
          ]} />
        </div>
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2>Por sexo</h2></div>
          <Dona partes={partesSexo(r.sexo, [SERIES[0], SERIES[1], SERIES[2], SERIES[3], 'var(--texto-3)'])} sub="personas" />
        </div>
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2>Por edad</h2></div>
          <BarrasH filas={[...ORDEN_EDAD, 'sin dato'].filter((e) => r.edad.get(e)).map((e) => ({ nombre: e === 'sin dato' ? 'Sin dato' : `${e} años`, valores: [r.edad.get(e) ?? 0] }))} />
        </div>
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2>Dónde vota tu gente</h2><small>puestos con más personas</small></div>
          <BarrasH limite={8} filas={[...puestos.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ nombre: n, valores: [v] }))} />
          {r.sinLugar > 0 && <p className="ayuda" style={{ marginTop: '0.75rem' }}><MapPinOff className="icono" aria-hidden /> {r.sinLugar} sin lugar de votación confirmado.</p>}
        </div>
      </div>
    </>
  );
}
