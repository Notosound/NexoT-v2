import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Upload } from 'lucide-react';
import { CAMPOS, filaACanonica, filaVacia, mapearEncabezados } from '@compartido/importacion/mapeo.mjs';
import { useSesion } from '../lib/sesion';
import { PLANTILLA_REGISTROS, type FilaImportacion, type Importacion, type Lider } from '../lib/tipos';
import { Ventana } from '../componentes/Piezas';
import { formatoNumero, hoyISO, mensajeError } from '../lib/utilidades';
import { ENCABEZADOS_LIDER, descargarPlantillaRegistros } from '../lib/plantillaRegistros';

const normal = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const INSTRUCCIONES_LIDER = [
  ['Cómo llenar tu plantilla'],
  [''],
  ['1. Escribe una persona por fila en la hoja "Registros", desde la fila 2. Borra la fila de ejemplo.'],
  ['2. Obligatorios: Cédula (solo números), Nombres, Sexo, Edad o Fecha de nacimiento, Teléfono (celular de 10 dígitos que empiece por 3), Localidad y Puesto.'],
  ['3. Localidad y Puesto se eligen de listas: primero la Localidad y luego, en Puesto, salen solo los puestos oficiales de esa localidad (igual que en el registro).'],
  ['   Si el puesto de la persona no aparece, escríbelo como le aparece en la Registraduría, acepta el aviso de Excel y pon la Dirección del puesto: queda para revisión.'],
  ['4. Sexo: Femenino, Masculino, Otro o No informa. Edad: fecha de nacimiento (dd/mm/aaaa) o solo la edad. Deben ser mayores de 18.'],
  [''],
  ['No cambies los títulos de las columnas, no agregues columnas y no borres la hoja "Control": así el sistema reconoce la plantilla oficial.'],
  ['Todas las personas quedan registradas a tu nombre. Solo sube personas que te autorizaron a usar sus datos.'],
  ['Al subir el archivo verás un reporte fila por fila. Nada se guarda hasta que confirmes.'],
];

const INSTRUCCIONES_REGISTROS = [
  ['Cómo llenar la plantilla de registros'],
  [''],
  ['Obligatorios: Cédula (solo números) y Nombres. Lo demás es opcional, pero mientras más completo, mejor el análisis.'],
  ['Sexo: Femenino, Masculino, Otro o No informa (también sirven F / M / Mujer / Hombre).'],
  ['Edad: escribe la fecha de nacimiento (dd/mm/aaaa) o solo la edad en años. Deben ser mayores de 18.'],
  ['Teléfono: 7 a 10 dígitos; el +57 se quita solo.'],
  ['Lugar de votación: elige la Localidad de la lista; la columna Puesto muestra solo los puestos oficiales de esa localidad. La Mesa es un número.'],
  ['  Si el puesto aparece con otro nombre, escríbelo igual y pon la Dirección del puesto: el sistema intentará ubicarlo y, si no puede, queda para revisión.'],
  ['Cédula del líder: si cada fila es de un líder distinto. Si toda la lista es de un solo líder, déjala vacía y elígelo al importar.'],
  [''],
  ['Al subir el archivo verás un reporte fila por fila. Nada se guarda hasta que confirmes.'],
  ['Las cédulas repetidas (en el archivo o ya registradas) no entran dos veces.'],
  ['No borres la hoja "Control": así el sistema reconoce la plantilla oficial.'],
];


type Paso = 'archivo' | 'validando' | 'reporte' | 'confirmando' | 'listo';
type Pestana = 'con_errores' | 'duplicada' | 'advertencias' | 'valida';

interface Leido {
  nombre: string;
  encabezados: string[];
  mapeo: Record<number, string>;
  faltan: string[];
  sinReconocer: string[];
  repetidos: string[];
  filas: { fila: number; datos: Record<string, string> }[];
  plantilla: string | null;
}

const NOMBRE_CAMPO: Record<string, string> = {
  cedula: 'Cédula', nombres: 'Nombres', apellidos: 'Apellidos', sexo: 'Sexo', fecha_nacimiento: 'Fecha de nacimiento',
  edad: 'Edad', telefono: 'Teléfono', barrio: 'Barrio', departamento: 'Departamento', localidad: 'Localidad',
  puesto: 'Puesto', direccion_puesto: 'Dirección del puesto', mesa: 'Mesa', lider_cedula: 'Cédula del líder',
  fecha_registro: 'Fecha de registro',
};

export default function Importar() {
  const { api, sesion } = useSesion();
  const esLider = sesion!.perfil!.rol === 'lider';
  const [avisoEn, setAvisoEn] = useState<string | null>(null);
  const [avisoAbierto, setAvisoAbierto] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState<Paso>('archivo');
  const [leido, setLeido] = useState<Leido | null>(null);
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [liderId, setLiderId] = useState('');
  const [fechaDatos, setFechaDatos] = useState(hoyISO());
  const [consentimiento, setConsentimiento] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [imp, setImp] = useState<{ id: string; r: Importacion } | null>(null);
  const [filas, setFilas] = useState<FilaImportacion[]>([]);
  const [pestana, setPestana] = useState<Pestana>('con_errores');
  const [error, setError] = useState('');

  useEffect(() => { api.lideres().then(setLideres).catch(() => {}); }, [api]);

  const [preparando, setPreparando] = useState(false);
  async function plantillaRegistros() {
    setPreparando(true); setError('');
    try {
      const puestos = await api.puestosConCodigos();
      await descargarPlantillaRegistros({
        archivo: esLider ? 'Plantilla_mi_lista_NexoT.xlsx' : 'Plantilla_registros_NexoT.xlsx',
        esLider, puestos, instrucciones: esLider ? INSTRUCCIONES_LIDER : INSTRUCCIONES_REGISTROS,
      });
    } catch (e) { setError(mensajeError(e)); } finally { setPreparando(false); }
  }

  async function leer(archivo: File) {
    setError(''); setLeido(null);
    try {
      const { default: leerExcel, readSheetNames } = await import('read-excel-file');
      // ¿Es la plantilla oficial? (hoja Control con la marca)
      let plantilla: string | null = null;
      const hojas = await readSheetNames(archivo);
      if (hojas.includes('Control')) {
        const control = await leerExcel(archivo, { sheet: 'Control' });
        if (String(control[0]?.[0] ?? '').trim() === PLANTILLA_REGISTROS) plantilla = PLANTILLA_REGISTROS;
      }
      if (esLider && !plantilla) {
        throw new Error('NO_PLANTILLA');
      }
      const hoja = await leerExcel(archivo, hojas.includes('Registros') ? { sheet: 'Registros' } : undefined);
      const inicio = hoja.findIndex((f) => f.filter((c) => c != null && String(c).trim()).length >= 2);
      if (inicio < 0) throw new Error('El archivo está vacío.');
      const encabezados = hoja[inicio].map((c) => (c == null ? '' : String(c)));
      if (esLider) {
        const esperados = ENCABEZADOS_LIDER.map(normal);
        const reales = encabezados.map(normal).filter(Boolean);
        if (inicio !== 0 || reales.length !== esperados.length || reales.some((h, i) => h !== esperados[i])) throw new Error('ENCABEZADOS');
      }
      const m = mapearEncabezados(encabezados);
      const filasDatos = hoja.slice(inicio + 1)
        .map((celdas, i) => ({ fila: inicio + i + 2, datos: filaACanonica(celdas, m.mapeo) as Record<string, string> }))
        .filter((f) => !filaVacia(f.datos));
      if (esLider && filasDatos.length > 3000) throw new Error('Máximo 3.000 personas por archivo: divide la lista en varios archivos');
      setLeido({ nombre: archivo.name, encabezados, ...m, filas: filasDatos, plantilla });
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (m === 'NO_PLANTILLA') setError('Este archivo no es la plantilla oficial. Descarga la plantilla, copia tus datos en la hoja “Registros” y súbela de nuevo.');
      else if (m === 'ENCABEZADOS') setError('Los títulos de las columnas de la plantilla fueron cambiados. Descarga la plantilla de nuevo y copia tus datos sin cambiar la primera fila.');
      else setError(`No se pudo leer el archivo: ${mensajeError(e)}. Debe ser un Excel (.xlsx).`);
    }
  }

  const tieneLiderPorFila = !!leido && Object.values(leido.mapeo).includes('lider_cedula');

  async function validar() {
    if (!leido) return;
    setError(''); setPaso('validando'); setProgreso(0);
    try {
      const id = await api.crearImportacion({
        archivo: leido.nombre, liderId: esLider ? lideres[0]?.id ?? null : liderId || null, fechaDatos,
        consentimiento: esLider || consentimiento, plantilla: leido.plantilla, avisoAceptadoEn: avisoEn,
      });
      await api.cargarFilas(id, leido.filas, setProgreso);
      const r = await api.validarImportacion(id);
      const f = await api.filasImportacion(id);
      setImp({ id, r }); setFilas(f);
      setPestana(r.filas_con_errores ? 'con_errores' : r.filas_duplicadas ? 'duplicada' : 'advertencias');
      setPaso('reporte');
    } catch (e) {
      setError(mensajeError(e)); setPaso('archivo');
    }
  }

  async function confirmar() {
    if (!imp) return;
    setError(''); setPaso('confirmando');
    try {
      const r = await api.confirmarImportacion(imp.id);
      setImp({ ...imp, r }); setPaso('listo');
    } catch (e) {
      setError(mensajeError(e)); setPaso('reporte');
    }
  }

  async function cancelar() {
    if (imp) await api.cancelarImportacion(imp.id).catch(() => {});
    setImp(null); setFilas([]); setLeido(null); setPaso('archivo');
  }

  const conAdvertencias = useMemo(() => filas.filter((f) => f.estado === 'valida' && f.advertencias.length), [filas]);
  const visibles = useMemo(() => {
    if (pestana === 'advertencias') return conAdvertencias;
    return filas.filter((f) => f.estado === pestana);
  }, [filas, pestana, conAdvertencias]);

  return (
    <>
      <div className="encabezado"><div>
        <h1>{esLider ? 'Importar mi lista' : 'Importar Excel'}</h1>
        <p>{esLider ? 'Sube a tu gente desde un Excel con la plantilla oficial: descargar, llenar, subir y confirmar.' : 'Carga listas de personas en tres pasos: leer, revisar y confirmar.'}</p>
      </div></div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      {paso === 'archivo' && (
        <div className="tarjeta" style={{ marginBottom: '1rem' }}>
          <h2>1. Descarga la plantilla oficial</h2>
          <p className="ayuda">{esLider
            ? 'Solo se aceptan listas en la plantilla oficial: así no hay errores de columnas ni de puestos. Trae instrucciones y el listado oficial de puestos para copiar.'
            : 'Trae las columnas que el sistema reconoce, instrucciones y el listado oficial de puestos. También puedes subir tus propios Excel: las columnas se reconocen por su nombre.'}</p>
          <button className="boton" disabled={preparando} onClick={plantillaRegistros}>{preparando ? 'Preparando…' : esLider ? 'Descargar la plantilla' : 'Descargar plantilla de registros'}</button>
        </div>
      )}

      {paso === 'archivo' && (
        <div className="tarjeta formulario">
          <h2 style={{ margin: 0 }}>2. Sube el archivo lleno</h2>
          <div className="campo">
            <span>Archivo de Excel (.xlsx)</span>
            <input ref={archivoRef} type="file" hidden aria-label="Archivo de Excel (.xlsx)" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) leer(f); }} />
            <div className="acciones">
              <button type="button" className="boton" onClick={() => (avisoEn ? archivoRef.current?.click() : setAvisoAbierto(true))}>
                <Upload className="icono" aria-hidden />{leido ? 'Elegir otro archivo' : 'Elegir el archivo'}
              </button>
              {avisoEn && <span className="ayuda"><ShieldCheck className="icono" aria-hidden /> Aviso legal aceptado</span>}
            </div>
            <small>{esLider ? 'Debe ser la plantilla oficial, sin cambiar los títulos de las columnas.' : 'Se lee la hoja “Registros” (o la primera). La primera fila con datos se toma como encabezados.'}</small>
          </div>

          {leido && (
            <>
              <div className={`aviso ${leido.faltan.length ? 'error' : 'ok'}`}>
                <p><strong>{leido.nombre}</strong>: {formatoNumero(leido.filas.length)} filas con datos.</p>
                {esLider ? <p>Plantilla oficial reconocida ✓</p> : <p>Columnas reconocidas: {Object.entries(leido.mapeo).map(([i, c]) => `${leido.encabezados[Number(i)]} → ${NOMBRE_CAMPO[c] ?? c}`).join(', ')}</p>}
                {leido.faltan.length > 0 && <p>Faltan columnas obligatorias: <strong>{leido.faltan.map((c) => NOMBRE_CAMPO[c]).join(', ')}</strong>.</p>}
                {leido.sinReconocer.length > 0 && <p>No reconocidas (se ignoran): {leido.sinReconocer.join(', ')}.</p>}
                {leido.repetidos.length > 0 && <p>Repetidas: {leido.repetidos.join('; ')}.</p>}
              </div>
              {!leido.faltan.length && (
                <>
                  {!esLider && <details>
                    <summary className="ayuda">¿Qué nombres de columna se reconocen?</summary>
                    <ul className="ayuda">
                      {Object.entries(CAMPOS).map(([c, d]) => <li key={c}><strong>{NOMBRE_CAMPO[c] ?? c}</strong>: {(d as { alias: string[] }).alias.join(', ')}</li>)}
                    </ul>
                  </details>}
                  {esLider ? <p className="ayuda" style={{ margin: 0 }}>Todas estas personas quedarán registradas a tu nombre.</p> : (
                  <label className="campo"><span>Líder al que se asignan {tieneLiderPorFila && <span className="opcional">(si la fila no trae cédula del líder)</span>}</span>
                    <select value={liderId} onChange={(e) => setLiderId(e.target.value)}>
                      <option value="">{tieneLiderPorFila ? 'Ninguno' : 'Elige…'}</option>
                      {lideres.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                    </select>
                  </label>
                  )}
                  <label className="campo"><span>Fecha en que se recogieron los datos</span>
                    <input type="date" value={fechaDatos} max={hoyISO()} onChange={(e) => setFechaDatos(e.target.value)} style={{ maxWidth: 220 }} />
                    <small>Sirve para calcular bien la edad cuando la lista solo trae “edad”.</small>
                  </label>
                  {!esLider && (
                    <>
                      <label className="casilla">
                        <input type="checkbox" checked={consentimiento} onChange={(e) => setConsentimiento(e.target.checked)} />
                        <span>Las personas de esta lista aceptaron el aviso de tratamiento de datos.</span>
                      </label>
                      {!consentimiento && <div className="aviso atencion">Si no marcas esta casilla, las personas quedan registradas <strong>sin consentimiento</strong> y habrá que pedírselo después.</div>}
                    </>
                  )}
                  <button className="boton primario" disabled={!esLider && !tieneLiderPorFila && !liderId} onClick={validar}>
                    Revisar {formatoNumero(leido.filas.length)} filas
                  </button>
                  <p className="ayuda">Revisar no guarda personas: solo verifica y te muestra el resultado.</p>
                </>
              )}
            </>
          )}
        </div>
      )}

      {paso === 'validando' && leido && (
        <div className="tarjeta">
          <p>{progreso < leido.filas.length ? `Subiendo filas… ${formatoNumero(progreso)} de ${formatoNumero(leido.filas.length)}` : 'Revisando cada fila…'}</p>
          <div className="progreso"><div style={{ width: `${(100 * progreso) / Math.max(1, leido.filas.length)}%` }} /></div>
        </div>
      )}

      {(paso === 'reporte' || paso === 'confirmando') && imp && (
        <>
          <div className="rejilla" style={{ marginBottom: '1rem' }}>
            <div className="tarjeta cifra"><span className="valor">{formatoNumero(imp.r.filas_validas)}</span><span className="etiqueta">entrarán</span></div>
            <div className="tarjeta cifra alerta"><span className="valor">{formatoNumero(imp.r.filas_con_errores)}</span><span className="etiqueta">con errores (no entran)</span></div>
            <div className="tarjeta cifra"><span className="valor">{formatoNumero(imp.r.filas_duplicadas)}</span><span className="etiqueta">duplicadas (no entran)</span></div>
            <div className="tarjeta cifra"><span className="valor">{formatoNumero(conAdvertencias.length)}</span><span className="etiqueta">entran con advertencias</span></div>
          </div>
          <div className="tarjeta">
            <div className="pestanas" role="tablist">
              {([['con_errores', 'Con errores', imp.r.filas_con_errores], ['duplicada', 'Duplicadas', imp.r.filas_duplicadas],
                ['advertencias', 'Con advertencias', conAdvertencias.length], ['valida', 'Válidas', imp.r.filas_validas]] as const).map(([k, t, n]) => (
                <button key={k} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}>{t} ({formatoNumero(n)})</button>
              ))}
            </div>
            {visibles.length === 0 ? <div className="vacio">Nada en esta pestaña.</div> : (
              <div className="envoltura-tabla">
                <table className="tabla apilable">
                  <thead><tr><th className="num">Fila</th><th>Nombre</th><th>Cédula</th><th>Detalle</th></tr></thead>
                  <tbody>
                    {visibles.slice(0, 300).map((f) => (
                      <tr key={f.fila}>
                        <td className="num" data-etiqueta="Fila">{f.fila}</td>
                        <td className="principal">{[f.datos.nombres, f.datos.apellidos].filter(Boolean).join(' ') || '—'}</td>
                        <td data-etiqueta="Cédula">{f.datos.cedula ?? '—'}</td>
                        <td data-etiqueta="Detalle">
                          {f.errores.length + f.advertencias.length === 0 ? <span className="ayuda">Sin observaciones</span> : (
                            <ul className="lista-problemas">
                              {f.errores.map((e) => <li key={e} className="err">{e}</li>)}
                              {f.advertencias.map((e) => <li key={e} className="adv">{e}</li>)}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {visibles.length > 300 && <p className="ayuda" style={{ marginTop: '0.5rem' }}>Se muestran las primeras 300 de {formatoNumero(visibles.length)}.</p>}
          </div>
          <div className="aviso info" style={{ margin: '1rem 0' }}>
            <p>Para corregir filas con errores, arréglalas en el Excel y vuelve a importar solo esas: las que ya entraron saldrán como duplicadas.</p>
          </div>
          <div className="acciones">
            <button className="boton primario" disabled={paso === 'confirmando' || imp.r.filas_validas === 0} onClick={confirmar}>
              {paso === 'confirmando' ? 'Importando…' : `Importar ${formatoNumero(imp.r.filas_validas)} personas`}
            </button>
            <button className="boton" disabled={paso === 'confirmando'} onClick={cancelar}>Cancelar</button>
          </div>
        </>
      )}

      {paso === 'listo' && imp && (
        <div className="tarjeta">
          <div className="aviso ok" style={{ marginBottom: '1rem' }}><p><strong>{formatoNumero(imp.r.filas_importadas)} personas importadas.</strong> Cada una queda con el archivo y la fila de donde vino.</p></div>
          <div className="acciones">
            {!esLider && <Link to="/revision" className="boton primario">Revisar puestos</Link>}
            <Link to="/personas" className={esLider ? 'boton primario' : 'boton'}>{esLider ? 'Ver mis registros' : 'Ver personas'}</Link>
            <button className="boton" onClick={() => { setImp(null); setFilas([]); setLeido(null); setPaso('archivo'); }}>Importar otro archivo</button>
          </div>
        </div>
      )}
      {avisoAbierto && (
        <AvisoImportar alCerrar={() => setAvisoAbierto(false)} alAceptar={() => {
          archivoRef.current?.click(); // en el mismo toque: el navegador solo abre el selector así
          setAvisoEn(new Date().toISOString()); setAvisoAbierto(false);
        }} />
      )}
    </>
  );
}

/** Aviso legal que se acepta antes de subir una lista (Ley 1581 de 2012) */
function AvisoImportar({ alCerrar, alAceptar }: { alCerrar: () => void; alAceptar: () => void }) {
  const { sesion } = useSesion();
  const [acepto, setAcepto] = useState(false);
  return (
    <Ventana titulo="Antes de subir tu lista: aviso legal" icono={ShieldCheck} alCerrar={alCerrar}>
      <div className="aviso-legal-importar">
        <p>Vas a cargar datos personales de terceros en la base de <strong>{sesion!.organizacion ?? 'la campaña'}</strong>.
          Por la Ley 1581 de 2012 (protección de datos personales) y sus decretos reglamentarios, al continuar <strong>declaras que</strong>:</p>
        <ol>
          <li>Cada persona de la lista te dio su <strong>autorización previa, expresa e informada</strong> para que la campaña trate sus datos,
            incluido un <strong>dato sensible</strong>: su preferencia política. Sabe que es voluntario y que puede consultar, corregir o pedir que se borren sus datos.</li>
          <li>Los datos los obtuviste <strong>directamente de cada persona</strong>. No vienen de bases compradas, de entidades públicas, de empresas ni de otras campañas.</li>
          <li>La información es <strong>real y actual</strong>, y todas las personas son mayores de edad.</li>
          <li>Si la persona o la Superintendencia de Industria y Comercio lo piden, la campaña podrá <strong>demostrar esa autorización</strong>.</li>
        </ol>
        <p className="ayuda">Usar datos sin autorización puede acarrear sanciones de la SIC (multas de hasta 2.000 salarios mínimos) y responsabilidad personal.
          Esta carga queda registrada con tu nombre, la fecha y la hora.</p>
        <label className="casilla">
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
          <span>Leí el aviso y declaro que lo anterior es cierto para todas las personas de la lista.</span>
        </label>
      </div>
      <div className="acciones">
        <button className="boton primario" disabled={!acepto} onClick={alAceptar}>Aceptar y elegir el archivo</button>
        <button className="boton" onClick={alCerrar}>Cancelar</button>
      </div>
    </Ventana>
  );
}
