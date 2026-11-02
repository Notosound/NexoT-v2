// Análisis: jerarquía localidad → puesto → mesa, calidad de los datos,
// rendimiento de líderes y simulación de campaña. Solo cifras agregadas;
// todo se puede exportar a Excel (queda registrado en la auditoría).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion';
import type {
  CalidadLider, Demografia, Eleccion, LiderE14, LocalidadE14, MesaE14, PuestoCenso, PuestoCodigos, PuestoE14, RegistrosMesa, Tendencia,
} from '../lib/tipos';
import { descargarExcel, fechaArchivo, type Celda } from '../lib/excel';
import { formatoNumero, mensajeError } from '../lib/utilidades';

type Pestana = 'jerarquia' | 'calidad' | 'lideres' | 'simulacion';
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : null);
const porMil = (a: number, b: number) => (b > 0 ? Math.round((10000 * a) / b) / 10 : 0);
const fmtPct = (v: number | null) => (v == null ? '—' : `${v}%`);

interface Datos {
  demo: Demografia[];
  censo: Map<number, PuestoCenso>;
  codigos: Map<number, PuestoCodigos>;
  porMesa: RegistrosMesa[];
  calidad: CalidadLider[];
  tendencia: Tendencia[];
  elecciones: Eleccion[];
}

export default function Analisis() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const [pestana, setPestana] = useState<Pestana>('jerarquia');
  const [datos, setDatos] = useState<Datos | null>(null);
  const [eleccionId, setEleccionId] = useState('');
  const [e14, setE14] = useState<{ localidades: LocalidadE14[]; puestos: PuestoE14[]; lideres: LiderE14[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.demografia(), api.censoPuestos(), api.puestosConCodigos(), api.registrosMesa(), api.calidadLideres(), api.tendencia(), api.elecciones()])
      .then(([demo, censo, codigos, porMesa, calidad, tendencia, elecciones]) => {
        setDatos({ demo, censo: new Map(censo.map((c) => [c.id, c])), codigos: new Map(codigos.map((c) => [c.id, c])), porMesa, calidad, tendencia, elecciones });
        setEleccionId(elecciones[0]?.id ?? '');
      })
      .catch((e) => setError(mensajeError(e)));
  }, [api]);

  useEffect(() => {
    setE14(null);
    if (eleccionId) api.resultadosE14(eleccionId).then(setE14).catch(() => {});
  }, [api, eleccionId]);

  async function exportar(tipo: string, archivo: string, filas: Celda[][], filtros: Record<string, unknown> = {}) {
    try {
      await api.registrarExportacion(tipo, filas.length - 1, filtros);
      await descargarExcel(`${archivo}_${fechaArchivo()}.xlsx`, [{ nombre: tipo, filas }]);
    } catch (e) { setError(mensajeError(e)); }
  }

  return (
    <>
      <div className="encabezado">
        <div><h1>Análisis</h1><p>Toda la información de la campaña, de lo general al detalle de cada mesa.</p></div>
        {datos && datos.elecciones.length > 0 && (
          <label className="campo" style={{ minWidth: 220 }}><span>Cruzar con E14</span>
            <select value={eleccionId} onChange={(e) => setEleccionId(e.target.value)}>
              <option value="">Sin cruzar</option>
              {datos.elecciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
        )}
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}
      <div className="pestanas" role="tablist">
        {([['jerarquia', 'Localidad → puesto → mesa'], ['calidad', 'Calidad de los datos'], ['lideres', 'Rendimiento de líderes'], ['simulacion', 'Simulación']] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </div>
      {!datos ? <div className="tarjeta vacio">Cargando…</div> : (
        <>
          {pestana === 'jerarquia' && <Jerarquia datos={datos} e14={eleccionId ? e14 : null} eleccionId={eleccionId} exportar={exportar} />}
          {pestana === 'calidad' && <Calidad datos={datos} esAdmin={rol === 'admin'} exportar={exportar} />}
          {pestana === 'lideres' && <Lideres datos={datos} e14={eleccionId ? e14 : null} exportar={exportar} />}
          {pestana === 'simulacion' && <Simulacion datos={datos} exportar={exportar} />}
        </>
      )}
    </>
  );
}

type Exportar = (tipo: string, archivo: string, filas: Celda[][], filtros?: Record<string, unknown>) => Promise<void>;

function BotonExportar({ onClick }: { onClick: () => void }) {
  return <button className="boton chico" onClick={onClick}>Exportar a Excel</button>;
}

// ── Jerarquía ─────────────────────────────────────────────────────────
function Jerarquia({ datos, e14, eleccionId, exportar }: { datos: Datos; e14: { localidades: LocalidadE14[]; puestos: PuestoE14[] } | null; eleccionId: string; exportar: Exportar }) {
  const { api } = useSesion();
  const [localidad, setLocalidad] = useState<{ id: number; nombre: string } | null>(null);
  const [puesto, setPuesto] = useState<{ id: number; nombre: string } | null>(null);
  const [mesasE14, setMesasE14] = useState<MesaE14[]>([]);

  useEffect(() => {
    setMesasE14([]);
    if (puesto && eleccionId) api.mesasE14(eleccionId, puesto.id).then(setMesasE14).catch(() => {});
  }, [api, puesto, eleccionId]);

  const porPuesto = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of datos.demo) if (d.puesto_id != null) m.set(d.puesto_id, (m.get(d.puesto_id) ?? 0) + d.personas);
    return m;
  }, [datos.demo]);
  const mesasPorPuesto = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of datos.porMesa) m.set(r.puesto_id, (m.get(r.puesto_id) ?? 0) + 1);
    return m;
  }, [datos.porMesa]);
  const sinLugar = datos.demo.filter((d) => d.puesto_id == null).reduce((s, d) => s + d.personas, 0);
  const e14Loc = new Map((e14?.localidades ?? []).map((x) => [x.localidad_id, x]));
  const e14Puesto = new Map((e14?.puestos ?? []).map((x) => [x.puesto_id, x]));
  const cumpl = (x?: { confirmados: number; faltantes: number }) => (x ? pct(x.confirmados, x.confirmados + x.faltantes) : null);

  const localidades = useMemo(() => {
    const m = new Map<number, { id: number; nombre: string; personas: number; censo: number; puestos: number; puestosCon: number; mesasCon: number }>();
    for (const p of datos.censo.values()) {
      const nombre = datos.codigos.get(p.id)?.localidad ?? '';
      const e = m.get(p.localidad_id) ?? { id: p.localidad_id, nombre, personas: 0, censo: 0, puestos: 0, puestosCon: 0, mesasCon: 0 };
      const n = porPuesto.get(p.id) ?? 0;
      e.censo += p.censo_total; e.puestos++; e.personas += n;
      if (n) e.puestosCon++;
      e.mesasCon += mesasPorPuesto.get(p.id) ?? 0;
      m.set(p.localidad_id, e);
    }
    return [...m.values()].sort((a, b) => b.personas - a.personas);
  }, [datos, porPuesto, mesasPorPuesto]);

  const puestos = useMemo(() => !localidad ? [] : [...datos.censo.values()]
    .filter((p) => p.localidad_id === localidad.id)
    .map((p) => ({ id: p.id, nombre: p.nombre, personas: porPuesto.get(p.id) ?? 0, censo: p.censo_total, mesas: datos.codigos.get(p.id)?.mesas_total ?? 0, mesasCon: mesasPorPuesto.get(p.id) ?? 0 }))
    .sort((a, b) => b.personas - a.personas || a.nombre.localeCompare(b.nombre)), [datos, localidad, porPuesto, mesasPorPuesto]);

  const mesas = useMemo(() => {
    if (!puesto) return [];
    const total = datos.codigos.get(puesto.id)?.mesas_total ?? 0;
    const reg = new Map(datos.porMesa.filter((r) => r.puesto_id === puesto.id).map((r) => [r.mesa, r.personas]));
    const e = new Map(mesasE14.map((m) => [m.mesa, m]));
    return Array.from({ length: total }, (_, i) => i + 1).map((n) => ({ mesa: n, personas: reg.get(n) ?? 0, e14: e.get(n) }))
      .filter((m) => m.personas > 0 || m.e14);
  }, [datos, puesto, mesasE14]);

  const conE14 = !!e14;
  const colsE14 = (x?: { confirmados: number; faltantes: number; adicionales: number }) => conE14 && (
    <>
      <td className="num solo-ancho">{x ? formatoNumero(x.confirmados) : '—'}</td>
      <td className="num">{fmtPct(cumpl(x))}</td>
    </>
  );

  return (
    <div className="tarjeta">
      <nav className="migas" aria-label="Nivel">
        <button className="enlace" onClick={() => { setLocalidad(null); setPuesto(null); }}>Bogotá</button>
        {localidad && <> › <button className="enlace" onClick={() => setPuesto(null)}>{localidad.nombre}</button></>}
        {puesto && <> › <span>{puesto.nombre}</span></>}
      </nav>

      {!localidad && (
        <>
          <div className="encabezado"><p>{formatoNumero(localidades.reduce((s, l) => s + l.personas, 0))} simpatizantes con puesto confirmado{sinLugar > 0 && ` · ${formatoNumero(sinLugar)} sin lugar de votación`}</p>
            <BotonExportar onClick={() => exportar('localidades', 'Analisis_localidades', [
              ['Localidad', 'Simpatizantes', 'Votantes (censo)', 'Por cada 1.000', 'Puestos con simpatizantes', 'Puestos', 'Mesas con simpatizantes', ...(conE14 ? ['Confirmados E14', 'Cumplimiento %'] : [])],
              ...localidades.map((l) => [l.nombre, l.personas, l.censo, porMil(l.personas, l.censo), l.puestosCon, l.puestos, l.mesasCon,
                ...(conE14 ? [e14Loc.get(l.id)?.confirmados ?? 0, cumpl(e14Loc.get(l.id)) ?? ''] : [])]),
            ])} />
          </div>
          <div className="envoltura-tabla"><table className="tabla compacta">
            <thead><tr><th>Localidad</th><th className="num">Simpatizantes</th><th className="num solo-ancho">Censo</th><th className="num">Por 1.000</th><th className="num solo-ancho">Puestos</th><th className="num solo-ancho">Mesas</th>{conE14 && <><th className="num solo-ancho">Confirmados E14</th><th className="num">Cumpl.</th></>}</tr></thead>
            <tbody>{localidades.map((l) => (
              <tr key={l.id}>
                <td><button className="enlace" onClick={() => setLocalidad({ id: l.id, nombre: l.nombre })}>{l.nombre}</button></td>
                <td className="num">{formatoNumero(l.personas)}</td>
                <td className="num solo-ancho">{formatoNumero(l.censo)}</td>
                <td className="num">{porMil(l.personas, l.censo).toLocaleString('es-CO')}</td>
                <td className="num solo-ancho">{l.puestosCon}/{l.puestos}</td>
                <td className="num solo-ancho">{formatoNumero(l.mesasCon)}</td>
                {colsE14(e14Loc.get(l.id))}
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      {localidad && !puesto && (
        <>
          <div className="encabezado"><p>{puestos.filter((p) => p.personas).length} de {puestos.length} puestos con simpatizantes</p>
            <BotonExportar onClick={() => exportar('puestos', `Analisis_puestos_${localidad.nombre}`, [
              ['Puesto', 'Simpatizantes', 'Votantes (censo)', 'Por cada 1.000', 'Mesas con simpatizantes', 'Mesas', ...(conE14 ? ['Confirmados E14', 'Cumplimiento %'] : [])],
              ...puestos.map((p) => [p.nombre, p.personas, p.censo, porMil(p.personas, p.censo), p.mesasCon, p.mesas,
                ...(conE14 ? [e14Puesto.get(p.id)?.confirmados ?? 0, cumpl(e14Puesto.get(p.id)) ?? ''] : [])]),
            ], { localidad: localidad.nombre })} />
          </div>
          <div className="envoltura-tabla"><table className="tabla compacta">
            <thead><tr><th>Puesto</th><th className="num">Simpatizantes</th><th className="num solo-ancho">Censo</th><th className="num">Por 1.000</th><th className="num solo-ancho">Mesas</th>{conE14 && <><th className="num solo-ancho">Confirmados E14</th><th className="num">Cumpl.</th></>}</tr></thead>
            <tbody>{puestos.map((p) => (
              <tr key={p.id}>
                <td>{p.personas || e14Puesto.has(p.id) ? <button className="enlace" onClick={() => setPuesto({ id: p.id, nombre: p.nombre })}>{p.nombre}</button> : p.nombre}</td>
                <td className="num">{formatoNumero(p.personas)}</td>
                <td className="num solo-ancho">{formatoNumero(p.censo)}</td>
                <td className="num">{porMil(p.personas, p.censo).toLocaleString('es-CO')}</td>
                <td className="num solo-ancho">{p.mesasCon}/{p.mesas}</td>
                {colsE14(e14Puesto.get(p.id))}
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      {puesto && (
        <>
          <div className="encabezado"><p>{mesas.length} mesas con simpatizantes{conE14 ? ' o votos' : ''}</p>
            <BotonExportar onClick={() => exportar('mesas', `Analisis_mesas_${puesto.nombre}`, [
              ['Mesa', 'Simpatizantes', ...(conE14 ? ['Estado E14', 'Votos E14', 'Confirmados', 'Faltantes', 'Adicionales'] : [])],
              ...mesas.map((m) => [m.mesa, m.personas, ...(conE14 ? [m.e14?.estado ?? 'pendiente', m.e14?.votos_reales ?? '', m.e14?.confirmados ?? '', m.e14?.faltantes ?? '', m.e14?.adicionales ?? ''] : [])]),
            ], { puesto: puesto.nombre })} />
          </div>
          <div className="envoltura-tabla"><table className="tabla compacta">
            <thead><tr><th>Mesa</th><th className="num">Simpatizantes</th>{conE14 && <><th className="num">Votos E14</th><th className="num">Confirmados</th><th className="num">Faltantes</th><th className="num">Adicionales</th></>}</tr></thead>
            <tbody>{mesas.map((m) => (
              <tr key={m.mesa}>
                <td>Mesa {m.mesa}</td>
                <td className="num">{m.personas}</td>
                {conE14 && <>
                  <td className="num">{m.e14?.votos_reales ?? '—'}</td>
                  <td className="num">{m.e14?.confirmados ?? '—'}</td>
                  <td className="num">{m.e14?.faltantes ?? '—'}</td>
                  <td className="num">{m.e14?.adicionales ?? '—'}</td>
                </>}
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}

// ── Calidad de los datos ──────────────────────────────────────────────
const PROBLEMAS: { k: keyof CalidadLider; texto: string }[] = [
  { k: 'por_revisar', texto: 'Puesto por revisar' },
  { k: 'sin_lugar', texto: 'Sin lugar de votación' },
  { k: 'sin_mesa', texto: 'Sin mesa' },
  { k: 'sin_sexo', texto: 'Sin sexo' },
  { k: 'sin_edad', texto: 'Sin edad' },
  { k: 'sin_telefono', texto: 'Sin teléfono' },
  { k: 'sin_consentimiento', texto: 'Sin autorización de datos' },
];

function Calidad({ datos, esAdmin, exportar }: { datos: Datos; esAdmin: boolean; exportar: Exportar }) {
  const t = datos.calidad.reduce((s, l) => {
    for (const k of ['total', 'ubicados', ...PROBLEMAS.map((p) => p.k)] as (keyof CalidadLider)[]) s[k] = (s[k] ?? 0) + Number(l[k] ?? 0);
    return s;
  }, {} as Record<string, number>);
  return (
    <>
      <div className="rejilla cifras" style={{ marginBottom: '1rem' }}>
        <div className="tarjeta cifra"><span className="valor">{fmtPct(pct(t.ubicados ?? 0, t.total ?? 0))}</span><span className="etiqueta">con puesto y mesa confirmados ({formatoNumero(t.ubicados ?? 0)} de {formatoNumero(t.total ?? 0)})</span></div>
        {PROBLEMAS.map((p) => (
          <div key={p.k} className={`tarjeta cifra ${(t[p.k] ?? 0) > 0 ? 'alerta' : ''}`}>
            <span className="valor">{formatoNumero(t[p.k] ?? 0)}</span><span className="etiqueta">{p.texto.toLowerCase()}</span>
          </div>
        ))}
      </div>
      {esAdmin && (t.por_revisar ?? 0) > 0 && <div className="aviso atencion" style={{ marginBottom: '1rem' }}><p>{formatoNumero(t.por_revisar)} personas tienen el puesto por revisar. <Link to="/revision">Resolverlas</Link></p></div>}
      <div className="tarjeta">
        <div className="encabezado"><h2 style={{ margin: 0 }}>Por líder</h2>
          <BotonExportar onClick={() => exportar('calidad', 'Calidad_de_datos', [
            ['Líder', 'Registrados', 'Ubicados', '% ubicados', ...PROBLEMAS.map((p) => p.texto), 'Importados'],
            ...datos.calidad.map((l) => [l.nombre, l.total, l.ubicados, pct(l.ubicados, l.total) ?? '', ...PROBLEMAS.map((p) => Number(l[p.k])), l.importados]),
          ])} />
        </div>
        <div className="envoltura-tabla"><table className="tabla compacta">
          <thead><tr><th>Líder</th><th className="num">Registrados</th><th className="num">% ubicados</th>{PROBLEMAS.map((p) => <th key={p.k} className="num solo-ancho">{p.texto}</th>)}</tr></thead>
          <tbody>{[...datos.calidad].sort((a, b) => (pct(a.ubicados, a.total) ?? 101) - (pct(b.ubicados, b.total) ?? 101)).map((l) => (
            <tr key={l.lider_id}>
              <td>{l.nombre}</td><td className="num">{formatoNumero(l.total)}</td><td className="num">{fmtPct(pct(l.ubicados, l.total))}</td>
              {PROBLEMAS.map((p) => <td key={p.k} className="num solo-ancho">{Number(l[p.k]) || ''}</td>)}
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  );
}

// ── Rendimiento de líderes ────────────────────────────────────────────
function Lideres({ datos, e14, exportar }: { datos: Datos; e14: { lideres: LiderE14[] } | null; exportar: Exportar }) {
  const [orden, setOrden] = useState<'registrados' | 'meta' | 'cumplimiento' | 'nombre'>('registrados');
  const e = new Map((e14?.lideres ?? []).map((l) => [l.lider_id, l]));
  const filas = datos.calidad.map((l) => ({
    ...l, avance: pct(l.total, l.meta_votos), ubicadosPct: pct(l.ubicados, l.total),
    e14: e.get(l.lider_id), dias: l.ultimo_registro ? Math.floor((Date.now() - new Date(l.ultimo_registro).getTime()) / 864e5) : null,
  })).sort((a, b) => orden === 'nombre' ? a.nombre.localeCompare(b.nombre)
    : orden === 'meta' ? (b.avance ?? -1) - (a.avance ?? -1)
    : orden === 'cumplimiento' ? (b.e14?.cumplimiento ?? -1) - (a.e14?.cumplimiento ?? -1)
    : b.total - a.total);
  return (
    <div className="tarjeta">
      <div className="encabezado">
        <label className="campo" style={{ maxWidth: 240 }}><span>Ordenar por</span>
          <select value={orden} onChange={(ev) => setOrden(ev.target.value as typeof orden)}>
            <option value="registrados">Más registrados</option><option value="meta">Avance de la meta</option>
            {e14 && <option value="cumplimiento">Cumplimiento E14</option>}<option value="nombre">Nombre</option>
          </select>
        </label>
        <BotonExportar onClick={() => exportar('lideres', 'Rendimiento_lideres', [
          ['Líder', 'Registrados', 'Meta', '% meta', '% ubicados', 'Días desde el último registro', ...(e14 ? ['Confirmados E14', 'Cumplimiento E14 %'] : [])],
          ...filas.map((l) => [l.nombre, l.total, l.meta_votos, l.avance ?? '', l.ubicadosPct ?? '', l.dias ?? '', ...(e14 ? [l.e14?.confirmados ?? '', l.e14?.cumplimiento ?? ''] : [])]),
        ])} />
      </div>
      <div className="envoltura-tabla"><table className="tabla compacta">
        <thead><tr><th>Líder</th><th className="num">Registrados</th><th className="num">Meta</th><th className="num solo-ancho">% ubicados</th><th className="num solo-ancho">Último registro</th>{e14 && <th className="num">Cumpl. E14</th>}</tr></thead>
        <tbody>{filas.map((l) => (
          <tr key={l.lider_id}>
            <td>{l.nombre}</td>
            <td className="num">{formatoNumero(l.total)}</td>
            <td className="num">{l.meta_votos ? <span className="cumplimiento"><span className="pista"><span style={{ width: `${Math.min(100, l.avance ?? 0)}%` }} /></span>{l.avance}%</span> : '—'}</td>
            <td className="num solo-ancho">{fmtPct(l.ubicadosPct)}</td>
            <td className="num solo-ancho">{l.dias == null ? '—' : l.dias === 0 ? 'hoy' : `hace ${l.dias} d`}</td>
            {e14 && <td className="num">{l.e14?.cumplimiento == null ? '—' : `${Math.round(l.e14.cumplimiento)}%`}</td>}
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

// ── Simulación de campaña ─────────────────────────────────────────────
const ESCENARIOS = {
  conservador: { crecimiento: 3, recuperacion: 5, movLideres: 2, movTerritorial: 2 },
  moderado: { crecimiento: 8, recuperacion: 12, movLideres: 5, movTerritorial: 4 },
  optimista: { crecimiento: 15, recuperacion: 20, movLideres: 8, movTerritorial: 7 },
} as const;
type Escenario = keyof typeof ESCENARIOS | 'personalizado';

function Simulacion({ datos, exportar }: { datos: Datos; exportar: Exportar }) {
  const [escenario, setEscenario] = useState<Escenario>('moderado');
  const [p, setP] = useState<{ crecimiento: number; recuperacion: number; movLideres: number; movTerritorial: number }>({ ...ESCENARIOS.moderado });
  const [fecha, setFecha] = useState('');
  const [locSel, setLocSel] = useState<Set<number>>(new Set());
  const [lidSel, setLidSel] = useState<Set<string>>(new Set());

  const elegir = (e: Escenario) => { setEscenario(e); if (e !== 'personalizado') setP({ ...ESCENARIOS[e] }); };
  const cambiar = (k: keyof typeof p, v: string) => { setEscenario('personalizado'); setP((x) => ({ ...x, [k]: Math.max(0, Math.min(100, Number(v) || 0)) })); };

  const r = useMemo(() => {
    const locs = new Map<number, { nombre: string; actual: number }>();
    for (const d of datos.demo) {
      if (d.localidad_id == null) continue;
      const e = locs.get(d.localidad_id) ?? { nombre: d.localidad, actual: 0 };
      e.actual += d.personas; locs.set(d.localidad_id, e);
    }
    const porLocalidad = [...locs.entries()].map(([id, l]) => {
      const crec = Math.round(l.actual * p.crecimiento / 100);
      const terr = !locSel.size || locSel.has(id) ? Math.round(l.actual * p.movTerritorial / 100) : 0;
      return { id, nombre: l.nombre, actual: l.actual, crec, terr, simulado: l.actual + crec + terr };
    }).sort((a, b) => (b.simulado - b.actual) - (a.simulado - a.actual));
    const porLider = datos.calidad.map((l) => {
      const recuperables = l.por_revisar + l.sin_lugar;
      const crec = Math.round(l.total * p.crecimiento / 100);
      const mov = !lidSel.size || lidSel.has(l.lider_id) ? Math.round(l.total * p.movLideres / 100) : 0;
      const rec = Math.round(recuperables * p.recuperacion / 100);
      return { id: l.lider_id, nombre: l.nombre, meta: l.meta_votos, actual: l.total, crec, mov, rec, recuperables, simulado: l.total + crec + mov + rec };
    }).sort((a, b) => (b.simulado - b.actual) - (a.simulado - a.actual));
    const actual = porLider.reduce((s, l) => s + l.actual, 0);
    const terr = porLocalidad.reduce((s, l) => s + l.terr, 0);
    const simulado = porLider.reduce((s, l) => s + l.simulado, 0) + terr;
    const meta = datos.calidad.reduce((s, l) => s + l.meta_votos, 0);
    // Ritmo actual: registros de los últimos 14 días
    const hace14 = Date.now() - 14 * 864e5;
    const ultimos = datos.tendencia.filter((t) => new Date(t.dia + 'T12:00:00').getTime() >= hace14).reduce((s, t) => s + t.nuevos, 0);
    const ritmo = ultimos / 14;
    const dias = fecha ? Math.max(0, Math.ceil((new Date(fecha + 'T23:59:59').getTime() - Date.now()) / 864e5)) : null;
    return {
      porLocalidad, porLider, actual, simulado, meta, ritmo, dias,
      recuperables: porLider.reduce((s, l) => s + l.recuperables, 0),
      alRitmo: dias != null ? Math.round(actual + ritmo * dias) : null,
      necesario: dias && meta > actual ? Math.ceil((meta - actual) / dias) : null,
    };
  }, [datos, p, locSel, lidSel, fecha]);

  const alternar = <T,>(s: Set<T>, v: T) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  return (
    <>
      <div className="tarjeta formulario" style={{ marginBottom: '1rem' }}>
        <div className="campo">
          <span id="esc">Escenario</span>
          <div className="segmentos" role="group" aria-labelledby="esc">
            {(['conservador', 'moderado', 'optimista', 'personalizado'] as const).map((e) => (
              <button key={e} type="button" className="opcion" aria-pressed={escenario === e} onClick={() => elegir(e)}>{e[0].toUpperCase() + e.slice(1)}</button>
            ))}
          </div>
        </div>
        <div className="fila-campos">
          <label className="campo"><span>Crecimiento de la base (%)</span><input type="number" min={0} max={100} value={p.crecimiento} onChange={(e) => cambiar('crecimiento', e.target.value)} /><small>Nuevos simpatizantes sobre los actuales.</small></label>
          <label className="campo"><span>Recuperación de registros incompletos (%)</span><input type="number" min={0} max={100} value={p.recuperacion} onChange={(e) => cambiar('recuperacion', e.target.value)} /><small>De los {formatoNumero(r.recuperables)} sin puesto confirmado.</small></label>
          <label className="campo"><span>Movilización de líderes (%)</span><input type="number" min={0} max={100} value={p.movLideres} onChange={(e) => cambiar('movLideres', e.target.value)} /><small>Esfuerzo adicional de los líderes elegidos.</small></label>
          <label className="campo"><span>Movilización territorial (%)</span><input type="number" min={0} max={100} value={p.movTerritorial} onChange={(e) => cambiar('movTerritorial', e.target.value)} /><small>Trabajo de calle en las localidades elegidas.</small></label>
          <label className="campo"><span>Fecha objetivo <span className="opcional">(opcional)</span></span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        </div>
        <div className="fila-campos">
          <details><summary className="ayuda">Localidades para movilización territorial: {locSel.size ? `${locSel.size} elegidas` : 'todas'}</summary>
            <div className="lista-check">{[...r.porLocalidad].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((l) => (
              <label key={l.id} className="casilla"><input type="checkbox" checked={locSel.has(l.id)} onChange={() => setLocSel((s) => alternar(s, l.id))} /><span>{l.nombre}</span></label>
            ))}</div>
          </details>
          <details><summary className="ayuda">Líderes para movilización: {lidSel.size ? `${lidSel.size} elegidos` : 'todos'}</summary>
            <div className="lista-check">{[...r.porLider].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((l) => (
              <label key={l.id} className="casilla"><input type="checkbox" checked={lidSel.has(l.id)} onChange={() => setLidSel((s) => alternar(s, l.id))} /><span>{l.nombre}</span></label>
            ))}</div>
          </details>
        </div>
      </div>

      <div className="rejilla cifras" style={{ marginBottom: '1rem' }}>
        <div className="tarjeta cifra"><span className="valor">{formatoNumero(r.actual)}</span><span className="etiqueta">simpatizantes hoy</span></div>
        <div className="tarjeta cifra"><span className="valor">{formatoNumero(r.simulado)}</span><span className="etiqueta">proyectados en este escenario (+{formatoNumero(r.simulado - r.actual)})</span></div>
        {r.meta > 0 && <div className="tarjeta cifra"><span className="valor">{fmtPct(pct(r.simulado, r.meta))}</span><span className="etiqueta">de la meta total ({formatoNumero(r.meta)})</span></div>}
        {r.dias != null && <div className="tarjeta cifra"><span className="valor">{formatoNumero(r.alRitmo ?? 0)}</span><span className="etiqueta">al ritmo actual ({r.ritmo.toLocaleString('es-CO', { maximumFractionDigits: 1 })}/día) en {r.dias} días</span></div>}
        {r.necesario != null && <div className="tarjeta cifra alerta"><span className="valor">{formatoNumero(r.necesario)}</span><span className="etiqueta">registros por día para llegar a la meta</span></div>}
      </div>

      <div className="rejilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div className="tarjeta">
          <div className="encabezado"><h2 style={{ margin: 0 }}>Por localidad</h2>
            <BotonExportar onClick={() => exportar('simulacion', 'Simulacion_localidades', [
              ['Localidad', 'Actual', 'Crecimiento', 'Movilización territorial', 'Proyectado'], ...r.porLocalidad.map((l) => [l.nombre, l.actual, l.crec, l.terr, l.simulado]),
            ], { escenario, ...p })} />
          </div>
          <div className="envoltura-tabla"><table className="tabla compacta">
            <thead><tr><th>Localidad</th><th className="num">Actual</th><th className="num">Proyectado</th><th className="num">+</th></tr></thead>
            <tbody>{r.porLocalidad.map((l) => <tr key={l.id}><td>{l.nombre}</td><td className="num">{formatoNumero(l.actual)}</td><td className="num">{formatoNumero(l.simulado)}</td><td className="num">+{formatoNumero(l.simulado - l.actual)}</td></tr>)}</tbody>
          </table></div>
        </div>
        <div className="tarjeta">
          <div className="encabezado"><h2 style={{ margin: 0 }}>Por líder</h2>
            <BotonExportar onClick={() => exportar('simulacion', 'Simulacion_lideres', [
              ['Líder', 'Actual', 'Crecimiento', 'Movilización', 'Recuperados', 'Proyectado', 'Meta'], ...r.porLider.map((l) => [l.nombre, l.actual, l.crec, l.mov, l.rec, l.simulado, l.meta]),
            ], { escenario, ...p })} />
          </div>
          <div className="envoltura-tabla"><table className="tabla compacta">
            <thead><tr><th>Líder</th><th className="num">Actual</th><th className="num">Proyectado</th><th className="num">Meta</th></tr></thead>
            <tbody>{r.porLider.map((l) => <tr key={l.id}><td>{l.nombre}</td><td className="num">{formatoNumero(l.actual)}</td><td className="num">{formatoNumero(l.simulado)}</td><td className="num">{l.meta ? `${formatoNumero(l.meta)} (${pct(l.simulado, l.meta)}%)` : '—'}</td></tr>)}</tbody>
          </table></div>
        </div>
      </div>
      <p className="ayuda" style={{ marginTop: '1rem' }}>La simulación es una proyección con los supuestos de arriba, no un pronóstico. La movilización territorial se suma al total, pero no a cada líder.</p>
    </>
  );
}
