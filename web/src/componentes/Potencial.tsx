// Potencial por puesto: lo que la campaña sacó en una elección anterior
// frente a los simpatizantes registrados hoy. Dice dónde recuperar votos,
// dónde conquistar y dónde ya está consolidado.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, History, MapPin, Target, Trash2, TrendingUp, Upload, Users } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import type { FilaHistoricoResultado, Historico, PotencialPuesto } from '../lib/tipos';
import { mapearHistorico, sumarPorPuesto } from '../lib/mapeoHistorico';
import { descargarExcel, fechaArchivo, type Celda } from '../lib/excel';
import { formatoNumero, mensajeError } from '../lib/utilidades';
import { BarrasH, SERIES } from './Graficos';
import { Cifra, Plegable, QueEs, Ventana } from './Piezas';

type Exportar = (tipo: string, archivo: string, filas: Celda[][], filtros?: Record<string, unknown>) => Promise<void>;
type Categoria = 'recuperar' | 'conquistar' | 'consolidado' | 'resto';
const CATEGORIAS: Record<Categoria, { titulo: string; que: string }> = {
  recuperar: { titulo: 'Recuperar', que: 'Aquí votaron por nosotros, pero hoy tenemos pocos registrados frente a esos votos. Son los votos más fáciles: hay que volver a buscarlos.' },
  conquistar: { titulo: 'Conquistar', que: 'Puestos grandes donde sacamos menos que el promedio. Hay muchos votos en juego si se trabajan.' },
  consolidado: { titulo: 'Consolidado', que: 'Buen resultado antes y buen número de registrados hoy. Mantener, no descuidar.' },
  resto: { titulo: 'Baja prioridad', que: 'Puestos pequeños donde sacamos poco. No vale la pena poner aquí el esfuerzo principal.' },
};

interface Fila extends PotencialPuesto {
  fuerza: number | null;     // % de los válidos (o de los habilitados) que sacamos antes
  cobertura: number | null;  // registrados hoy / votos de antes
  porGanar: number;          // votos estimados por ganar
  categoria: Categoria;
}

const pct1 = (v: number | null) => (v == null ? '—' : `${(Math.round(v * 1000) / 10).toLocaleString('es-CO')}%`);

export default function Potencial({ exportar }: { exportar: Exportar }) {
  const { api, sesion } = useSesion();
  const esAdmin = sesion!.perfil!.rol === 'admin';
  const [historicos, setHistoricos] = useState<Historico[] | null>(null);
  const [id, setId] = useState('');
  const [datos, setDatos] = useState<PotencialPuesto[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cargarLista = useCallback(async () => {
    const h = await api.historicos();
    setHistoricos(h);
    setId((x) => (h.some((y) => y.id === x) ? x : h[0]?.id ?? ''));
  }, [api]);
  useEffect(() => { cargarLista().catch((e) => setError(mensajeError(e))); }, [cargarLista]);
  useEffect(() => {
    setDatos(null);
    if (id) api.potencial(id).then(setDatos).catch((e) => setError(mensajeError(e)));
  }, [api, id]);

  const historico = historicos?.find((h) => h.id === id);
  const filas = useMemo(() => (datos ? clasificar(datos) : []), [datos]);

  const borrar = async () => {
    if (!historico || !confirm(`¿Borrar la carga "${historico.nombre}"? Se puede volver a subir.`)) return;
    try { await api.eliminarHistorico(historico.id); await cargarLista(); } catch (e) { setError(mensajeError(e)); }
  };

  if (!historicos) return <div className="tarjeta vacio">Cargando…</div>;

  return (
    <>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}
      <div className="tarjeta" style={{ marginBottom: '1rem' }}>
        <div className="tarjeta-titulo">
          <h2><History className="icono" aria-hidden /> Comparar con una elección anterior <QueEs>Se suben los votos que sacó el candidato (o el partido) en una elección pasada, por puesto o por mesa. Con eso se ve dónde hay votos por recuperar y dónde por conquistar.</QueEs></h2>
          {esAdmin && <button className="boton chico" onClick={() => setCargando(true)}><Upload className="icono" aria-hidden />Subir resultados</button>}
        </div>
        {historicos.length === 0 ? (
          <p className="ayuda">
            Todavía no hay resultados anteriores. {esAdmin
              ? 'Descarga de la Registraduría los resultados por puesto o por mesa de la elección que quieras comparar (por ejemplo Senado 2022), y súbelos aquí.'
              : 'Pídele al administrador que suba los resultados de una elección anterior.'}
          </p>
        ) : (
          <div className="filtros" style={{ alignItems: 'center' }}>
            <select value={id} onChange={(e) => setId(e.target.value)} aria-label="Elección anterior">
              {historicos.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
            </select>
            {historico && <span className="ayuda">{formatoNumero(historico.votos)} votos en {historico.puestos} puestos</span>}
            {esAdmin && historico && <button className="boton chico" onClick={borrar}><Trash2 className="icono" aria-hidden />Borrar carga</button>}
          </div>
        )}
      </div>

      {id && (datos == null ? <div className="tarjeta vacio">Calculando…</div> : <Analisis filas={filas} nombre={historico?.nombre ?? ''} exportar={exportar} />)}
      {cargando && <Cargar alCerrar={() => setCargando(false)} alGuardar={async (nuevo) => { setCargando(false); await cargarLista(); const h = (await api.historicos()).find((x) => x.nombre === nuevo); if (h) setId(h.id); }} />}
    </>
  );
}

function clasificar(datos: PotencialPuesto[]): Fila[] {
  const conValidos = datos.filter((d) => d.validos_antes);
  const usarValidos = conValidos.length >= datos.filter((d) => d.votos_antes > 0).length * 0.8;
  const base = (d: PotencialPuesto) => (usarValidos ? d.validos_antes : d.habilitados) ?? null;
  const totVotos = datos.reduce((a, d) => a + d.votos_antes, 0);
  const totBase = datos.reduce((a, d) => a + (base(d) ?? 0), 0);
  const promedio = totBase > 0 ? totVotos / totBase : 0;
  // "Grande" = tercio superior por tamaño
  const tamanos = datos.map((d) => base(d) ?? 0).sort((a, b) => a - b);
  const corteGrande = tamanos[Math.floor(tamanos.length * 0.66)] ?? 0;
  return datos.map((d) => {
    const b = base(d);
    const fuerza = b ? d.votos_antes / b : null;
    const cobertura = d.votos_antes > 0 ? d.simpatizantes / d.votos_antes : null;
    let categoria: Categoria = 'resto';
    let porGanar = 0;
    if (fuerza != null && fuerza >= promedio && d.votos_antes > 0) {
      categoria = (cobertura ?? 0) < 0.5 ? 'recuperar' : 'consolidado';
      porGanar = Math.max(0, d.votos_antes - d.simpatizantes);
    } else if (b != null && b >= corteGrande) {
      categoria = 'conquistar';
      porGanar = Math.max(0, Math.round(b * promedio) - Math.max(d.votos_antes, d.simpatizantes));
    }
    return { ...d, fuerza, cobertura, porGanar, categoria };
  });
}

function Analisis({ filas, nombre, exportar }: { filas: Fila[]; nombre: string; exportar: Exportar }) {
  const votos = filas.reduce((a, f) => a + f.votos_antes, 0);
  const validos = filas.reduce((a, f) => a + (f.validos_antes ?? 0), 0);
  const hoy = filas.reduce((a, f) => a + f.simpatizantes, 0);
  const porGanar = filas.reduce((a, f) => a + f.porGanar, 0);
  const superados = filas.filter((f) => f.votos_antes > 0 && f.simpatizantes >= f.votos_antes).length;
  const conVotos = filas.filter((f) => f.votos_antes > 0).length;
  const ranking = [...filas].filter((f) => f.porGanar > 0).sort((a, b) => b.porGanar - a.porGanar);

  const porLocalidad = useMemo(() => {
    const m = new Map<string, { antes: number; hoy: number; ganar: number }>();
    for (const f of filas) {
      const x = m.get(f.localidad) ?? { antes: 0, hoy: 0, ganar: 0 };
      x.antes += f.votos_antes; x.hoy += f.simpatizantes; x.ganar += f.porGanar;
      m.set(f.localidad, x);
    }
    return [...m.entries()].sort((a, b) => b[1].ganar - a[1].ganar);
  }, [filas]);

  const descargar = () => exportar('potencial_puestos', 'Potencial_por_puesto', [
    ['Localidad', 'Puesto', 'Categoría', `Votos ${nombre}`, 'Votos válidos', '% sacado', 'Simpatizantes hoy', 'Confirmados', 'Registrados / votos de antes', 'Votos por ganar (estimado)'],
    ...[...filas].sort((a, b) => b.porGanar - a.porGanar).map((f) => [f.localidad, f.puesto, CATEGORIAS[f.categoria].titulo, f.votos_antes, f.validos_antes,
      f.fuerza == null ? null : Math.round(f.fuerza * 1000) / 10, f.simpatizantes, f.confirmados,
      f.cobertura == null ? null : Math.round(f.cobertura * 100) / 100, f.porGanar]),
  ], { historico: nombre });

  return (
    <>
      <div className="cifras">
        <Cifra icono={History} valor={formatoNumero(votos)} etiqueta={`votos en ${nombre}`} detalle={validos ? `${pct1(votos / validos)} de los votos válidos` : undefined} />
        <Cifra icono={Users} valor={votos ? `${Math.round((100 * hoy) / votos)}%` : '—'} etiqueta="registrados hoy frente a esos votos" tono={hoy >= votos ? 'ok' : 'info'}
          detalle={`${formatoNumero(hoy)} simpatizantes registrados`} />
        <Cifra icono={Target} valor={formatoNumero(porGanar)} etiqueta="votos por ganar (estimado)" tono="aviso" detalle="Si cada puesto llega al promedio de la campaña" />
        <Cifra icono={TrendingUp} valor={`${superados} de ${conVotos}`} etiqueta="puestos donde ya hay más registrados que votos de antes" tono="ok" />
      </div>

      <div className="graficos seccion">
        <div className="tarjeta">
          <div className="tarjeta-titulo">
            <h2>Dónde hay más votos por ganar <QueEs>Por puesto: en los fuertes, los votos de antes que todavía no están registrados; en los grandes y débiles, lo que falta para llegar al promedio de la campaña.</QueEs></h2>
            <button className="boton chico" onClick={descargar}><Download className="icono" aria-hidden />Excel</button>
          </div>
          <BarrasH limite={10} vacio="No hay votos por ganar: todo está cubierto."
            filas={ranking.map((f) => ({ nombre: f.puesto, valores: [f.porGanar], detalle: `${f.localidad} · ${CATEGORIAS[f.categoria].titulo} · antes ${formatoNumero(f.votos_antes)} (${pct1(f.fuerza)}) · hoy ${formatoNumero(f.simpatizantes)} registrados` }))} />
        </div>
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2><MapPin className="icono" aria-hidden /> Por localidad</h2><small>votos de antes frente a registrados hoy</small></div>
          <BarrasH limite={10}
            series={[{ nombre: `Votos ${nombre}`, color: SERIES[0] }, { nombre: 'Registrados hoy', color: SERIES[2] }]}
            filas={porLocalidad.map(([n, x]) => ({ nombre: n, valores: [x.antes, x.hoy], detalle: `${formatoNumero(x.ganar)} votos por ganar` }))} />
        </div>
      </div>

      {(['recuperar', 'conquistar', 'consolidado', 'resto'] as Categoria[]).map((c) => {
        const lista = filas.filter((f) => f.categoria === c).sort((a, b) => b.porGanar - a.porGanar || b.votos_antes - a.votos_antes);
        if (!lista.length) return null;
        return (
          <div className="seccion" key={c}>
            <Plegable titulo={<>{CATEGORIAS[c].titulo} <QueEs>{CATEGORIAS[c].que}</QueEs></>} cuenta={`${lista.length} puestos`} >
              <div className="envoltura-tabla">
                <table className="tabla apilable">
                  <thead><tr><th>Puesto</th><th className="num">Votos antes</th><th className="num">% sacado</th><th className="num">Registrados hoy</th><th className="num">Por ganar</th></tr></thead>
                  <tbody>
                    {lista.slice(0, 50).map((f) => (
                      <tr key={f.puesto_id}>
                        <td className="principal">{f.puesto}<small>{f.localidad}</small></td>
                        <td className="num" data-etiqueta="Votos antes">{formatoNumero(f.votos_antes)}</td>
                        <td className="num" data-etiqueta="% sacado">{pct1(f.fuerza)}</td>
                        <td className="num" data-etiqueta="Registrados hoy">{formatoNumero(f.simpatizantes)}{f.confirmados ? <small>{f.confirmados} confirmados</small> : null}</td>
                        <td className="num" data-etiqueta="Por ganar"><strong>{formatoNumero(f.porGanar)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lista.length > 50 && <p className="ayuda">Se muestran 50 de {lista.length}. Descarga el Excel para verlos todos.</p>}
            </Plegable>
          </div>
        );
      })}
      <p className="ayuda">Los “votos por ganar” son una estimación para ordenar prioridades, no una promesa: comparan con lo que se sacó antes y con el promedio de la campaña.</p>
    </>
  );
}

function Cargar({ alCerrar, alGuardar }: { alCerrar: () => void; alGuardar: (nombre: string) => void }) {
  const { api } = useSesion();
  const [nombre, setNombre] = useState('');
  const [anio, setAnio] = useState('');
  const [filas, setFilas] = useState<Record<string, string>[] | null>(null);
  const [info, setInfo] = useState<{ archivo: string; filasArchivo: number; porMesa: boolean; conValidos: boolean } | null>(null);
  const [repetidas, setRepetidas] = useState<{ fila: number; mensaje: string }[]>([]);
  const [reporte, setReporte] = useState<FilaHistoricoResultado[] | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const leer = async (f: File) => {
    setError(''); setFilas(null); setReporte(null); setInfo(null);
    try {
      const { default: leerExcel } = await import('read-excel-file');
      const hoja = await leerExcel(f);
      const inicio = hoja.findIndex((r) => r.filter((c) => c != null && String(c).trim()).length >= 2);
      if (inicio < 0) throw new Error('El archivo está vacío.');
      const m = mapearHistorico(hoja[inicio]);
      if (m.faltan.length) throw new Error(`No encontramos estas columnas: ${m.faltan.join(', ')}. Revisa los títulos de la primera fila.`);
      const r = sumarPorPuesto(hoja.slice(inicio + 1), m.mapeo, inicio + 2);
      setFilas(r.filas); setRepetidas(r.repetidas);
      setInfo({ archivo: f.name, filasArchivo: hoja.length - inicio - 1, porMesa: m.porMesa, conValidos: m.conValidos });
      if (!nombre) { const a = f.name.match(/20\d\d/)?.[0]; if (a && !anio) setAnio(a); }
      setOcupado(true);
      setReporte(await api.importarHistorico(nombre || 'revisión', null, r.filas, false));
    } catch (e) { setError(mensajeError(e)); } finally { setOcupado(false); }
  };
  const guardar = async () => {
    setError('');
    if (!nombre.trim()) return setError('Ponle un nombre, por ejemplo: Senado 2022.');
    setOcupado(true);
    try {
      await api.importarHistorico(nombre, anio ? Number(anio) : null, filas!, true);
      alGuardar(nombre.trim());
    } catch (e) { setError(mensajeError(e)); } finally { setOcupado(false); }
  };
  const plantilla = () => descargarExcel(`Plantilla_resultados_anteriores_${fechaArchivo()}.xlsx`, [{
    nombre: 'Resultados', anchos: [18, 8, 14, 40, 8, 10, 14],
    filas: [['Localidad', 'Zona', 'Código puesto', 'Puesto', 'Mesa', 'Votos', 'Votos válidos'],
      ['Usaquén', '01', '01', 'Nombre del puesto', 1, 35, 280], ['Usaquén', '01', '01', 'Nombre del puesto', 2, 41, 300]],
  }]);

  const ok = reporte?.filter((r) => r.estado === 'ok').length ?? 0;
  const errores = [...repetidas.map((r) => ({ fila: r.fila, mensaje: r.mensaje })), ...(reporte ?? []).filter((r) => r.estado === 'error').map((r) => ({ fila: r.fila, mensaje: r.mensaje ?? '' }))];
  const votos = (reporte ?? []).filter((r) => r.estado === 'ok').reduce((a, r) => a + (r.votos ?? 0), 0);

  return (
    <Ventana titulo="Subir resultados de una elección anterior" icono={Upload} alCerrar={alCerrar}>
      <p className="ayuda">Excel con los votos por <strong>puesto</strong> o por <strong>mesa</strong> (se suman solos). Columnas: Localidad y Puesto, o Zona y Código de puesto; Votos; y si los tienes, Votos válidos.{' '}
        <button type="button" className="enlace" onClick={plantilla}>Descargar plantilla</button></p>
      <div className="fila-campos">
        <label className="campo"><span>Nombre</span><input type="text" placeholder="Senado 2022" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
        <label className="campo" style={{ maxWidth: 120 }}><span>Año</span><input type="number" min={1990} max={2100} value={anio} onChange={(e) => setAnio(e.target.value)} /></label>
      </div>
      <label className="campo"><span>Archivo (.xlsx)</span>
        <input type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) leer(f); }} />
      </label>
      {ocupado && <p className="ayuda">Revisando…</p>}
      {info && reporte && (
        <div className={`aviso ${errores.length ? 'atencion' : 'ok'}`} style={{ marginTop: '0.5rem' }}>
          {info.archivo}: {formatoNumero(info.filasArchivo)} filas{info.porMesa ? ' por mesa' : ''} → <strong>{ok} puestos reconocidos</strong> con {formatoNumero(votos)} votos.
          {!info.conValidos && ' Sin columna de votos válidos: el porcentaje se calcula sobre los habilitados.'}
          {errores.length > 0 && <> {errores.length} {errores.length === 1 ? 'fila con problema' : 'filas con problemas'} (no se guardan):</>}
        </div>
      )}
      {errores.length > 0 && (
        <ul className="ayuda" style={{ maxHeight: 160, overflowY: 'auto', margin: '0.5rem 0', paddingLeft: '1.1rem' }}>
          {errores.slice(0, 100).map((e, i) => <li key={i}>Fila {e.fila}: {e.mensaje}</li>)}
        </ul>
      )}
      {error && <div className="aviso error" role="alert" style={{ marginTop: '0.5rem' }}>{error}</div>}
      <div className="acciones" style={{ marginTop: '0.75rem', justifyContent: 'flex-end' }}>
        <button className="boton" onClick={alCerrar}>Cancelar</button>
        <button className="boton primario" onClick={guardar} disabled={ocupado || !ok}>Guardar {ok ? `${ok} puestos` : ''}</button>
      </div>
    </Ventana>
  );
}
