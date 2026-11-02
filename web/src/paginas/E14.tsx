// E14: digitación de resultados por mesa, revisión de diferencias y
// cumplimiento. Regla: todo se calcula por mesa y se suma hacia arriba.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSesion } from '../lib/sesion';
import E14Excel from './E14Excel';
import type {
  AvanceE14, Eleccion, LiderE14, LocalidadE14, MesaE14, MesaEnRevision, MesaPendiente, MiDigitacion, ModoDigitacion, PuestoE14, Rol,
} from '../lib/tipos';
import { formatoNumero, hoyISO, mensajeError, normalizar } from '../lib/utilidades';

type Vista = 'digitar' | 'excel' | 'revisar' | 'resultados' | 'elecciones';
const VISTAS: { id: Vista; texto: string; roles: Rol[] }[] = [
  { id: 'resultados', texto: 'Resultados', roles: ['admin', 'coordinador', 'candidato'] },
  { id: 'digitar', texto: 'Digitar', roles: ['admin', 'digitador'] },
  { id: 'excel', texto: 'Subir Excel', roles: ['admin', 'digitador'] },
  { id: 'revisar', texto: 'Diferencias', roles: ['admin'] },
  { id: 'elecciones', texto: 'Elecciones', roles: ['admin'] },
];

const ESTADO_MESA: Record<string, string> = {
  pendiente: 'Sin digitar', una_digitacion: 'Falta 2.ª digitación', en_revision: 'Diferencia', verificado: 'Verificada',
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : null);

export default function E14() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const [params, setParams] = useSearchParams();
  const vistas = VISTAS.filter((v) => v.roles.includes(rol));
  const vista = (vistas.find((v) => v.id === params.get('vista'))?.id ?? vistas[0].id) as Vista;
  const [elecciones, setElecciones] = useState<Eleccion[] | null>(null);
  const [eleccionId, setEleccionId] = useState('');
  const [avance, setAvance] = useState<AvanceE14 | null>(null);
  const [error, setError] = useState('');

  const cargarElecciones = useCallback(async () => {
    try {
      const es = await api.elecciones();
      setElecciones(es);
      setEleccionId((actual) => (es.some((e) => e.id === actual) ? actual : es[0]?.id ?? ''));
    } catch (e) { setError(mensajeError(e)); }
  }, [api]);
  const cargarAvance = useCallback(() => {
    if (eleccionId) api.avanceE14(eleccionId).then(setAvance).catch(() => {});
  }, [api, eleccionId]);

  useEffect(() => { cargarElecciones(); }, [cargarElecciones]);
  useEffect(() => { cargarAvance(); }, [cargarAvance, vista]);

  const eleccion = elecciones?.find((e) => e.id === eleccionId);

  return (
    <>
      <div className="encabezado">
        <div><h1>E14</h1><p>Resultados por mesa de los formularios E14.</p></div>
        {elecciones && elecciones.length > 1 && (
          <label className="campo" style={{ minWidth: 220 }}><span>Elección</span>
            <select value={eleccionId} onChange={(e) => setEleccionId(e.target.value)}>
              {elecciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
        )}
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      {vistas.length > 1 && (
        <div className="pestanas" role="tablist">
          {vistas.map((v) => (
            <button key={v.id} role="tab" aria-selected={vista === v.id} onClick={() => setParams({ vista: v.id })}>
              {v.texto}{v.id === 'revisar' && avance?.en_revision ? ` (${avance.en_revision})` : ''}
            </button>
          ))}
        </div>
      )}

      {elecciones === null ? <div className="tarjeta vacio">Cargando…</div>
        : vista === 'elecciones' ? <Elecciones elecciones={elecciones} onCreada={cargarElecciones} />
        : !eleccion ? (
          <div className="tarjeta vacio">
            {rol === 'admin'
              ? <>Todavía no hay una elección configurada. <button className="enlace" onClick={() => setParams({ vista: 'elecciones' })}>Crear la elección</button></>
              : 'Todavía no hay una elección configurada.'}
          </div>
        ) : (
          <>
            {avance && <Avance avance={avance} modo={eleccion.modo_digitacion} />}
            {vista === 'digitar' && <Digitar eleccion={eleccion} onCambio={cargarAvance} />}
            {vista === 'excel' && <E14Excel eleccion={eleccion} onCambio={cargarAvance} />}
            {vista === 'revisar' && <Revisar eleccion={eleccion} onCambio={cargarAvance} />}
            {vista === 'resultados' && <Resultados eleccion={eleccion} />}
          </>
        )}
    </>
  );
}

// ── Avance de la digitación ───────────────────────────────────────────
function Avance({ avance, modo }: { avance: AvanceE14; modo: ModoDigitacion }) {
  const total = Math.max(1, avance.mesas);
  const partes = [
    { k: 'verificadas', n: avance.verificadas, color: 'var(--ok)', texto: 'verificadas' },
    { k: 'revision', n: avance.en_revision, color: 'var(--aviso)', texto: 'con diferencia' },
    { k: 'una', n: avance.una_digitacion, color: '#7dd3fc', texto: 'con una digitación' },
    { k: 'pend', n: avance.pendientes, color: '#e5e7eb', texto: 'sin digitar' },
  ].filter((p) => p.n > 0 || p.k === 'verificadas');
  return (
    <div className="tarjeta" style={{ marginBottom: '1rem' }}>
      <div className="encabezado" style={{ marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>Avance: {pct(avance.verificadas, avance.mesas) ?? 0}% de las mesas verificadas</h2>
        <span className="ayuda">{formatoNumero(avance.mesas)} mesas con simpatizantes · {modo === 'doble' ? 'doble digitación' : 'digitación simple'}</span>
      </div>
      <div className="barra-avance" role="img" aria-label={partes.map((p) => `${p.n} ${p.texto}`).join(', ')}>
        {partes.map((p) => <div key={p.k} style={{ width: `${(100 * p.n) / total}%`, background: p.color }} title={`${p.n} ${p.texto}`} />)}
      </div>
      <div className="leyenda-mapa" style={{ padding: '0.5rem 0 0' }}>
        {partes.map((p) => <span key={p.k} className="leyenda-item"><span className="muestra" style={{ background: p.color }} />{formatoNumero(p.n)} {p.texto}</span>)}
      </div>
    </div>
  );
}

// ── Digitar ───────────────────────────────────────────────────────────
function Digitar({ eleccion, onCambio }: { eleccion: Eleccion; onCambio: () => void }) {
  const { api } = useSesion();
  const [pendientes, setPendientes] = useState<MesaPendiente[] | null>(null);
  const [hechas, setHechas] = useState<Map<number, number>>(new Map());
  const [mias, setMias] = useState<MiDigitacion[]>([]);
  const [localidad, setLocalidad] = useState('');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [verMias, setVerMias] = useState(false);

  const cargar = useCallback(() => {
    api.pendientesE14(eleccion.id).then((p) => { setPendientes(p); setHechas(new Map()); }).catch((e) => setError(mensajeError(e)));
    api.misDigitaciones(eleccion.id).then(setMias).catch(() => {});
  }, [api, eleccion.id]);
  useEffect(cargar, [cargar]);

  const localidades = useMemo(() => [...new Set((pendientes ?? []).map((p) => p.localidad))].sort(), [pendientes]);
  const visibles = useMemo(() => {
    const t = normalizar(texto);
    return (pendientes ?? []).filter((p) => (!localidad || p.localidad === localidad) && (!t || normalizar(p.puesto).includes(t)));
  }, [pendientes, localidad, texto]);
  const grupos = useMemo(() => {
    const g = new Map<string, MesaPendiente[]>();
    for (const p of visibles) {
      const k = `${p.localidad}|${p.puesto}`;
      g.set(k, [...(g.get(k) ?? []), p]);
    }
    return [...g.entries()].map(([k, mesas]) => ({ k, localidad: mesas[0].localidad, puesto: mesas[0].puesto, mesas }));
  }, [visibles]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const LIMITE_PUESTOS = 60;

  async function guardar(m: MesaPendiente, votos: number) {
    setError('');
    await api.digitarE14(eleccion.id, m.mesa_id, votos);
    setHechas((h) => new Map(h).set(m.mesa_id, votos));
    onCambio();
    api.misDigitaciones(eleccion.id).then(setMias).catch(() => {});
  }

  return (
    <>
      <div className="aviso info" style={{ marginBottom: '1rem' }}>
        <p>Abre la foto del E14 de cada mesa en la página de la Registraduría y escribe <strong>los votos del candidato</strong> en esa mesa. Si no tiene votos, escribe <strong>0</strong>.
          {eleccion.modo_digitacion === 'doble' && ' Otra persona digitará la misma mesa sin ver tu número: si no coinciden, el administrador la revisa.'}</p>
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="filtros">
        <select value={localidad} onChange={(e) => setLocalidad(e.target.value)} aria-label="Localidad">
          <option value="">Todas las localidades</option>
          {localidades.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <input type="search" placeholder="Buscar puesto" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar puesto" />
        <button className="boton" onClick={cargar}>Actualizar lista</button>
      </div>

      {pendientes === null ? <div className="tarjeta vacio">Cargando…</div>
        : pendientes.length === 0 ? <div className="tarjeta vacio">No te quedan mesas por digitar. ¡Bien hecho!</div>
        : (
          <>
            <p className="ayuda">{formatoNumero(visibles.length - [...hechas.keys()].filter((k) => visibles.some((v) => v.mesa_id === k)).length)} mesas por digitar en {formatoNumero(grupos.length)} puestos{grupos.length > LIMITE_PUESTOS && ` · se muestran ${LIMITE_PUESTOS}: filtra por localidad o busca el puesto`}</p>
            <div className="lista-puestos">
              {grupos.slice(0, LIMITE_PUESTOS).map((g) => {
                const faltan = g.mesas.filter((m) => !hechas.has(m.mesa_id)).length;
                const abiertoEste = abierto === g.k || grupos.length === 1;
                return (
                  <div key={g.k} className="tarjeta puesto-e14">
                    <button type="button" className="cabecera-puesto" aria-expanded={abiertoEste} onClick={() => setAbierto(abiertoEste ? null : g.k)}>
                      <span><strong>{g.puesto}</strong><small>{g.localidad}</small></span>
                      <span className={`insignia ${faltan ? 'sin_mesa' : 'completa'}`}>{faltan ? `${faltan} ${faltan === 1 ? 'mesa' : 'mesas'}` : '✓ listo'}</span>
                    </button>
                    {abiertoEste && g.mesas.map((m) => <FilaDigitar key={m.mesa_id} mesa={m} hecha={hechas.get(m.mesa_id)} onGuardar={(v) => guardar(m, v)} />)}
                  </div>
                );
              })}
            </div>
          </>
        )}

      <div className="tarjeta" style={{ marginTop: '1rem' }}>
        <div className="encabezado" style={{ marginBottom: verMias ? '0.75rem' : 0 }}>
          <h2 style={{ margin: 0 }}>Lo que he digitado ({formatoNumero(mias.length)})</h2>
          <button className="boton chico" onClick={() => setVerMias((v) => !v)}>{verMias ? 'Ocultar' : 'Ver y corregir'}</button>
        </div>
        {verMias && <MisDigitaciones mias={mias} onCorregida={() => { cargar(); onCambio(); }} />}
      </div>
    </>
  );
}

function FilaDigitar({ mesa, hecha, onGuardar }: { mesa: MesaPendiente; hecha?: number; onGuardar: (v: number) => Promise<void> }) {
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{1,4}$/.test(valor) || Number(valor) > 1000) { setError('Escribe un número de 0 a 1000.'); return; }
    setEnviando(true); setError('');
    try {
      await onGuardar(Number(valor));
      // Pasa a la siguiente casilla, para digitar seguido con el teclado
      const bloque = ref.current?.closest('.puesto-e14');
      const todas = [...(bloque?.querySelectorAll<HTMLInputElement>('input:not([disabled])') ?? [])];
      const i = todas.indexOf(ref.current!);
      (todas[i + 1] ?? todas.find((x) => x !== ref.current))?.focus();
    } catch (err) { setError(mensajeError(err)); } finally { setEnviando(false); }
  }

  if (hecha != null) return <div className="fila-e14 hecha"><span>Mesa {mesa.mesa}</span><span className="insignia completa">✓ {hecha} votos</span></div>;
  return (
    <form className="fila-e14" onSubmit={enviar} noValidate>
      <label htmlFor={`m-${mesa.mesa_id}`}>Mesa {mesa.mesa}</label>
      <input id={`m-${mesa.mesa_id}`} ref={ref} type="number" inputMode="numeric" min={0} max={1000} value={valor}
        onChange={(e) => setValor(e.target.value)} aria-invalid={!!error} disabled={enviando} placeholder="Votos" />
      <button className="boton chico primario" disabled={enviando || valor === ''}>Guardar</button>
      {error && <span className="error-campo">{error}</span>}
    </form>
  );
}

function MisDigitaciones({ mias, onCorregida }: { mias: MiDigitacion[]; onCorregida: () => void }) {
  const { api } = useSesion();
  const [editando, setEditando] = useState<number | null>(null);
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');
  if (!mias.length) return <p className="ayuda">Todavía no has digitado mesas.</p>;
  async function corregir(d: MiDigitacion) {
    if (!/^\d{1,4}$/.test(valor) || Number(valor) > 1000) { setError('Escribe un número de 0 a 1000.'); return; }
    try { await api.corregirDigitacion(d.id, Number(valor)); setEditando(null); setError(''); onCorregida(); }
    catch (e) { setError(mensajeError(e)); }
  }
  return (
    <>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      <div className="envoltura-tabla">
        <table className="tabla compacta">
          <thead><tr><th>Mesa</th><th className="num">Votos</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {mias.map((d) => (
              <tr key={d.id}>
                <td>Mesa {d.mesa}<small>{d.localidad} · {d.puesto}</small></td>
                <td className="num">
                  {editando === d.id
                    ? <input type="number" min={0} max={1000} value={valor} onChange={(e) => setValor(e.target.value)} style={{ width: 90 }} aria-label="Votos corregidos" autoFocus />
                    : formatoNumero(d.votos)}
                </td>
                <td><span className={`insignia ${d.estado === 'verificado' ? 'completa' : d.estado === 'en_revision' ? 'por_revisar' : 'sin_mesa'}`}>{ESTADO_MESA[d.estado]}</span></td>
                <td className="num">
                  {editando === d.id
                    ? <span className="acciones" style={{ justifyContent: 'flex-end' }}><button className="boton chico primario" onClick={() => corregir(d)}>Guardar</button><button className="boton chico" onClick={() => setEditando(null)}>Cancelar</button></span>
                    : <button className="boton chico" onClick={() => { setEditando(d.id); setValor(String(d.votos)); }}>Corregir</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Diferencias (solo admin) ──────────────────────────────────────────
function Revisar({ eleccion, onCambio }: { eleccion: Eleccion; onCambio: () => void }) {
  const { api } = useSesion();
  const [mesas, setMesas] = useState<MesaEnRevision[] | null>(null);
  const [otro, setOtro] = useState<Record<number, string>>({});
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    api.revisionE14(eleccion.id).then(setMesas).catch((e) => setError(mensajeError(e)));
  }, [api, eleccion.id]);
  useEffect(cargar, [cargar]);

  async function resolver(m: MesaEnRevision, votos: number) {
    setError('');
    try {
      await api.resolverE14(eleccion.id, m.mesa_id, votos);
      setMensaje(`Mesa ${m.mesa} de ${m.puesto}: quedó con ${votos} votos.`);
      setMesas((ms) => ms?.filter((x) => x.mesa_id !== m.mesa_id) ?? null);
      onCambio();
    } catch (e) { setError(mensajeError(e)); }
  }

  return (
    <>
      <div className="aviso info" style={{ marginBottom: '1rem' }}>
        <p>En estas mesas, los dos digitadores escribieron números distintos. Mira la foto del E14 y elige el valor correcto.</p>
      </div>
      {mensaje && <div className="aviso ok" role="status" style={{ marginBottom: '1rem' }}>{mensaje}</div>}
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}
      {mesas === null ? <div className="tarjeta vacio">Cargando…</div>
        : mesas.length === 0 ? <div className="tarjeta vacio">No hay diferencias por revisar.</div>
        : mesas.map((m) => (
          <div key={m.mesa_id} className="tarjeta">
            <h3 style={{ marginBottom: '0.2rem' }}>Mesa {m.mesa} · {m.puesto}</h3>
            <p className="ayuda">{m.localidad}</p>
            <div className="acciones">
              {[...new Set(m.digitaciones.map((d) => d.votos))].map((v) => (
                <button key={v} className="boton" onClick={() => resolver(m, v)}>
                  {v} votos <small style={{ fontWeight: 400, color: 'var(--texto-3)' }}>({m.digitaciones.filter((d) => d.votos === v).map((d) => d.por).join(', ')})</small>
                </button>
              ))}
              <form className="acciones" onSubmit={(e) => { e.preventDefault(); const v = otro[m.mesa_id]; if (/^\d{1,4}$/.test(v ?? '')) resolver(m, Number(v)); }}>
                <input type="number" min={0} max={1000} placeholder="Otro valor" aria-label={`Otro valor para la mesa ${m.mesa}`} style={{ width: 120 }}
                  value={otro[m.mesa_id] ?? ''} onChange={(e) => setOtro((o) => ({ ...o, [m.mesa_id]: e.target.value }))} />
                <button className="boton chico" disabled={!otro[m.mesa_id]}>Usar este</button>
              </form>
            </div>
          </div>
        ))}
    </>
  );
}

// ── Resultados ────────────────────────────────────────────────────────
function Resultados({ eleccion }: { eleccion: Eleccion }) {
  const { api } = useSesion();
  const [datos, setDatos] = useState<{ localidades: LocalidadE14[]; puestos: PuestoE14[]; lideres: LiderE14[] } | null>(null);
  const [tab, setTab] = useState<'lideres' | 'localidades' | 'puestos'>('lideres');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [mesas, setMesas] = useState<MesaE14[]>([]);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [cuantos, setCuantos] = useState(25);

  useEffect(() => {
    api.resultadosE14(eleccion.id).then(setDatos).catch((e) => setError(mensajeError(e)));
  }, [api, eleccion.id]);
  useEffect(() => {
    setMesas([]);
    if (abierto != null) api.mesasE14(eleccion.id, abierto).then(setMesas).catch(() => {});
  }, [api, eleccion.id, abierto]);

  if (error) return <div className="aviso error" role="alert">{error}</div>;
  if (!datos) return <div className="tarjeta vacio">Cargando…</div>;

  const t = datos.localidades.reduce((s, l) => ({
    confirmados: s.confirmados + l.confirmados, faltantes: s.faltantes + l.faltantes,
    adicionales: s.adicionales + l.adicionales, votos: s.votos + l.votos_reales,
  }), { confirmados: 0, faltantes: 0, adicionales: 0, votos: 0 });
  const cumpl = pct(t.confirmados, t.confirmados + t.faltantes);

  const filaTotales = (x: { confirmados: number; faltantes: number; adicionales: number; votos_reales: number; esperados: number; mesas: number; mesas_verificadas: number }) => (
    <>
      <td className="num" data-etiqueta="Esperados">{formatoNumero(x.esperados)}</td>
      <td className="num" data-etiqueta="Confirmados">{formatoNumero(x.confirmados)}</td>
      <td className="num" data-etiqueta="Faltantes">{formatoNumero(x.faltantes)}</td>
      <td className="num" data-etiqueta="Adicionales">{formatoNumero(x.adicionales)}</td>
      <td className="num" data-etiqueta="Cumplimiento">{pct(x.confirmados, x.confirmados + x.faltantes) ?? '—'}{pct(x.confirmados, x.confirmados + x.faltantes) != null && '%'}</td>
      <td className="num solo-ancho" data-etiqueta="Mesas">{x.mesas_verificadas}/{x.mesas}</td>
    </>
  );
  const encabezadoTotales = (
    <>
      <th className="num">Esperados</th><th className="num">Confirmados</th><th className="num">Faltantes</th>
      <th className="num">Adicionales</th><th className="num">Cumplimiento</th><th className="num solo-ancho">Mesas verif.</th>
    </>
  );

  return (
    <>
      <div className="rejilla cifras" style={{ marginBottom: '1rem' }}>
        <div className="tarjeta cifra"><span className="valor">{cumpl == null ? '—' : `${cumpl}%`}</span><span className="etiqueta">de cumplimiento en mesas verificadas</span></div>
        <div className="tarjeta cifra"><span className="valor">{formatoNumero(t.confirmados)}</span><span className="etiqueta">votos confirmados</span></div>
        <div className="tarjeta cifra alerta"><span className="valor">{formatoNumero(t.faltantes)}</span><span className="etiqueta">faltantes</span></div>
        <div className="tarjeta cifra"><span className="valor">{formatoNumero(t.adicionales)}</span><span className="etiqueta">votos adicionales (apoyo fuera de los registrados)</span></div>
      </div>

      <details className="tarjeta" style={{ marginBottom: '1rem' }}>
        <summary><strong>¿Cómo se calcula?</strong></summary>
        <ul className="ayuda" style={{ margin: '0.5rem 0 0' }}>
          <li>Todo se calcula <strong>mesa por mesa</strong> y luego se suma por puesto, localidad y líder.</li>
          <li><strong>Confirmados</strong>: el menor entre los registrados en la mesa y los votos del E14.</li>
          <li><strong>Faltantes</strong>: registrados que no aparecen en los votos de la mesa.</li>
          <li><strong>Adicionales</strong>: votos de más en la mesa; apoyo que no viene de los registrados.</li>
          <li>Si varios líderes comparten mesa, los confirmados se reparten en proporción a sus registrados, y ninguno recibe más de lo que esperaba.</li>
          <li>Solo cuentan las mesas <strong>verificadas</strong>. El voto es secreto: no se sabe qué persona votó, solo cuántos votos hubo.</li>
        </ul>
      </details>

      <div className="tarjeta">
        <div className="pestanas" role="tablist">
          {([['lideres', 'Por líder'], ['localidades', 'Por localidad'], ['puestos', 'Por puesto']] as const).map(([k, txt]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{txt}</button>
          ))}
        </div>

        {tab === 'lideres' && (datos.lideres.length === 0 ? <p className="ayuda">Sin datos.</p> : (
          <div className="envoltura-tabla">
            <table className="tabla compacta">
              <thead><tr><th>Líder</th><th className="num">Registrados</th><th className="num">Confirmados</th><th className="num">Cumplimiento</th><th className="num solo-ancho">Mesas sin verificar</th></tr></thead>
              <tbody>
                {[...datos.lideres].sort((a, b) => (b.cumplimiento ?? -1) - (a.cumplimiento ?? -1)).map((l) => (
                  <tr key={l.lider_id}>
                    <td>{l.nombre}</td>
                    <td className="num">{formatoNumero(l.esperados)}</td>
                    <td className="num">{formatoNumero(l.confirmados)}</td>
                    <td className="num">
                      {l.cumplimiento == null ? '—' : (
                        <span className="cumplimiento"><span className="pista"><span style={{ width: `${Math.min(100, l.cumplimiento)}%` }} /></span>{Math.round(l.cumplimiento)}%</span>
                      )}
                    </td>
                    <td className="num solo-ancho">{l.mesas_pendientes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {tab === 'localidades' && (
          <div className="envoltura-tabla">
            <table className="tabla compacta">
              <thead><tr><th>Localidad</th>{encabezadoTotales}</tr></thead>
              <tbody>
                {[...datos.localidades].sort((a, b) => b.esperados - a.esperados).map((l) => (
                  <tr key={l.localidad_id}><td>{l.localidad}</td>{filaTotales(l)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'puestos' && (
          <>
          <div className="filtros">
            <input type="search" placeholder="Buscar puesto o localidad" value={buscar} onChange={(e) => { setBuscar(e.target.value); setCuantos(25); }} aria-label="Buscar puesto" />
          </div>
          <div className="envoltura-tabla">
            <table className="tabla compacta">
              <thead><tr><th>Puesto</th>{encabezadoTotales}</tr></thead>
              <tbody>
                {[...datos.puestos]
                  .filter((p) => !buscar || normalizar(`${p.puesto} ${p.localidad}`).includes(normalizar(buscar)))
                  .sort((a, b) => b.esperados - a.esperados).slice(0, cuantos).map((p) => (
                  <Fragment key={p.puesto_id}>
                    <tr>
                      <td><button className="enlace" aria-expanded={abierto === p.puesto_id} onClick={() => setAbierto(abierto === p.puesto_id ? null : p.puesto_id)}>{p.puesto}</button><small>{p.localidad}</small></td>
                      {filaTotales(p)}
                    </tr>
                    {abierto === p.puesto_id && (
                      <tr><td colSpan={7} style={{ background: '#fafafa' }}>
                        {mesas.length === 0 ? <span className="ayuda">Cargando mesas…</span> : (
                          <table className="tabla compacta" style={{ background: 'transparent' }}>
                            <thead><tr><th>Mesa</th><th>Estado</th><th className="num">Registrados</th><th className="num">Votos E14</th><th className="num">Confirmados</th><th className="num">Faltantes</th><th className="num">Adicionales</th></tr></thead>
                            <tbody>
                              {mesas.map((m) => (
                                <tr key={m.mesa_id}>
                                  <td>{m.mesa}</td>
                                  <td><span className={`insignia ${m.estado === 'verificado' ? 'completa' : m.estado === 'en_revision' ? 'por_revisar' : 'sin_dato'}`}>{ESTADO_MESA[m.estado]}</span></td>
                                  <td className="num">{m.esperados}</td>
                                  <td className="num">{m.votos_reales ?? '—'}</td>
                                  <td className="num">{m.confirmados ?? '—'}</td>
                                  <td className="num">{m.faltantes ?? '—'}</td>
                                  <td className="num">{m.adicionales ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {datos.puestos.filter((p) => !buscar || normalizar(`${p.puesto} ${p.localidad}`).includes(normalizar(buscar))).length > cuantos && (
            <div style={{ textAlign: 'center', marginTop: '0.75rem' }}><button className="boton" onClick={() => setCuantos((c) => c + 25)}>Ver más puestos</button></div>
          )}
          </>
        )}
      </div>
    </>
  );
}

// ── Elecciones (solo admin) ───────────────────────────────────────────
function Elecciones({ elecciones, onCreada }: { elecciones: Eleccion[]; onCreada: () => void }) {
  const { api } = useSesion();
  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [modo, setModo] = useState<ModoDigitacion>('doble');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(''); setMensaje('');
    if (!nombre.trim()) { setError('Escribe el nombre de la elección.'); return; }
    try {
      await api.crearEleccion({ nombre, fecha, modo });
      setMensaje(`Elección “${nombre.trim()}” creada.`); setNombre('');
      onCreada();
    } catch (err) { setError(mensajeError(err)); }
  }

  return (
    <>
      {elecciones.length > 0 && (
        <div className="envoltura-tabla" style={{ marginBottom: '1rem' }}>
          <table className="tabla compacta">
            <thead><tr><th>Elección</th><th>Fecha</th><th>Digitación</th></tr></thead>
            <tbody>{elecciones.map((e) => <tr key={e.id}><td>{e.nombre}</td><td>{e.fecha}</td><td>{e.modo_digitacion === 'doble' ? 'Doble' : 'Simple'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <form className="tarjeta formulario" onSubmit={crear}>
        <h2>Nueva elección</h2>
        {mensaje && <div className="aviso ok" role="status">{mensaje}</div>}
        {error && <div className="aviso error" role="alert">{error}</div>}
        <div className="fila-campos">
          <label className="campo"><span>Nombre</span><input type="text" placeholder="Ej.: Senado 2026" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          <label className="campo"><span>Fecha de la elección</span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        </div>
        <div className="campo">
          <span id="modo">Digitación</span>
          <div className="segmentos" role="group" aria-labelledby="modo">
            <button type="button" className="opcion" aria-pressed={modo === 'doble'} onClick={() => setModo('doble')}>Doble (recomendada)</button>
            <button type="button" className="opcion" aria-pressed={modo === 'simple'} onClick={() => setModo('simple')}>Simple</button>
          </div>
          <small>{modo === 'doble'
            ? 'Dos personas digitan cada mesa sin ver lo que puso la otra. Si coinciden, queda verificada; si no, la revisas tú.'
            : 'Una sola digitación por mesa. Más rápido, pero un error de transcripción pasa directo a los resultados.'}</small>
        </div>
        <div><button className="boton primario">Crear elección</button></div>
      </form>
    </>
  );
}
