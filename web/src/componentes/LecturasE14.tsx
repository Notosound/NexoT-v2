// E14 → Lecturas automáticas: subir lo que produjo el lector (herramientas/
// lector-e14) y revisar, viendo el recorte, las lecturas dudosas.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, ImageOff, ScanLine, SkipForward, Upload } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { useEnVivo } from '../lib/enVivo';
import type { Eleccion, LecturaE14, ResultadoLectura } from '../lib/tipos';
import { formatoNumero, mensajeError } from '../lib/utilidades';
import { Cifra, QueEs } from './Piezas';

/** CSV simple con comillas (lo que escribe el lector) */
function leerCsv(texto: string): Record<string, string>[] {
  const filas: string[][] = [];
  let fila: string[] = [], celda = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; } else if (c === '"') comillas = false; else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ',' || c === ';') { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; fila.push(celda); filas.push(fila); fila = []; celda = ''; }
    else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  const [enc, ...resto] = filas.filter((f) => f.some((x) => x.trim()));
  if (!enc) return [];
  const claves = enc.map((h) => h.replace(/^﻿/, '').trim().toLowerCase());
  return resto.map((f, i) => Object.fromEntries([['fila', String(i + 2)], ...claves.map((k, j) => [k, (f[j] ?? '').trim()])]));
}

export default function LecturasE14({ eleccion, onCambio }: { eleccion: Eleccion; onCambio: () => void }) {
  const { api, sesion } = useSesion();
  const esAdmin = sesion!.perfil!.rol === 'admin';
  const [lecturas, setLecturas] = useState<LecturaE14[] | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => api.lecturasE14(eleccion.id).then(setLecturas).catch((e) => setError(mensajeError(e))), [api, eleccion.id]);
  const vivo = useEnVivo(cargar, ['e14']);
  useEffect(() => { cargar(); }, [cargar]);

  const n = (e: LecturaE14['estado']) => (lecturas ?? []).filter((l) => l.estado === e).length;
  const cola = useMemo(() => (lecturas ?? []).filter((l) => l.estado === 'por_revisar')
    .sort((a, b) => b.simpatizantes - a.simpatizantes || a.localidad.localeCompare(b.localidad) || a.mesa - b.mesa), [lecturas]);

  return (
    <>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}
      <div className="cifras" style={{ marginBottom: '1rem' }}>
        <Cifra icono={ScanLine} valor={lecturas ? formatoNumero(lecturas.length) : null} etiqueta="mesas leídas por el lector" />
        <Cifra icono={CheckCircle2} valor={lecturas ? formatoNumero(n('automatica')) : null} etiqueta="lecturas claras" tono="ok"
          detalle="Cuentan como 1.ª digitación: falta la de una persona" />
        <Cifra icono={ImageOff} valor={lecturas ? formatoNumero(n('por_revisar')) : null} etiqueta="por revisar con la imagen" tono={n('por_revisar') ? 'aviso' : undefined} />
        <Cifra icono={CheckCircle2} valor={lecturas ? formatoNumero(n('revisada')) : null} etiqueta="ya revisadas" />
      </div>

      {lecturas && lecturas.length === 0 && (
        <div className="tarjeta" style={{ marginBottom: '1rem' }}>
          <h2>Cómo funciona</h2>
          <ol className="pasos-lector">
            <li>El <strong>lector</strong> (programa que corre en un computador, carpeta <code>herramientas/lector-e14</code>) baja los E14, recorta la casilla del candidato y lee el número.</li>
            <li>Aquí se suben su archivo <code>lecturas.csv</code> y las imágenes de los recortes.</li>
            <li>Lo que leyó con claridad cuenta como <strong>primera digitación</strong>; una persona digita la segunda sin ver ese número.</li>
            <li>Lo dudoso queda en una <strong>cola</strong>: el digitador ve el recorte y escribe el número.</li>
          </ol>
          <p className="ayuda">Nada queda verificado solo con la máquina.</p>
        </div>
      )}

      {esAdmin && <Subir eleccion={eleccion} alTerminar={() => { cargar(); onCambio(); }} />}

      <Cola cola={cola} total={lecturas?.length ?? 0} vivo={vivo.recargar} alRevisar={(l, votos) => {
        setLecturas((ls) => (ls ?? []).map((x) => (x.id === l.id ? { ...x, estado: 'revisada', votos_revisados: votos } : x)));
        onCambio();
      }} />
    </>
  );
}

function Subir({ eleccion, alTerminar }: { eleccion: Eleccion; alTerminar: () => void }) {
  const { api } = useSesion();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [imagenes, setImagenes] = useState<File[]>([]);
  const [progreso, setProgreso] = useState('');
  const [reporte, setReporte] = useState<ResultadoLectura[] | null>(null);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);

  const subir = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setReporte(null);
    if (!archivo) return setError('Elige el archivo lecturas.csv (o .json) que generó el lector.');
    try {
      const texto = await archivo.text();
      const filas = archivo.name.toLowerCase().endsWith('.json')
        ? ((JSON.parse(texto).items ?? JSON.parse(texto)) as Record<string, unknown>[]).map((f, i) => ({ fila: String(i + 1), ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v == null ? '' : String(v)])) }))
        : leerCsv(texto);
      if (!filas.length) return setError('El archivo no tiene lecturas.');
      const faltan = filas.filter((f) => f.recorte && !imagenes.some((i) => i.name === f.recorte)).length;
      setProgreso(imagenes.length ? 'Subiendo recortes…' : 'Cargando lecturas…');
      const r = await api.cargarLecturasE14(eleccion.id, filas, imagenes, (h, t) => setProgreso(`Subiendo recortes: ${h} de ${t}`));
      setReporte(r);
      setProgreso(faltan ? `Ojo: ${faltan} lecturas no tenían su imagen entre las elegidas (quedaron sin recorte).` : '');
      alTerminar();
    } catch (err) { setError(mensajeError(err)); setProgreso(''); }
  };
  const cuenta = (e: ResultadoLectura['estado']) => (reporte ?? []).filter((r) => r.estado === e).length;

  return (
    <div className="tarjeta" style={{ marginBottom: '1rem' }}>
      <div className="tarjeta-titulo">
        <h2><Upload className="icono" aria-hidden /> Subir lecturas del lector <QueEs>El lector deja una carpeta con lecturas.csv y una subcarpeta recortes. Sube ambos: el archivo y todas las imágenes de recortes.</QueEs></h2>
        <button className="boton chico" onClick={() => setAbierto(!abierto)}>{abierto ? 'Cerrar' : 'Subir'}</button>
      </div>
      {abierto && (
        <form className="formulario" onSubmit={subir}>
          <label className="campo"><span>1. Archivo de lecturas (lecturas.csv)</span>
            <input type="file" accept=".csv,.json" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </label>
          <label className="campo"><span>2. Imágenes de los recortes (selecciónalas todas)</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => setImagenes([...(e.target.files ?? [])])} />
            {imagenes.length > 0 && <small>{formatoNumero(imagenes.length)} imágenes elegidas</small>}
          </label>
          {error && <div className="aviso error" role="alert">{error}</div>}
          {progreso && <p className="ayuda">{progreso}</p>}
          {reporte && (
            <div className="aviso ok" role="status">
              Listo: {cuenta('automatica')} claras (1.ª digitación), {cuenta('por_revisar')} a la cola de revisión
              {cuenta('omitida') ? `, ${cuenta('omitida')} ya revisadas antes (no se tocaron)` : ''}
              {cuenta('error') ? `, ${cuenta('error')} con error` : ''}.
              {cuenta('error') > 0 && <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>{reporte.filter((r) => r.estado === 'error').slice(0, 15).map((r) => <li key={r.fila}>Fila {r.fila}: {r.mensaje}</li>)}</ul>}
            </div>
          )}
          <button className="boton primario">Cargar</button>
        </form>
      )}
    </div>
  );
}

function Cola({ cola, total, alRevisar, vivo }: { cola: LecturaE14[]; total: number; alRevisar: (l: LecturaE14, votos: number) => void; vivo: () => void }) {
  const { api } = useSesion();
  const [indice, setIndice] = useState(0);
  const [votos, setVotos] = useState('');
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const l = cola[Math.min(indice, Math.max(0, cola.length - 1))];

  useEffect(() => {
    setVotos(''); setError(''); setUrl(undefined);
    if (l?.recorte) api.urlRecorte(l.recorte).then(setUrl).catch(() => setUrl(null)); else setUrl(null);
    setTimeout(() => ref.current?.focus(), 30);
  }, [api, l?.id, l?.recorte]);

  if (!total) return null;
  if (!l) return <div className="tarjeta vacio">No hay lecturas por revisar. <button className="enlace" onClick={vivo}>Actualizar</button></div>;

  const guardar = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (!/^\d{1,4}$/.test(votos) || Number(votos) > 1000) return setError('Escribe los votos que ves en la imagen: un número de 0 a 1000.');
    setGuardando(true);
    try {
      const estado = await api.revisarLecturaE14(l.id, Number(votos));
      setAviso(`Mesa ${l.mesa} de ${l.puesto}: ${votos} votos guardados${estado === 'verificado' ? ' · mesa verificada ✓' : ''}.`);
      alRevisar(l, Number(votos));
    } catch (err) { setError(mensajeError(err)); } finally { setGuardando(false); }
  };

  return (
    <div className="tarjeta revision-lectura">
      <div className="tarjeta-titulo">
        <h2>Revisar con la imagen</h2>
        <small>quedan {formatoNumero(cola.length)} · primero las mesas con más simpatizantes</small>
      </div>
      {aviso && <div className="aviso ok" role="status" style={{ marginBottom: '0.75rem' }}>{aviso}</div>}
      <p className="lectura-donde"><strong>{l.localidad} · {l.puesto} · mesa {l.mesa}</strong>
        <span className="ayuda"> · {l.simpatizantes} {l.simpatizantes === 1 ? 'simpatizante' : 'simpatizantes'} registrados</span></p>
      <div className="lectura-imagen">
        {url === undefined ? <p className="ayuda">Cargando imagen…</p>
          : url ? <img src={url} alt={`Casilla de votos del candidato, mesa ${l.mesa} de ${l.puesto}`} />
          : <p className="ayuda">Esta lectura no tiene imagen. Abre el E14 de la mesa para ver el número.</p>}
      </div>
      <p className="ayuda" style={{ margin: '0.4rem 0' }}>
        {l.motivo ? <>Por qué está aquí: {l.motivo}. </> : null}
        {l.votos_leidos != null && <>El lector leyó <strong>{l.votos_leidos}</strong>{l.alternativa != null ? <> (o <strong>{l.alternativa}</strong>)</> : null}: confírmalo mirando la imagen.</>}
        {l.documento_url && /^https?:/.test(l.documento_url) && <> <a href={l.documento_url} target="_blank" rel="noreferrer">Ver el E14 completo</a></>}
      </p>
      <form onSubmit={guardar} className="lectura-form">
        {l.votos_leidos != null && <button type="button" className="boton" onClick={() => setVotos(String(l.votos_leidos))}>{l.votos_leidos}</button>}
        {l.alternativa != null && <button type="button" className="boton" onClick={() => setVotos(String(l.alternativa))}>{l.alternativa}</button>}
        <input ref={ref} type="number" inputMode="numeric" min={0} max={1000} value={votos} onChange={(e) => setVotos(e.target.value)}
          aria-label="Votos que se ven en la imagen" placeholder="Votos" />
        <button className="boton primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar y seguir'}</button>
        <button type="button" className="boton" onClick={() => setIndice((i) => (i + 1) % cola.length)} title="Pasar a la siguiente sin guardar">
          <SkipForward className="icono" aria-hidden />Saltar
        </button>
      </form>
      {error && <div className="aviso error" role="alert" style={{ marginTop: '0.5rem' }}>{error}</div>}
    </div>
  );
}
