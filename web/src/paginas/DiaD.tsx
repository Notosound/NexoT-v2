// Día D: el día de la elección cada líder marca quién de su gente ya votó.
// El candidato y el admin ven el avance en vivo para movilizar a los que faltan.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bus, CheckCircle2, Clock, Download, MessageCircle, Vote } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { useEnVivo } from '../lib/enVivo';
import type { DiaDFila, Eleccion, PersonaFila } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';
import { descargarExcel, fechaArchivo } from '../lib/excel';
import EnVivo from '../componentes/EnVivo';
import { BarrasH, SERIES } from '../componentes/Graficos';
import { Cifra, Plegable, pct } from '../componentes/Piezas';
import { enlaceWhatsApp } from './Seguimiento';

export default function DiaD() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const marca = rol !== 'candidato';
  const [elecciones, setElecciones] = useState<Eleccion[] | null>(null);
  const [eleccionId, setEleccionId] = useState('');
  const [filas, setFilas] = useState<DiaDFila[]>([]);
  const [votaron, setVotaron] = useState<Set<string>>(new Set());
  const [personas, setPersonas] = useState<PersonaFila[] | null>(null);
  const [total, setTotal] = useState(0);
  const [ver, setVer] = useState<'faltan' | 'votaron' | 'todos'>('faltan');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.elecciones().then((es) => { setElecciones(es); setEleccionId((x) => x || es[0]?.id || ''); }).catch((e) => setError(mensajeError(e)));
  }, [api]);

  const vivo = useEnVivo(async () => {
    if (!eleccionId) return;
    setFilas(await api.diaD(eleccionId));
    if (marca) setVotaron(await api.votosMarcados(eleccionId));
  }, ['registros']);
  useEffect(() => { vivo.recargar(); }, [eleccionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarPersonas = useCallback(async (desde = 0) => {
    if (!marca) return;
    try {
      const r = await api.personas({ texto, estado: '', desde });
      setPersonas((p) => (desde === 0 ? r.filas : [...(p ?? []), ...r.filas]));
      setTotal(r.total);
    } catch (e) { setError(mensajeError(e)); }
  }, [api, texto, marca]);
  useEffect(() => { const t = setTimeout(() => cargarPersonas(0), 250); return () => clearTimeout(t); }, [cargarPersonas]);

  const [ultimo, setUltimo] = useState<PersonaFila | null>(null);
  const marcar = async (p: PersonaFila, voto: boolean) => {
    setError('');
    setUltimo(voto ? p : null);
    setVotaron((s) => { const n = new Set(s); if (voto) n.add(p.id); else n.delete(p.id); return n; });
    try { await api.marcarVoto(eleccionId, p.id, voto); vivo.recargar(); }
    catch (e) {
      setError(mensajeError(e));
      setVotaron((s) => { const n = new Set(s); if (voto) n.delete(p.id); else n.add(p.id); return n; });
    }
  };

  const tot = filas.reduce((a, f) => ({ n: a.n + f.personas, v: a.v + f.votaron }), { n: 0, v: 0 });
  const agrupar = (clave: (f: DiaDFila) => string) => {
    const m = new Map<string, { n: number; v: number }>();
    for (const f of filas) { const k = clave(f); const x = m.get(k) ?? { n: 0, v: 0 }; x.n += f.personas; x.v += f.votaron; m.set(k, x); }
    return [...m.entries()].sort((a, b) => (b[1].n - b[1].v) - (a[1].n - a[1].v))
      .map(([nombre, x]) => ({ nombre, valores: [x.v, x.n - x.v], detalle: `${pct(x.v, x.n)}% ya votó · faltan ${x.n - x.v}` }));
  };
  const visibles = useMemo(() => (personas ?? [])
    .filter((p) => ver === 'todos' || (ver === 'votaron' ? votaron.has(p.id) : !votaron.has(p.id)))
    .sort((a, b) => Number(b.compromiso === 'confirmado') - Number(a.compromiso === 'confirmado')), [personas, ver, votaron]);
  const eleccion = elecciones?.find((e) => e.id === eleccionId);

  if (elecciones && elecciones.length === 0) {
    return <><h1>Día D</h1><div className="tarjeta vacio">Primero crea la elección en E14 → Elecciones.</div></>;
  }

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Día D</h1>
          <p className="subtitulo">El día de la elección: quién ya votó y a quién falta recordarle.</p>
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

      <div className="cifras">
        <Cifra icono={Vote} valor={`${pct(tot.v, tot.n)}%`} etiqueta="ya votaron" tono="ok" detalle={`${tot.v} de ${tot.n} simpatizantes`} />
        <Cifra icono={Clock} valor={tot.n - tot.v} etiqueta="faltan por votar" tono="aviso" detalle={eleccion ? eleccion.nombre : undefined} />
      </div>

      {(rol === 'admin' || rol === 'candidato' || rol === 'coordinador') && filas.length > 0 && (
        <div className="graficos seccion">
          <div className="tarjeta">
            <div className="tarjeta-titulo"><h2>Por localidad</h2><small>primero donde más faltan</small></div>
            <BarrasH limite={8} series={[{ nombre: 'Ya votaron', color: SERIES[2] }, { nombre: 'Faltan', color: 'var(--borde-fuerte)' }]} filas={agrupar((f) => f.localidad)} />
          </div>
          <div className="tarjeta">
            <div className="tarjeta-titulo"><h2>Por líder</h2><small>a quién llamar primero</small></div>
            <BarrasH limite={8} series={[{ nombre: 'Ya votaron', color: SERIES[2] }, { nombre: 'Faltan', color: 'var(--borde-fuerte)' }]} filas={agrupar((f) => f.lider)} />
          </div>
        </div>
      )}

      {marca && (
        <div className="seccion">
          <Plegable titulo={rol === 'lider' ? 'Mi gente' : 'Marcar quién votó'} cuenta={`${total} personas`} abierto={rol === 'lider'}>
            <div className="segmentos" role="group" aria-label="Qué personas ver" style={{ marginBottom: '0.75rem' }}>
              {([['faltan', 'Faltan'], ['votaron', 'Ya votaron'], ['todos', 'Todos']] as const).map(([k, n]) => (
                <button key={k} type="button" className="opcion" aria-pressed={ver === k} onClick={() => setVer(k)}>{n}</button>
              ))}
            </div>
            {ultimo && votaron.has(ultimo.id) && (
              <div className="aviso ok" role="status" style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{ultimo.nombres} {ultimo.apellidos} quedó marcado como que ya votó.</span>
                <button type="button" className="boton chico" onClick={() => marcar(ultimo, false)}>Deshacer</button>
              </div>
            )}
            <div className="filtros"><input type="search" placeholder="Buscar por nombre o cédula" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar" /></div>
            {personas == null ? <p className="vacio">Cargando…</p> : (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {visibles.map((p) => {
                  const ya = votaron.has(p.id);
                  const wa = enlaceWhatsApp(p.telefono, `¡Hola ${p.nombres}! Hoy es el día: no olvides votar. Tu puesto: ${p.puesto ?? 'consulta en la Registraduría'}${p.mesa ? `, mesa ${p.mesa}` : ''}. ¡Contamos contigo!`);
                  return (
                    <div key={p.id} className={`voto-fila${ya ? ' ya' : ''}`}>
                      <div>
                        <strong>{p.nombres} {p.apellidos}</strong>{p.compromiso === 'confirmado' && <span className="chip-compromiso confirmado" style={{ marginLeft: 6 }}>Confirmado</span>}
                        <small>{p.puesto ?? 'Sin puesto'}{p.mesa ? ` · mesa ${p.mesa}` : ''}{p.telefono ? ` · ${p.telefono}` : ''}{rol !== 'lider' && p.lider ? ` · ${p.lider}` : ''}</small>
                      </div>
                      <div className="acciones">
                        {!ya && wa && <a className="boton chico" href={wa} target="_blank" rel="noreferrer"><MessageCircle className="icono" aria-hidden />Recordar</a>}
                        <button type="button" className={`boton chico${ya ? ' votado' : ''}`} aria-pressed={ya} onClick={() => marcar(p, !ya)}>
                          <CheckCircle2 className="icono" aria-hidden />{ya ? 'Ya votó' : 'Marcar que votó'}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {visibles.length === 0 && <p className="vacio">{ver === 'faltan' ? '¡Todos en esta lista ya votaron!' : 'Nadie en esta lista.'}</p>}
                {(personas.length < total) && <button className="boton bloque" onClick={() => cargarPersonas(personas.length)}>Ver más ({total - personas.length})</button>}
              </div>
            )}
          </Plegable>
        </div>
      )}

      {marca && <Transporte votaron={votaron} />}
    </>
  );
}

// Quiénes necesitan que los lleven a votar, agrupados por puesto de destino
function Transporte({ votaron }: { votaron: Set<string> }) {
  const { api } = useSesion();
  const [lista, setLista] = useState<PersonaFila[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.personasTransporte().then(setLista).catch((e) => setError(mensajeError(e))); }, [api]);
  const grupos = useMemo(() => {
    const m = new Map<string, PersonaFila[]>();
    for (const p of lista ?? []) {
      const k = p.puesto ?? p.puesto_reportado ?? 'Sin puesto confirmado';
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [lista]);
  if (!lista) return null;
  const faltan = lista.filter((p) => !votaron.has(p.id)).length;
  const exportar = async () => {
    try {
      await api.registrarExportacion('transporte_dia_d', lista.length);
      await descargarExcel(`Transporte_Dia_D_${fechaArchivo()}.xlsx`, [{ nombre: 'Transporte', anchos: [36, 28, 14, 22, 8, 22, 10], filas: [
        ['Puesto de votación', 'Persona', 'Celular', 'Barrio', 'Mesa', 'Líder', 'Ya votó'],
        ...grupos.flatMap(([puesto, ps]) => ps.map((p) => [puesto, `${p.nombres} ${p.apellidos}`, p.telefono, p.barrio ?? '', p.mesa, p.lider, votaron.has(p.id) ? 'Sí' : 'No'])),
      ] }]);
    } catch (e) { setError(mensajeError(e)); }
  };
  return (
    <div className="seccion">
      <Plegable titulo={<><Bus className="icono" aria-hidden style={{ verticalAlign: '-3px' }} /> Transporte</>}
        cuenta={lista.length ? `${lista.length} personas · faltan ${faltan}` : 'nadie marcado'}
        acciones={lista.length ? <button className="boton chico" onClick={exportar}><Download className="icono" aria-hidden />Excel para conductores</button> : undefined}>
        {error && <div className="aviso error" role="alert">{error}</div>}
        {lista.length === 0 ? (
          <p className="ayuda">Nadie está marcado como que necesita transporte. Se marca en Seguimiento con el botón “Transporte”.</p>
        ) : grupos.map(([puesto, ps]) => (
          <div key={puesto} className="grupo-transporte">
            <h3>{puesto} <small className="ayuda">{ps.length} {ps.length === 1 ? 'persona' : 'personas'} · {ps.filter((p) => !votaron.has(p.id)).length} por llevar</small></h3>
            <ul>
              {ps.map((p) => (
                <li key={p.id} className={votaron.has(p.id) ? 'ya' : ''}>
                  <span>{p.nombres} {p.apellidos}</span>
                  <span className="ayuda">{p.telefono ?? 'sin celular'}{p.barrio ? ` · ${p.barrio}` : ''}{p.mesa ? ` · mesa ${p.mesa}` : ''}</span>
                  {votaron.has(p.id) ? <span className="chip-compromiso confirmado">Ya votó</span> : p.telefono ? <a className="enlace" href={`tel:+57${p.telefono}`}>Llamar</a> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Plegable>
    </div>
  );
}
