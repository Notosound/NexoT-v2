// E14: digitación de resultados por mesa, revisión de diferencias y
// cumplimiento. Regla: todo se calcula por mesa y se suma hacia arriba.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Target, UserPlus, UserX, Vote } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { useEnVivo } from '../lib/enVivo';
import EnVivo from '../componentes/EnVivo';
import { BarrasH, Segmentos, SERIES } from '../componentes/Graficos';
import { Cifra } from '../componentes/Piezas';
import E14Excel from './E14Excel';
import LecturasE14 from '../componentes/LecturasE14';
import E14Guia from '../componentes/E14Guia';
import type {
  AvanceE14, Eleccion, LiderE14, LocalidadE14, MesaE14, MesaEnRevision, MesaPendiente, MiDigitacion, ModoDigitacion, PuestoE14, Rol,
} from '../lib/tipos';
import { formatoNumero, hoyISO, mensajeError, normalizar } from '../lib/utilidades';

type Vista = 'guia' | 'digitar' | 'lecturas' | 'excel' | 'revisar' | 'resultados' | 'elecciones';
const VISTAS: { id: Vista; texto: string; roles: Rol[] }[] = [
  { id: 'guia', texto: '¿Cómo funciona?', roles: ['admin', 'coordinador', 'digitador', 'candidato'] },
  { id: 'resultados', texto: 'Resultados', roles: ['admin', 'coordinador', 'candidato'] },
  { id: 'digitar', texto: 'Digitar', roles: ['admin', 'digitador'] },
  { id: 'lecturas', texto: 'Lectura automática', roles: ['admin', 'digitador'] },
  { id: 'excel', texto: 'Subir Excel', roles: ['admin', 'digitador'] },
  { id: 'revisar', texto: 'Diferencias', roles: ['admin'] },
  { id: 'elecciones', texto: 'Elecciones', roles: ['admin'] },
];

const ESTADO_MESA: Record<string, string> = {
  pendiente: 'Sin digitar', una_digitacion: 'Falta 2.ª digitación', en_revision: 'Diferencia', verificado: 'Verificada',
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : null);
const nVotos = (n: number) => (n === 1 ? '1 voto' : `${formatoNumero(n)} votos`);

export default function E14() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const [params, setParams] = useSearchParams();
  const vistas = VISTAS.filter((v) => v.roles.includes(rol));
  const inicial: Vista = rol === 'digitador' ? 'digitar' : 'resultados';
  const vista = (vistas.find((v) => v.id === params.get('vista'))?.id ?? inicial) as Vista;
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
  const vivo = useEnVivo(async () => { if (eleccionId) setAvance(await api.avanceE14(eleccionId)); }, ['e14']);

  const eleccion = elecciones?.find((e) => e.id === eleccionId);

  return (
    <>
      <div className="encabezado">
        <div><h1>E14</h1><p>Resultados por mesa de los formularios E14.</p><EnVivo {...vivo} /></div>
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
        : vista === 'guia' ? <E14Guia eleccion={eleccion} ir={(v) => setParams({ vista: v })} onCambio={cargarAvance} />
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
            {vista === 'lecturas' && <LecturasE14 eleccion={eleccion} onCambio={cargarAvance} />}
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
  return (
    <div className="tarjeta" style={{ marginBottom: '1rem' }}>
      <div className="encabezado" style={{ marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>Avance: {pct(avance.verificadas, avance.mesas) ?? 0}% de las mesas verificadas</h2>
        <span className="ayuda">{formatoNumero(avance.mesas)} mesas con simpatizantes · {modo === 'doble' ? 'doble digitación' : 'digitación simple'}</span>
      </div>
      <Segmentos partes={[
        { nombre: 'Verificadas', valor: avance.verificadas, color: 'var(--ok)' },
        { nombre: 'Con diferencia', valor: avance.en_revision, color: 'var(--aviso)' },
        { nombre: 'Con una digitación', valor: avance.una_digitacion, color: 'var(--serie-1)' },
        { nombre: 'Sin digitar', valor: avance.pendientes, color: 'var(--borde-fuerte)' },
      ]} />
    </div>
  );
}

// ── Digitar: como un formulario de registro, mesa por mesa ────────────
function Digitar({ eleccion, onCambio }: { eleccion: Eleccion; onCambio: () => void }) {
  const { api } = useSesion();
  const [pendientes, setPendientes] = useState<MesaPendiente[] | null>(null);
  const [mias, setMias] = useState<MiDigitacion[]>([]);
  const [localidad, setLocalidad] = useState('');
  const [puesto, setPuesto] = useState('');
  const [buscar, setBuscar] = useState('');
  const [mesaId, setMesaId] = useState<number | null>(null);
  const [votos, setVotos] = useState('');
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [verMias, setVerMias] = useState(false);
  const refVotos = useRef<HTMLInputElement>(null);

  const cargar = useCallback(() => {
    api.pendientesE14(eleccion.id).then(setPendientes).catch((e) => setError(mensajeError(e)));
    api.misDigitaciones(eleccion.id).then(setMias).catch(() => {});
  }, [api, eleccion.id]);
  useEffect(cargar, [cargar]);

  const localidades = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pendientes ?? []) m.set(p.localidad, (m.get(p.localidad) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pendientes]);
  const puestos = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pendientes ?? []) if (p.localidad === localidad) m.set(p.puesto, (m.get(p.puesto) ?? 0) + 1);
    const t = normalizar(buscar);
    return [...m.entries()].filter(([n]) => !t || normalizar(n).includes(t)).sort((a, b) => a[0].localeCompare(b[0]));
  }, [pendientes, localidad, buscar]);
  const mesas = useMemo(() => (pendientes ?? []).filter((p) => p.localidad === localidad && p.puesto === puesto).sort((a, b) => a.mesa - b.mesa),
    [pendientes, localidad, puesto]);
  const mesa = mesas.find((m) => m.mesa_id === mesaId) ?? null;
  const [recorte, setRecorte] = useState<string | null>(null);
  useEffect(() => {
    setRecorte(null);
    if (mesaId) api.recorteMesa(eleccion.id, mesaId).then(setRecorte).catch(() => {});
  }, [api, eleccion.id, mesaId]);

  const elegirPuesto = (nombre: string) => {
    setPuesto(nombre); setBuscar(''); setError('');
    const primera = (pendientes ?? []).filter((p) => p.localidad === localidad && p.puesto === nombre).sort((a, b) => a.mesa - b.mesa)[0];
    setMesaId(primera?.mesa_id ?? null);
    setTimeout(() => refVotos.current?.focus(), 50);
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(''); setHecho('');
    if (!mesa) { setError('Elige la mesa.'); return; }
    if (!/^\d{1,4}$/.test(votos) || Number(votos) > 1000) { setError('Escribe los votos: un número de 0 a 1000. Si la mesa no tiene votos, escribe 0.'); return; }
    setEnviando(true);
    try {
      await api.digitarE14(eleccion.id, mesa.mesa_id, Number(votos));
      setHecho(`Mesa ${mesa.mesa} de ${mesa.puesto}: ${nVotos(Number(votos))} guardados.`);
      const resto = mesas.filter((m) => m.mesa_id !== mesa.mesa_id);
      setPendientes((ps) => (ps ?? []).filter((p) => p.mesa_id !== mesa.mesa_id));
      const siguiente = resto.find((m) => m.mesa > mesa.mesa) ?? resto[0];
      setVotos('');
      if (siguiente) { setMesaId(siguiente.mesa_id); setTimeout(() => refVotos.current?.focus(), 30); }
      else { setMesaId(null); setPuesto(''); setHecho((h) => `${h} Terminaste este puesto ✓`); }
      onCambio();
      api.misDigitaciones(eleccion.id).then(setMias).catch(() => {});
    } catch (err) { setError(mensajeError(err)); } finally { setEnviando(false); }
  }

  const total = pendientes?.length ?? 0;
  return (
    <>
      <div className="cifras" style={{ marginBottom: '1rem' }}>
        <Cifra icono={Vote} valor={pendientes ? total : null} etiqueta="mesas te faltan" tono={total ? 'info' : 'ok'} />
        <Cifra icono={CheckCircle2} valor={mias.length} etiqueta="mesas que has digitado" tono="ok" />
      </div>
      {pendientes && total === 0 ? <div className="tarjeta vacio">No te quedan mesas por digitar. ¡Bien hecho!</div> : (
        <form className="tarjeta formulario" onSubmit={guardar} noValidate style={{ maxWidth: 720 }}>
          <h2>Digitar una mesa</h2>
          <p className="ayuda" style={{ margin: 0 }}>
            Abre la foto del E14 y escribe <strong>los votos del candidato</strong> en esa mesa.
            {eleccion.modo_digitacion === 'doble' && ' Otra persona digita la misma mesa sin ver tu número; si no coinciden, el administrador la revisa.'}
          </p>
          <label className="campo"><span>1. Localidad</span>
            <select value={localidad} onChange={(e) => { setLocalidad(e.target.value); setPuesto(''); setMesaId(null); setBuscar(''); }}>
              <option value="">Elige…</option>
              {localidades.map(([n, c]) => <option key={n} value={n}>{n} ({c} {c === 1 ? 'mesa' : 'mesas'})</option>)}
            </select>
          </label>
          {localidad && (
            puesto ? (
              <div className="campo"><span>2. Puesto</span>
                <div className="elegido"><div><strong>{puesto}</strong><small>{mesas.length} {mesas.length === 1 ? 'mesa pendiente' : 'mesas pendientes'}</small></div>
                  <button type="button" className="boton chico" onClick={() => { setPuesto(''); setMesaId(null); }}>Cambiar</button></div>
              </div>
            ) : (
              <div className="campo"><span>2. Puesto</span>
                <div className="buscador-lista">
                  <input type="search" placeholder="Busca el puesto…" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar puesto" />
                  <ul>
                    {puestos.slice(0, 60).map(([n, c]) => (
                      <li key={n}><button type="button" onClick={() => elegirPuesto(n)}>{n}<small>{c} {c === 1 ? 'mesa pendiente' : 'mesas pendientes'}</small></button></li>
                    ))}
                    {puestos.length === 0 && <li className="vacio">Ningún puesto coincide.</li>}
                  </ul>
                </div>
              </div>
            )
          )}
          {puesto && (
            <fieldset>
              <legend>3. Mesa</legend>
              <div className="segmentos">
                {mesas.map((m) => (
                  <button type="button" key={m.mesa_id} className="opcion" aria-pressed={m.mesa_id === mesaId}
                    onClick={() => { setMesaId(m.mesa_id); refVotos.current?.focus(); }}>Mesa {m.mesa}</button>
                ))}
              </div>
            </fieldset>
          )}
          {puesto && recorte && (
            <figure className="recorte-digitar">
              <img src={recorte} alt={`Casilla del candidato en el E14 de la mesa ${mesa?.mesa ?? ''}`} />
              <figcaption>Recorte del E14 de esta mesa. Escribe el número que ves.</figcaption>
            </figure>
          )}
          {puesto && (
            <label className="campo"><span>4. Votos del candidato{mesa ? ` en la mesa ${mesa.mesa}` : ''}</span>
              <input ref={refVotos} type="number" inputMode="numeric" min={0} max={1000} value={votos} onChange={(e) => setVotos(e.target.value)}
                placeholder="0" style={{ fontSize: '1.6rem', fontWeight: 700, maxWidth: 220 }} aria-invalid={!!error} />
              <small>Si en la foto no hay votos para el candidato, escribe 0.</small>
            </label>
          )}
          {error && <div className="aviso error" role="alert">{error}</div>}
          {hecho && <div className="aviso ok" role="status">{hecho}</div>}
          {puesto && <button className="boton primario" disabled={enviando || !mesa}>{enviando ? 'Guardando…' : 'Guardar y seguir'}</button>}
        </form>
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
      setMensaje(`Mesa ${m.mesa} de ${m.puesto}: quedó con ${nVotos(votos)}.`);
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
                  {nVotos(v)} <small style={{ fontWeight: 400, color: 'var(--texto-3)' }}>({m.digitaciones.filter((d) => d.votos === v).map((d) => d.por).join(', ')})</small>
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
  useEnVivo(() => api.resultadosE14(eleccion.id).then(setDatos).catch(() => {}), ['e14']);
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
      <div className="cifras" style={{ marginBottom: '1rem' }}>
        <Cifra icono={Target} valor={cumpl == null ? '—' : `${cumpl}%`} etiqueta="de cumplimiento" detalle="en mesas verificadas" tono="ok" />
        <Cifra icono={CheckCircle2} valor={t.confirmados} etiqueta="votos confirmados" detalle="de simpatizantes registrados" />
        <Cifra icono={UserX} valor={t.faltantes} etiqueta="faltantes" detalle="registrados que no aparecen" tono="aviso" />
        <Cifra icono={UserPlus} valor={t.adicionales} etiqueta="votos adicionales" detalle="apoyo fuera de los registrados" tono="info" />
      </div>
      {datos.localidades.some((l) => l.mesas_verificadas > 0) && (
        <div className="graficos" style={{ marginBottom: '1rem' }}>
          <div className="tarjeta">
            <div className="tarjeta-titulo"><h2>Por localidad</h2><small>solo mesas verificadas</small></div>
            <BarrasH limite={10} series={[{ nombre: 'Confirmados', color: SERIES[0] }, { nombre: 'Faltantes', color: SERIES[1] }, { nombre: 'Adicionales', color: SERIES[2] }]}
              filas={[...datos.localidades].filter((l) => l.mesas_verificadas > 0).sort((a, b) => b.votos_reales - a.votos_reales)
                .map((l) => ({ nombre: l.localidad, valores: [l.confirmados, l.faltantes, l.adicionales], detalle: `${formatoNumero(l.votos_reales)} votos en el E14 · ${l.mesas_verificadas}/${l.mesas} mesas` }))} />
          </div>
          {datos.lideres.some((l) => l.cumplimiento != null) && (
            <div className="tarjeta">
              <div className="tarjeta-titulo"><h2>Cumplimiento por líder</h2><small>confirmados / esperados en mesas verificadas</small></div>
              <BarrasH limite={10} max={100} sufijo="%"
                filas={datos.lideres.filter((l) => l.cumplimiento != null).sort((a, b) => (b.cumplimiento ?? 0) - (a.cumplimiento ?? 0))
                  .map((l) => ({ nombre: l.nombre, valores: [Math.round(l.cumplimiento ?? 0)], detalle: `${formatoNumero(l.confirmados)} de ${formatoNumero(l.esperados_verificados ?? 0)}` }))} />
            </div>
          )}
        </div>
      )}

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
