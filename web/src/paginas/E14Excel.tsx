// Subir resultados E14 desde Excel, con plantilla por elección.
// Cada archivo cuenta como la digitación de quien lo sube: la doble
// verificación exige que otra persona distinta coincida.
import { useMemo, useState } from 'react';
import { useSesion } from '../lib/sesion';
import type { Eleccion, ResultadoFilaE14 } from '../lib/tipos';
import { descargarExcel, fechaArchivo } from '../lib/excel';
import { claveMesa, filaE14, mapearE14, type MapeoE14 } from '../lib/mapeoE14';
import { formatoNumero, mensajeError } from '../lib/utilidades';

const LOTE = 800; // filas por envío (cada lote es una transacción corta)

type Paso = 'inicio' | 'revisando' | 'reporte' | 'guardando' | 'listo';
const ETIQUETA: Record<ResultadoFilaE14['estado'], string> = {
  nueva: 'Nueva', cambia: 'Reemplaza tu valor', sin_cambios: 'Sin cambios', vacia: 'Sin votos', error: 'Error',
};
const INSTRUCCIONES = [
  ['Cómo llenar esta plantilla'],
  [''],
  ['1. En la columna "Votos E14" escribe los votos del candidato en cada mesa, tal como aparecen en la foto del formulario E14.'],
  ['2. Si la mesa no tiene votos para el candidato, escribe 0. Si todavía no la has revisado, déjala vacía: se ignora.'],
  ['3. No cambies las columnas Localidad, Zona, Código de puesto, Puesto ni Mesa: identifican la mesa oficial.'],
  ['4. Puedes agregar filas de otras mesas (por ejemplo, donde aparecieron votos sin simpatizantes registrados).'],
  ['5. Sube el archivo en NexoT → E14 → Subir Excel. Primero verás una revisión fila por fila; nada se guarda hasta que confirmes.'],
  [''],
  ['Doble verificación'],
  ['Tu archivo cuenta como UNA verificación. Una mesa queda verificada cuando otra persona distinta (con su propio archivo o digitando) escribe el mismo número.'],
  ['Si no coinciden, el administrador revisa la foto y decide.'],
];

export default function E14Excel({ eleccion, onCambio }: { eleccion: Eleccion; onCambio: () => void }) {
  const { api } = useSesion();
  const [paso, setPaso] = useState<Paso>('inicio');
  const [archivo, setArchivo] = useState('');
  const [mapa, setMapa] = useState<MapeoE14 | null>(null);
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filas, setFilas] = useState<Record<string, string | number>[]>([]);
  const [reporte, setReporte] = useState<ResultadoFilaE14[]>([]);
  const [progreso, setProgreso] = useState(0);
  const [filtro, setFiltro] = useState<ResultadoFilaE14['estado'] | 'todas'>('error');
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState('');

  async function plantilla(tipo: 'simpatizantes' | 'todas') {
    setDescargando(tipo); setError('');
    try {
      const encab = ['Localidad', 'Zona', 'Código de puesto', 'Puesto', 'Mesa', 'Votos E14', 'Observación'];
      let filasP: (string | number)[][];
      if (tipo === 'simpatizantes') {
        const p = await api.plantillaE14(eleccion.id);
        if (!p.length) { setError('Todavía no hay mesas con simpatizantes ubicados. Descarga la plantilla con todas las mesas.'); return; }
        filasP = p.map((x) => [x.localidad, x.zona, x.codigo_puesto, x.puesto, x.mesa]);
      } else {
        const ps = await api.puestosConCodigos();
        filasP = ps.flatMap((p) => Array.from({ length: p.mesas_total }, (_, i) => [p.localidad, p.zona, p.codigo, p.nombre, i + 1]));
      }
      await descargarExcel(`Plantilla_E14_${tipo === 'simpatizantes' ? 'mesas_con_simpatizantes' : 'todas_las_mesas'}_${fechaArchivo()}.xlsx`, [
        { nombre: 'E14', filas: [encab, ...filasP], anchos: [20, 7, 10, 42, 7, 11, 30] },
        { nombre: 'Instrucciones', filas: INSTRUCCIONES, anchos: [120] },
      ]);
    } catch (e) { setError(mensajeError(e)); } finally { setDescargando(''); }
  }

  async function leer(f: File) {
    setError(''); setMapa(null); setFilas([]); setReporte([]); setPaso('inicio');
    try {
      const { default: leerExcel } = await import('read-excel-file');
      const hoja = await leerExcel(f);
      const inicio = hoja.findIndex((r) => r.filter((c) => c != null && String(c).trim()).length >= 2);
      if (inicio < 0) throw new Error('El archivo está vacío.');
      const enc = hoja[inicio].map((c) => (c == null ? '' : String(c)));
      const m = mapearE14(enc);
      setArchivo(f.name); setEncabezados(enc); setMapa(m);
      const datos = hoja.slice(inicio + 1).map((celdas, i) => ({ fila: inicio + i + 2, ...filaE14(celdas, m.mapeo) }))
        .filter((d) => Object.keys(d).length > 1);
      setFilas(datos);
    } catch (e) { setError(`No se pudo leer el archivo: ${mensajeError(e)}`); }
  }

  async function enviar(confirmar: boolean) {
    setError(''); setPaso(confirmar ? 'guardando' : 'revisando'); setProgreso(0);
    try {
      // Las mesas repetidas se detectan aquí, porque el archivo se envía por partes
      const vistas = new Map<string, number>();
      const repetidas: ResultadoFilaE14[] = [];
      const unicas: Record<string, string | number>[] = [];
      for (const f of filas) {
        const conVotos = String(f.votos ?? '').trim() !== '';
        const k = claveMesa(f as Record<string, string>);
        if (conVotos && vistas.has(k)) {
          repetidas.push({ fila: Number(f.fila), estado: 'error', mensaje: `mesa repetida en el archivo (también en la fila ${vistas.get(k)})`, mesa_id: null, votos: null });
          continue;
        }
        if (conVotos) vistas.set(k, Number(f.fila));
        unicas.push(f);
      }
      const salida: ResultadoFilaE14[] = [...repetidas];
      for (let i = 0; i < unicas.length; i += LOTE) {
        salida.push(...await api.importarE14(eleccion.id, archivo, unicas.slice(i, i + LOTE), confirmar));
        setProgreso(Math.min(i + LOTE, unicas.length));
      }
      salida.sort((a, b) => a.fila - b.fila);
      setReporte(salida);
      const errores = salida.filter((r) => r.estado === 'error').length;
      setFiltro(errores ? 'error' : 'todas');
      setPaso(confirmar ? 'listo' : 'reporte');
      if (confirmar) onCambio();
    } catch (e) { setError(mensajeError(e)); setPaso(confirmar ? 'reporte' : 'inicio'); }
  }

  const cuenta = useMemo(() => {
    const c: Record<string, number> = { nueva: 0, cambia: 0, sin_cambios: 0, vacia: 0, error: 0 };
    for (const r of reporte) c[r.estado]++;
    return c;
  }, [reporte]);
  const porGuardar = cuenta.nueva + cuenta.cambia;
  const datosFila = useMemo(() => new Map(filas.map((f) => [Number(f.fila), f])), [filas]);
  const visibles = reporte.filter((r) => filtro === 'todas' || r.estado === filtro);

  return (
    <>
      <div className="tarjeta" style={{ marginBottom: '1rem' }}>
        <h2>1. Descarga la plantilla</h2>
        <p className="ayuda">Trae las mesas oficiales con sus códigos, para que no haya errores de nombres. Solo llenas la columna “Votos E14”.</p>
        <div className="acciones">
          <button className="boton primario" disabled={!!descargando} onClick={() => plantilla('simpatizantes')}>
            {descargando === 'simpatizantes' ? 'Preparando…' : 'Plantilla: mesas con simpatizantes'}
          </button>
          <button className="boton" disabled={!!descargando} onClick={() => plantilla('todas')}>
            {descargando === 'todas' ? 'Preparando…' : 'Plantilla: todas las mesas de Bogotá'}
          </button>
        </div>
      </div>

      <div className="tarjeta formulario">
        <h2>2. Sube el archivo lleno</h2>
        <div className="aviso info">
          <p><strong>Doble verificación:</strong> tu archivo cuenta como <strong>una</strong> verificación. Cada mesa queda verificada cuando <strong>otra persona</strong> sube su propio archivo o la digita, y escribe el mismo número. Subirlo tú dos veces no la verifica.</p>
        </div>
        <label className="campo"><span>Archivo de Excel (.xlsx)</span>
          <input type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) leer(f); }} />
          <small>Sirve la plantilla de NexoT o cualquier Excel con columnas Localidad, Puesto, Mesa y Votos (o Zona y Código de puesto en vez de Localidad y Puesto).</small>
        </label>
        {error && <div className="aviso error" role="alert">{error}</div>}

        {mapa && (
          <div className={`aviso ${mapa.faltan.length ? 'error' : 'ok'}`}>
            <p><strong>{archivo}</strong>: {formatoNumero(filas.length)} filas.</p>
            <p>Columnas reconocidas: {Object.entries(mapa.mapeo).map(([i, c]) => `${encabezados[Number(i)]} → ${c}`).join(', ')}</p>
            {mapa.faltan.length > 0 && <p>Faltan: <strong>{mapa.faltan.join('; ')}</strong>.</p>}
            {mapa.sinReconocer.length > 0 && <p>Se ignoran: {mapa.sinReconocer.join(', ')}.</p>}
          </div>
        )}
        {mapa && !mapa.faltan.length && paso === 'inicio' && (
          <div><button className="boton primario" onClick={() => enviar(false)}>Revisar {formatoNumero(filas.length)} filas</button>
            <p className="ayuda">Revisar no guarda nada.</p></div>
        )}
        {(paso === 'revisando' || paso === 'guardando') && (
          <div>
            <p>{paso === 'revisando' ? 'Revisando' : 'Guardando'}… {formatoNumero(progreso)} de {formatoNumero(filas.length)}</p>
            <div className="progreso"><div style={{ width: `${(100 * progreso) / Math.max(1, filas.length)}%` }} /></div>
          </div>
        )}
      </div>

      {(paso === 'reporte' || paso === 'listo') && (
        <div className="tarjeta" style={{ marginTop: '1rem' }}>
          {paso === 'listo'
            ? <div className="aviso ok" style={{ marginBottom: '1rem' }}><p><strong>Guardado.</strong> {formatoNumero(porGuardar)} mesas registradas como tu verificación{eleccion.modo_digitacion === 'doble' ? '; quedan verificadas cuando otra persona coincida' : ''}.</p></div>
            : <h2>3. Revisa y confirma</h2>}
          <div className="rejilla cifras" style={{ marginBottom: '1rem' }}>
            <div className="tarjeta cifra"><span className="valor">{formatoNumero(cuenta.nueva)}</span><span className="etiqueta">mesas nuevas</span></div>
            <div className="tarjeta cifra"><span className="valor">{formatoNumero(cuenta.cambia)}</span><span className="etiqueta">reemplazan tu valor anterior</span></div>
            <div className="tarjeta cifra"><span className="valor">{formatoNumero(cuenta.sin_cambios + cuenta.vacia)}</span><span className="etiqueta">sin cambios o sin votos</span></div>
            <div className={`tarjeta cifra ${cuenta.error ? 'alerta' : ''}`}><span className="valor">{formatoNumero(cuenta.error)}</span><span className="etiqueta">con error (no se guardan)</span></div>
          </div>
          <div className="pestanas" role="tablist">
            {(['error', 'cambia', 'nueva', 'todas'] as const).map((k) => (
              <button key={k} role="tab" aria-selected={filtro === k} onClick={() => setFiltro(k)}>
                {k === 'todas' ? 'Todas' : ETIQUETA[k]} ({formatoNumero(k === 'todas' ? reporte.length : cuenta[k])})
              </button>
            ))}
          </div>
          {visibles.length === 0 ? <p className="ayuda">Nada en esta pestaña.</p> : (
            <div className="envoltura-tabla">
              <table className="tabla compacta">
                <thead><tr><th className="num">Fila</th><th>Mesa</th><th className="num">Votos</th><th>Resultado</th></tr></thead>
                <tbody>
                  {visibles.slice(0, 300).map((r) => {
                    const d = datosFila.get(r.fila);
                    return (
                      <tr key={r.fila}>
                        <td className="num">{r.fila}</td>
                        <td>{d?.puesto ?? `Zona ${d?.zona} · Puesto ${d?.codigo_puesto}`} · mesa {d?.mesa}<small>{d?.localidad}</small></td>
                        <td className="num">{r.votos ?? (d?.votos || '—')}</td>
                        <td><span className={`insignia ${r.estado === 'error' ? 'error' : r.estado === 'nueva' ? 'completa' : r.estado === 'cambia' ? 'por_revisar' : 'sin_dato'}`}>{ETIQUETA[r.estado]}</span>{r.mensaje && <small>{r.mensaje}</small>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {visibles.length > 300 && <p className="ayuda">Se muestran 300 de {formatoNumero(visibles.length)}.</p>}
          {paso === 'reporte' && (
            <div className="acciones" style={{ marginTop: '1rem' }}>
              <button className="boton primario" disabled={porGuardar === 0} onClick={() => enviar(true)}>Guardar {formatoNumero(porGuardar)} mesas</button>
              <button className="boton" onClick={() => { setPaso('inicio'); setReporte([]); }}>Cancelar</button>
              {cuenta.error > 0 && <span className="ayuda">Las filas con error no se guardan: corrígelas en el Excel y vuelve a subirlo.</span>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
