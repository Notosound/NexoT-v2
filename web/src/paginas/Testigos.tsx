// Testigos electorales: quién cuida cada mesa el día de la elección.
// Prioriza las mesas donde hay simpatizantes y todavía no hay testigo.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, ShieldAlert, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { useEnVivo } from '../lib/enVivo';
import type { CoberturaMesa, Eleccion, PersonaFila, Puesto, Testigo } from '../lib/tipos';
import { mensajeError, normalizar } from '../lib/utilidades';
import EnVivo from '../componentes/EnVivo';
import { BarrasH } from '../componentes/Graficos';
import { Cifra, Plegable, QueEs, pct } from '../componentes/Piezas';
import { enlaceWhatsApp } from './Seguimiento';

export default function Testigos() {
  const { api } = useSesion();
  const [elecciones, setElecciones] = useState<Eleccion[] | null>(null);
  const [eleccionId, setEleccionId] = useState('');
  const [cobertura, setCobertura] = useState<CoberturaMesa[]>([]);
  const [cargado, setCargado] = useState(false);
  const [testigos, setTestigos] = useState<Testigo[]>([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [puestoInicial, setPuestoInicial] = useState<{ id: number; nombre: string; localidadId: number } | null>(null);

  useEffect(() => {
    api.elecciones().then((es) => { setElecciones(es); setEleccionId((x) => x || es[0]?.id || ''); }).catch((e) => setError(mensajeError(e)));
  }, [api]);
  const vivo = useEnVivo(async () => {
    if (!eleccionId) return;
    const [c, t] = await Promise.all([api.coberturaTestigos(eleccionId), api.testigos(eleccionId)]);
    setCobertura(c); setTestigos(t); setCargado(true);
  }, ['registros']);
  useEffect(() => { vivo.recargar(); }, [eleccionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const mesas = cobertura.length;
  const cubiertas = cobertura.filter((c) => c.cubierta).length;
  const enRiesgo = cobertura.filter((c) => !c.cubierta).reduce((a, c) => a + c.simpatizantes, 0);
  const porPuesto = useMemo(() => {
    const m = new Map<number, { nombre: string; localidadId: number; localidad: string; sin: number; mesasSin: number[]; total: number }>();
    for (const c of cobertura) {
      const x = m.get(c.puesto_id) ?? { nombre: c.puesto, localidadId: c.localidad_id, localidad: c.localidad, sin: 0, mesasSin: [], total: 0 };
      x.total += c.simpatizantes;
      if (!c.cubierta) { x.sin += c.simpatizantes; x.mesasSin.push(c.mesa); }
      m.set(c.puesto_id, x);
    }
    return [...m.entries()].filter(([, x]) => x.sin > 0).sort((a, b) => b[1].sin - a[1].sin);
  }, [cobertura]);

  const quitar = async (t: Testigo) => {
    if (!confirm(`¿Quitar a ${t.nombres} como testigo de ${t.puesto}?`)) return;
    try { await api.quitarTestigo(t.id); setAviso(`${t.nombres} ya no es testigo.`); vivo.recargar(); } catch (e) { setError(mensajeError(e)); }
  };

  if (elecciones && elecciones.length === 0) {
    return <><h1>Testigos electorales</h1><div className="tarjeta vacio">Primero crea la elección en E14 → Elecciones.</div></>;
  }

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Testigos electorales</h1>
          <p className="subtitulo">Quién cuida cada mesa el día de la elección y toma la foto del E14.</p>
          <EnVivo {...vivo} />
        </div>
        {elecciones && elecciones.length > 1 && (
          <label className="campo" style={{ minWidth: 220 }}><span>Elección</span>
            <select value={eleccionId} onChange={(e) => setEleccionId(e.target.value)}>
              {elecciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
        )}
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}
      {aviso && <div className="aviso ok" role="status" style={{ marginBottom: '1rem' }}>{aviso}</div>}

      <div className="cifras">
        <Cifra icono={ShieldCheck} valor={cargado ? `${pct(cubiertas, mesas)}%` : null} etiqueta="de las mesas con simpatizantes tienen testigo" tono="ok" detalle={`${cubiertas} de ${mesas} mesas`} />
        <Cifra icono={ShieldAlert} valor={cargado ? mesas - cubiertas : null} etiqueta="mesas sin testigo" tono={mesas - cubiertas ? 'aviso' : undefined} detalle={`${enRiesgo} simpatizantes en ellas`} />
        <Cifra icono={Users} valor={cargado ? testigos.length : null} etiqueta="testigos asignados" />
      </div>

      <div className="graficos seccion">
        <div className="tarjeta">
          <div className="tarjeta-titulo">
            <h2>Dónde faltan testigos <QueEs>Puestos con más simpatizantes en mesas que todavía no tienen testigo. Ahí es donde más votos se pueden perder si nadie vigila el conteo. Toca un puesto para asignarle un testigo.</QueEs></h2>
          </div>
          <BarrasH limite={10} vacio={cargado ? 'Todas las mesas con simpatizantes tienen testigo.' : 'Cargando…'}
            filas={porPuesto.map(([, x]) => ({ nombre: x.nombre, valores: [x.sin], detalle: `${x.localidad} · mesas sin testigo: ${x.mesasSin.sort((a, b) => a - b).join(', ')}` }))}
            alElegir={(n) => { const e = porPuesto.find(([, x]) => x.nombre === n); if (e) setPuestoInicial({ id: e[0], nombre: e[1].nombre, localidadId: e[1].localidadId }); }} />
        </div>
        <Asignar eleccionId={eleccionId} puestoInicial={puestoInicial} cobertura={cobertura}
          alTerminar={(m) => { setAviso(m); setPuestoInicial(null); vivo.recargar(); }} />
      </div>

      <div className="seccion">
        <Plegable titulo="Testigos asignados" cuenta={`${testigos.length}`}>
          {testigos.length === 0 ? <p className="vacio">Todavía no hay testigos.</p> : (
            <div className="envoltura-tabla"><table className="tabla apilable">
              <thead><tr><th>Testigo</th><th>Puesto</th><th>Mesas</th><th /></tr></thead>
              <tbody>{testigos.map((t) => {
                const wa = enlaceWhatsApp(t.telefono, `Hola ${t.nombres}, gracias por ser testigo electoral. Te corresponde ${t.puesto}${t.mesas.length ? `, mesas ${t.mesas.join(', ')}` : ''}. Recuerda tomar foto clara del E14 de cada mesa.`);
                return (
                  <tr key={t.id}>
                    <td className="principal">{t.nombres} {t.apellidos}<small>C.C. {t.cedula} · {t.telefono}{t.lider ? ` · ${t.lider}` : ''}</small></td>
                    <td data-etiqueta="Puesto">{t.puesto}<small>{t.localidad}</small></td>
                    <td data-etiqueta="Mesas">{t.mesas.length ? t.mesas.join(', ') : 'Todo el puesto'}</td>
                    <td data-etiqueta="">
                      <div className="acciones">
                        {wa && <a className="boton chico" href={wa} target="_blank" rel="noreferrer"><MessageCircle className="icono" aria-hidden />WhatsApp</a>}
                        <button className="boton chico peligro" onClick={() => quitar(t)}>Quitar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </Plegable>
      </div>
    </>
  );
}

function Asignar({ eleccionId, puestoInicial, cobertura, alTerminar }: {
  eleccionId: string; puestoInicial: { id: number; nombre: string; localidadId: number } | null; cobertura: CoberturaMesa[]; alTerminar: (m: string) => void;
}) {
  const { api } = useSesion();
  const [buscar, setBuscar] = useState('');
  const [resultados, setResultados] = useState<PersonaFila[]>([]);
  const [persona, setPersona] = useState<PersonaFila | null>(null);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [puestoId, setPuestoId] = useState<number | null>(null);
  const [buscarPuesto, setBuscarPuesto] = useState('');
  const [mesas, setMesas] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (buscar.trim().length < 3) { setResultados([]); return; }
    const t = setTimeout(() => api.personas({ texto: buscar, estado: '', desde: 0 }).then((r) => setResultados(r.filas.slice(0, 8))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [api, buscar]);

  const cargarPuestosDe = useCallback(async (localidadId: number, elegir?: number) => {
    const ps = await api.puestos(localidadId);
    setPuestos(ps);
    if (elegir) setPuestoId(elegir);
  }, [api]);

  useEffect(() => {
    if (!puestoInicial) return;
    setMesas([]);
    cargarPuestosDe(puestoInicial.localidadId, puestoInicial.id).catch(() => {});
  }, [puestoInicial, cargarPuestosDe]);

  const elegirPersona = async (p: PersonaFila) => {
    setPersona(p); setBuscar(''); setResultados([]); setError('');
    if (!puestoInicial && p.localidad) {
      const locs = await api.localidades();
      const loc = locs.find((l) => l.nombre === p.localidad);
      if (loc) {
        const ps = await api.puestos(loc.id);
        setPuestos(ps);
        const suyo = ps.find((x) => x.nombre === p.puesto);
        if (suyo) setPuestoId(suyo.id);
      }
    }
  };

  const puesto = puestos.find((x) => x.id === puestoId) ?? null;
  const conGente = new Set(cobertura.filter((c) => c.puesto_id === puestoId).map((c) => c.mesa));
  const filtrados = puestos.filter((x) => !buscarPuesto || normalizar(x.nombre).includes(normalizar(buscarPuesto)));

  const guardar = async () => {
    if (!persona || !puesto) return;
    setEnviando(true); setError('');
    try {
      await api.asignarTestigo(eleccionId, persona.id, puesto.id, mesas);
      alTerminar(`${persona.nombres} quedó como testigo de ${puesto.nombre}${mesas.length ? ` (mesas ${mesas.join(', ')})` : ' (todo el puesto)'}.`);
      setPersona(null); setMesas([]); setPuestoId(null); setPuestos([]);
    } catch (e) { setError(mensajeError(e)); } finally { setEnviando(false); }
  };

  return (
    <div className="tarjeta formulario" style={{ alignSelf: 'start', alignContent: 'start' }}>
      <h2><UserPlus className="icono" aria-hidden /> Asignar un testigo</h2>
      {!persona ? (
        <div className="campo"><span>1. ¿Quién? (persona ya registrada)</span>
          <div className="buscador-lista">
            <input type="search" placeholder="Nombre o cédula…" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar persona" />
            {resultados.length > 0 && (
              <ul>{resultados.map((p) => (
                <li key={p.id}><button type="button" onClick={() => elegirPersona(p)}>{p.nombres} {p.apellidos}<small>C.C. {p.cedula} · {p.telefono ?? 'sin celular'} · {p.puesto ?? 'sin puesto'}</small></button></li>
              ))}</ul>
            )}
          </div>
        </div>
      ) : (
        <div className="campo"><span>1. ¿Quién?</span>
          <div className="elegido"><div><strong>{persona.nombres} {persona.apellidos}</strong><small>C.C. {persona.cedula} · {persona.telefono ?? 'sin celular'}</small></div>
            <button type="button" className="boton chico" onClick={() => setPersona(null)}>Cambiar</button></div>
        </div>
      )}
      {puestos.length > 0 && (
        puesto ? (
          <div className="campo"><span>2. Puesto</span>
            <div className="elegido"><div><strong>{puesto.nombre}</strong><small>{puesto.direccion} · {puesto.mesas_total} mesas</small></div>
              <button type="button" className="boton chico" onClick={() => { setPuestoId(null); setMesas([]); }}>Cambiar</button></div>
          </div>
        ) : (
          <div className="campo"><span>2. Puesto</span>
            <div className="buscador-lista">
              <input type="search" placeholder="Busca el puesto…" value={buscarPuesto} onChange={(e) => setBuscarPuesto(e.target.value)} aria-label="Buscar puesto" />
              <ul>{filtrados.slice(0, 40).map((x) => <li key={x.id}><button type="button" onClick={() => setPuestoId(x.id)}>{x.nombre}<small>{x.direccion}</small></button></li>)}</ul>
            </div>
          </div>
        )
      )}
      {persona && puestos.length === 0 && !puestoInicial && <p className="ayuda">Esta persona no tiene puesto confirmado: elige un puesto en la gráfica de la izquierda.</p>}
      {puesto && (
        <fieldset>
          <legend>3. Mesas <span className="opcional">(si no eliges, cubre todo el puesto)</span></legend>
          <div className="mesas-elegibles">
            {Array.from({ length: puesto.mesas_total ?? 0 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" className={`opcion${conGente.has(n) ? ' con-gente' : ''}`} aria-pressed={mesas.includes(n)}
                title={conGente.has(n) ? 'Hay simpatizantes en esta mesa' : undefined}
                onClick={() => setMesas((m) => (m.includes(n) ? m.filter((x) => x !== n) : [...m, n].sort((a, b) => a - b)))}>{n}</button>
            ))}
          </div>
          <p className="ayuda" style={{ marginTop: '0.4rem' }}>Las mesas con borde de color tienen simpatizantes.</p>
        </fieldset>
      )}
      {error && <div className="aviso error" role="alert">{error}</div>}
      <button className="boton primario" disabled={!persona || !puesto || enviando} onClick={guardar}>{enviando ? 'Guardando…' : 'Asignar testigo'}</button>
    </div>
  );
}
