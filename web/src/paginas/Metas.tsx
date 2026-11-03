// Metas por líder: cuánto lleva cada uno frente a su meta y al ritmo que
// debería llevar hoy, más el ranking de la semana (idea del piloto).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, CalendarRange, CheckCircle2, CircleAlert, CircleDot, Minus, Pencil, Target, Trophy } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { useEnVivo } from '../lib/enVivo';
import type { FechasMeta, MetaLider, RankingFila, Semaforo } from '../lib/tipos';
import { formatoNumero, mensajeError } from '../lib/utilidades';
import EnVivo from '../componentes/EnVivo';
import { Cifra, QueEs } from '../componentes/Piezas';

export const SEMAFORO: Record<Semaforo, { texto: string; clase: string }> = {
  cumplida: { texto: 'Meta cumplida', clase: 'cumplida' },
  verde: { texto: 'Al día', clase: 'verde' },
  amarillo: { texto: 'Un poco atrás', clase: 'amarillo' },
  rojo: { texto: 'Muy atrás', clase: 'rojo' },
  sin_meta: { texto: 'Sin meta', clase: 'sin-meta' },
};
const ORDEN: Semaforo[] = ['rojo', 'amarillo', 'verde', 'cumplida', 'sin_meta'];
const fechaLarga = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
const hace = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);

export default function Metas() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const puedeEditar = rol === 'admin' || rol === 'coordinador';
  const [metas, setMetas] = useState<MetaLider[] | null>(null);
  const [fechas, setFechas] = useState<FechasMeta | null>(null);
  const [ranking, setRanking] = useState<RankingFila[]>([]);
  const [filtro, setFiltro] = useState<Semaforo | ''>('');
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(() => Promise.all([api.metasLideres().then(setMetas), api.fechasMeta().then(setFechas), api.rankingSemanal().then(setRanking)])
    .catch((e) => setError(mensajeError(e))), [api]);
  const vivo = useEnVivo(cargar, ['registros']);

  const cuenta = (s: Semaforo) => (metas ?? []).filter((m) => m.semaforo === s).length;
  const lista = (metas ?? []).filter((m) => !filtro || m.semaforo === filtro)
    .sort((a, b) => ORDEN.indexOf(a.semaforo) - ORDEN.indexOf(b.semaforo) || b.registrados / (b.meta || 1) - a.registrados / (a.meta || 1));
  const totalMeta = (metas ?? []).reduce((a, m) => a + m.meta, 0);
  const totalReg = (metas ?? []).reduce((a, m) => a + Math.min(m.registrados, m.meta || m.registrados), 0);
  const quietos = (metas ?? []).filter((m) => m.meta > 0 && m.semaforo !== 'cumplida' && (hace(m.ultimo_registro) ?? 99) >= 7).length;

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Metas</h1>
          <p className="subtitulo">Cuánto lleva cada líder frente a su meta y al ritmo que debería llevar hoy.</p>
          <EnVivo {...vivo} />
        </div>
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      <Fechas fechas={fechas} esAdmin={rol === 'admin'} alGuardar={cargar} />

      <div className="cifras">
        <Cifra icono={Target} valor={metas ? `${totalMeta ? Math.round((100 * totalReg) / totalMeta) : 0}%` : null} etiqueta="de la meta total"
          detalle={`${formatoNumero(totalReg)} de ${formatoNumero(totalMeta)} personas`} tono="ok" />
        <Cifra icono={CircleAlert} valor={metas ? cuenta('rojo') : null} etiqueta="líderes muy atrás" tono={cuenta('rojo') ? 'aviso' : undefined}
          detalle={quietos ? `${quietos} sin registrar hace una semana o más` : undefined} />
        <Cifra icono={CircleDot} valor={metas ? cuenta('amarillo') : null} etiqueta="un poco atrás" />
        <Cifra icono={CheckCircle2} valor={metas ? cuenta('verde') + cuenta('cumplida') : null} etiqueta="al día o con la meta cumplida" tono="ok" />
      </div>

      <div className="metas-cuerpo seccion">
        <div className="tarjeta">
          <div className="segmentos" role="group" aria-label="Qué líderes ver" style={{ marginBottom: '0.75rem' }}>
            <button type="button" className="opcion" aria-pressed={filtro === ''} onClick={() => setFiltro('')}>Todos</button>
            {ORDEN.filter((s) => cuenta(s)).map((s) => (
              <button key={s} type="button" className="opcion" aria-pressed={filtro === s} onClick={() => setFiltro(s)}>
                <span className={`punto ${SEMAFORO[s].clase}`} aria-hidden />{SEMAFORO[s].texto} ({cuenta(s)})
              </button>
            ))}
          </div>
          {metas == null ? <p className="vacio">Cargando…</p> : lista.length === 0 ? <p className="vacio">No hay líderes en esta lista.</p> : (
            <ul className="lista-metas">
              {lista.map((m) => {
                const avance = m.meta ? Math.min(100, (100 * m.registrados) / m.meta) : 0;
                const marca = m.meta && m.esperado_hoy ? Math.min(100, (100 * m.esperado_hoy) / m.meta) : null;
                const dias = hace(m.ultimo_registro);
                const delta = m.esta_semana - m.semana_anterior;
                return (
                  <li key={m.lider_id} className="meta-fila">
                    <div className="meta-encabezado">
                      <strong>{m.nombre}</strong>
                      <span className={`chip-semaforo ${SEMAFORO[m.semaforo].clase}`}>{SEMAFORO[m.semaforo].texto}</span>
                      {m.coordinador && <small className="ayuda">coord. {m.coordinador}</small>}
                    </div>
                    <div className="meta-barra" title={marca != null ? `Hoy debería llevar ${m.esperado_hoy}` : undefined}>
                      <span className={`relleno ${SEMAFORO[m.semaforo].clase}`} style={{ width: `${avance}%` }} />
                      {marca != null && m.semaforo !== 'cumplida' && <span className="esperado" style={{ left: `${marca}%` }} />}
                    </div>
                    <div className="meta-datos">
                      {editando === m.lider_id ? (
                        <EditarMeta m={m} alTerminar={(ok) => { setEditando(null); if (ok) cargar(); }} />
                      ) : (
                        <span>
                          <strong>{formatoNumero(m.registrados)}</strong> de {m.meta ? formatoNumero(m.meta) : 'sin meta'}
                          {m.esperado_hoy != null && m.semaforo !== 'cumplida' && m.meta > 0 && <span className="ayuda"> · hoy debería llevar {formatoNumero(m.esperado_hoy)}</span>}
                          {puedeEditar && <button className="icono-boton" onClick={() => setEditando(m.lider_id)} aria-label={`Cambiar la meta de ${m.nombre}`} title="Cambiar meta"><Pencil aria-hidden /></button>}
                        </span>
                      )}
                      <span className="ayuda semana">
                        {m.esta_semana} esta semana
                        {delta > 0 ? <ArrowUp aria-label="más que la semana anterior" className="sube" /> : delta < 0 ? <ArrowDown aria-label="menos que la semana anterior" className="baja" /> : <Minus aria-label="igual" />}
                        {dias != null && dias >= 7 && m.semaforo !== 'cumplida' && <span className="quieto"> · sin registrar hace {dias} días</span>}
                        {m.registrados === 0 && <span className="quieto"> · todavía no registra a nadie</span>}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Ranking filas={ranking} />
      </div>
    </>
  );
}

export function Ranking({ filas, compacto = false }: { filas: RankingFila[]; compacto?: boolean }) {
  const max = Math.max(1, ...filas.map((f) => f.registros));
  return (
    <div className="tarjeta ranking">
      <div className="tarjeta-titulo">
        <h2><Trophy className="icono" aria-hidden /> Ranking de la semana <QueEs>Quién registró más personas en los últimos 7 días. Se reinicia solo: cada semana hay una nueva oportunidad.</QueEs></h2>
      </div>
      {filas.filter((f) => f.registros > 0).length === 0 ? <p className="ayuda">Nadie ha registrado esta semana todavía. ¡Sé el primero!</p> : (
        <ol className="lista-ranking">
          {filas.map((f) => (
            <li key={f.lider_id} className={f.soy_yo ? 'yo' : ''}>
              <span className={`medalla m${f.posicion}`}>{f.posicion}</span>
              <span className="nombre">{f.soy_yo ? `${f.nombre} (tú)` : f.nombre}</span>
              {!compacto && <span className="pista"><span style={{ width: `${(100 * f.registros) / max}%` }} /></span>}
              <strong>{f.registros}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Fechas({ fechas, esAdmin, alGuardar }: { fechas: FechasMeta | null; esAdmin: boolean; alGuardar: () => void }) {
  const { api } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [ini, setIni] = useState('');
  const [fin, setFin] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setIni(fechas?.inicio ?? ''); setFin(fechas?.fin ?? ''); }, [fechas]);
  if (!fechas) return null;
  const guardar = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try { await api.configurarFechasMeta(ini, fin); setAbierto(false); alGuardar(); } catch (err) { setError(mensajeError(err)); }
  };
  return (
    <div className="aviso info fechas-meta" style={{ marginBottom: '1rem' }}>
      <CalendarRange className="icono" aria-hidden />
      {fechas.inicio && fechas.fin ? (
        <span>Registros del {fechaLarga(fechas.inicio)} al {fechaLarga(fechas.fin)}: <strong>hoy cada líder debería llevar el {Math.round((fechas.esperado ?? 0) * 100)}% de su meta.</strong></span>
      ) : (
        <span>Sin fechas de registro: el semáforo usa solo el porcentaje de la meta.{esAdmin ? ' Define desde y hasta cuándo se registra para medir el ritmo.' : ''}</span>
      )}
      {esAdmin && !abierto && <button className="boton chico" onClick={() => setAbierto(true)}>{fechas.inicio ? 'Cambiar fechas' : 'Definir fechas'}</button>}
      {abierto && (
        <form onSubmit={guardar} className="fechas-form">
          <label className="campo"><span>Desde</span><input type="date" value={ini} onChange={(e) => setIni(e.target.value)} required /></label>
          <label className="campo"><span>Hasta</span><input type="date" value={fin} onChange={(e) => setFin(e.target.value)} required /></label>
          <button className="boton chico primario">Guardar</button>
          <button type="button" className="boton chico" onClick={() => setAbierto(false)}>Cancelar</button>
          {error && <span className="aviso error" role="alert">{error}</span>}
        </form>
      )}
    </div>
  );
}

function EditarMeta({ m, alTerminar }: { m: MetaLider; alTerminar: (ok: boolean) => void }) {
  const { api } = useSesion();
  const [valor, setValor] = useState(String(m.meta || ''));
  const [error, setError] = useState('');
  const guardar = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 0 || n > 100000) return setError('Escribe un número entre 0 y 100.000');
    try { await api.cambiarMeta(m.lider_id, n); alTerminar(true); } catch (err) { setError(mensajeError(err)); }
  };
  return (
    <form onSubmit={guardar} className="editar-meta">
      <span>{formatoNumero(m.registrados)} de</span>
      <input type="number" min={0} inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} aria-label={`Nueva meta de ${m.nombre}`} autoFocus />
      <button className="boton chico primario">Guardar</button>
      <button type="button" className="boton chico" onClick={() => alTerminar(false)}>Cancelar</button>
      {error && <span className="aviso error" role="alert">{error}</span>}
    </form>
  );
}
