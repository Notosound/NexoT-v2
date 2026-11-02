import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion';
import { SEXOS, type Demografia, type Lider, type Resumen, type Sexo } from '../lib/tipos';
import { formatoNumero, mensajeError } from '../lib/utilidades';

function Barras({ titulo, datos, cargado }: { titulo: string; datos: [string, number][]; cargado: boolean }) {
  const max = Math.max(1, ...datos.map(([, n]) => n));
  return (
    <div className="tarjeta">
      <h2>{titulo}</h2>
      {!cargado ? <p className="ayuda">Cargando…</p> : datos.length === 0 ? <p className="ayuda">Sin datos todavía.</p> : (
        <div className="barras">
          {datos.map(([etiqueta, n]) => (
            <div className="barra-fila" key={etiqueta}>
              <span>{etiqueta}</span>
              <div className="pista"><div className="relleno" style={{ width: `${(100 * n) / max}%` }} /></div>
              <span className="num">{formatoNumero(n)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function agrupar(filas: Demografia[], clave: (d: Demografia) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const f of filas) m.set(clave(f), (m.get(clave(f)) ?? 0) + f.personas);
  return [...m.entries()];
}

const ORDEN_EDAD = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'sin dato'];

export default function Inicio() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [demo, setDemo] = useState<Demografia[]>([]);
  const [misLideres, setMisLideres] = useState<Lider[]>([]);
  const [error, setError] = useState('');
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    const tareas: Promise<unknown>[] = [];
    if (['admin', 'coordinador', 'lider'].includes(rol)) tareas.push(api.resumen().then(setResumen));
    if (['admin', 'coordinador', 'candidato'].includes(rol)) tareas.push(api.demografia().then(setDemo));
    if (rol === 'lider') tareas.push(api.lideres().then(setMisLideres));
    Promise.all(tareas).then(() => setCargado(true)).catch((e) => setError(mensajeError(e)));
  }, [api, rol]);

  const total = demo.reduce((s, d) => s + d.personas, 0);
  const porSexo = agrupar(demo, (d) => SEXOS[d.sexo as Sexo] ?? 'Sin dato').sort((a, b) => b[1] - a[1]);
  const porEdad = agrupar(demo, (d) => d.rango_edad).sort((a, b) => ORDEN_EDAD.indexOf(a[0]) - ORDEN_EDAD.indexOf(b[0]));
  const porLocalidad = agrupar(demo, (d) => d.localidad).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Hola, {sesion!.perfil!.nombre.split(' ')[0]}</h1>
          <p>{sesion!.organizacion}</p>
        </div>
        {['admin', 'coordinador', 'lider'].includes(rol) && <Link to="/registrar" className="boton primario">Registrar persona</Link>}
      </div>
      {error && <div className="aviso error">{error}</div>}

      {rol === 'digitador' && (
        <div className="tarjeta"><h2>Digitación E14</h2><p>Transcribe los votos de cada mesa a partir de las fotos de los formularios E14.</p><Link to="/e14" className="boton primario">Ir a digitar</Link></div>
      )}

      {rol === 'lider' && resumen && (
        <div className="rejilla">
          <Link to="/personas" className="tarjeta cifra">
            <span className="valor">{formatoNumero(resumen.personas)}</span>
            <span className="etiqueta">personas registradas</span>
          </Link>
          {misLideres[0]?.meta_votos > 0 && (
            <div className="tarjeta cifra">
              <span className="valor">{Math.round((100 * resumen.personas) / misLideres[0].meta_votos)}%</span>
              <span className="etiqueta">de tu meta de {formatoNumero(misLideres[0].meta_votos)}</span>
            </div>
          )}
          {resumen.porRevisar + resumen.sinUbicacion > 0 && (
            <Link to="/personas" className="tarjeta cifra alerta">
              <span className="valor">{formatoNumero(resumen.porRevisar + resumen.sinUbicacion)}</span>
              <span className="etiqueta">sin puesto de votación confirmado</span>
            </Link>
          )}
        </div>
      )}

      {(rol === 'admin' || rol === 'coordinador') && resumen && (
        <div className="rejilla" style={{ marginBottom: '1rem' }}>
          <Link to="/personas" className="tarjeta cifra">
            <span className="valor">{formatoNumero(resumen.personas)}</span>
            <span className="etiqueta">personas registradas{rol === 'coordinador' ? ' por tus líderes' : ''}</span>
          </Link>
          {rol === 'admin' && (
            <Link to="/revision" className={`tarjeta cifra ${resumen.porRevisar ? 'alerta' : ''}`}>
              <span className="valor">{formatoNumero(resumen.porRevisar)}</span>
              <span className="etiqueta">con puesto por revisar</span>
            </Link>
          )}
          <Link to="/personas" className="tarjeta cifra">
            <span className="valor">{formatoNumero(resumen.sinUbicacion)}</span>
            <span className="etiqueta">sin lugar de votación</span>
          </Link>
        </div>
      )}

      {['admin', 'coordinador', 'candidato'].includes(rol) && (
        <>
          {rol === 'candidato' && (
            <div className="rejilla" style={{ marginBottom: '1rem' }}>
              <div className="tarjeta cifra"><span className="valor">{cargado ? formatoNumero(total) : '…'}</span><span className="etiqueta">simpatizantes registrados</span></div>
            </div>
          )}
          <div className="rejilla" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            <Barras titulo="Por sexo" datos={porSexo} cargado={cargado} />
            <Barras titulo="Por edad" datos={porEdad} cargado={cargado} />
          </div>
          <div style={{ marginTop: '1rem' }}><Barras titulo="Localidades con más registrados" datos={porLocalidad} cargado={cargado} /></div>
          {rol === 'candidato' && <p className="ayuda" style={{ marginTop: '1rem' }}>Son simpatizantes registrados, no votos. El tablero con mapa por zona llega en la siguiente fase.</p>}
        </>
      )}
    </>
  );
}
