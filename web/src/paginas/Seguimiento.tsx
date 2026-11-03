// Seguimiento: llamar o escribir a cada simpatizante y anotar si confirma.
// Idea rescatada del piloto (llamadas y confirmados), ahora en un toque.
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, HelpCircle, MessageCircle, Phone, PhoneOff, UserCheck, Users, XCircle } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { useEnVivo } from '../lib/enVivo';
import { COMPROMISOS, type Compromiso, type Lider, type PersonaFila, type ResultadoContacto, type SeguimientoLider } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';
import EnVivo from '../componentes/EnVivo';
import { BarrasH, SERIES } from '../componentes/Graficos';
import { Cifra, Plegable, QueEs, pct } from '../componentes/Piezas';

export const enlaceWhatsApp = (tel: string | null, texto: string) =>
  tel ? `https://wa.me/57${tel}?text=${encodeURIComponent(texto)}` : null;

const FILTROS: [Compromiso | '', string][] = [
  ['sin_contactar', 'Por contactar'], ['dudoso', 'Dudosos'], ['confirmado', 'Confirmados'],
  ['no_apoya', 'No apoyan'], ['numero_errado', 'Número equivocado'], ['', 'Todos'],
];
const BOTONES: { r: ResultadoContacto; texto: string; icono: typeof CheckCircle2; clase?: string }[] = [
  { r: 'confirmado', texto: 'Confirmó', icono: CheckCircle2, clase: 'si' },
  { r: 'dudoso', texto: 'Dudoso', icono: HelpCircle },
  { r: 'no_apoya', texto: 'No apoya', icono: XCircle },
  { r: 'no_contesta', texto: 'No contestó', icono: PhoneOff },
  { r: 'numero_errado', texto: 'Número malo', icono: Phone },
];

export default function Seguimiento() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const [resumen, setResumen] = useState<SeguimientoLider[] | null>(null);
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [filtro, setFiltro] = useState<Compromiso | ''>('sin_contactar');
  const [liderId, setLiderId] = useState('');
  const [texto, setTexto] = useState('');
  const [filas, setFilas] = useState<PersonaFila[] | null>(null);
  const [total, setTotal] = useState(0);
  const [canal, setCanal] = useState<Record<string, 'llamada' | 'whatsapp'>>({});
  const [aviso, setAviso] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState('');

  const vivo = useEnVivo(() => api.seguimientoLideres().then(setResumen), ['registros']);
  useEffect(() => { if (rol !== 'lider') api.lideres().then(setLideres).catch(() => {}); }, [api, rol]);

  const cargar = useCallback(async (desde = 0) => {
    try {
      const r = await api.personas({ texto, estado: '', desde, compromiso: filtro, liderId: liderId || undefined });
      setFilas((f) => (desde === 0 ? r.filas : [...(f ?? []), ...r.filas]));
      setTotal(r.total);
    } catch (e) { setError(mensajeError(e)); }
  }, [api, texto, filtro, liderId]);
  useEffect(() => { const t = setTimeout(() => cargar(0), 250); return () => clearTimeout(t); }, [cargar]);

  const anotar = async (p: PersonaFila, r: ResultadoContacto) => {
    setError(''); setAviso('');
    try {
      await api.registrarContacto(p.id, r, canal[p.id] ?? 'llamada');
      const nuevo = r === 'no_contesta' ? p.compromiso : r;
      setFilas((f) => (f ?? []).flatMap((x) => (x.id !== p.id ? [x] : filtro && filtro !== nuevo ? [] : [{ ...x, compromiso: nuevo, contactos_n: x.contactos_n + 1 }])));
      if (filtro && filtro !== nuevo) setTotal((t) => t - 1);
      setAbierto(null);
      setAviso(`${p.nombres}: ${r === 'no_contesta' ? 'no contestó (queda para volver a intentar)' : COMPROMISOS[nuevo].toLowerCase()}.`);
      vivo.recargar();
    } catch (e) { setError(mensajeError(e)); }
  };

  const t = (resumen ?? []).reduce((a, l) => ({
    total: a.total + l.total, conf: a.conf + l.confirmados, sin: a.sin + l.sin_contactar, dud: a.dud + l.dudosos,
    no: a.no + l.no_apoya, err: a.err + l.numero_errado, cont: a.cont + l.contactados,
  }), { total: 0, conf: 0, sin: 0, dud: 0, no: 0, err: 0, cont: 0 });
  const nombreOrg = sesion!.organizacion ?? 'la campaña';

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Seguimiento</h1>
          <p className="subtitulo">Llama o escribe a cada persona y anota qué te dijo. Así sabemos con quién contamos de verdad.</p>
          <EnVivo {...vivo} />
        </div>
      </div>
      {error && <div className="aviso error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="cifras">
        <Cifra icono={UserCheck} valor={resumen ? `${pct(t.conf, t.total)}%` : null} etiqueta="confirmaron su apoyo" tono="ok" detalle={`${t.conf} de ${t.total} personas`} />
        <Cifra icono={Users} valor={resumen ? t.sin : null} etiqueta="por contactar" tono="info" detalle={`${pct(t.cont, t.total)}% ya fue contactado`} />
        <Cifra icono={HelpCircle} valor={resumen ? t.dud : null} etiqueta="dudosos" detalle="Vale la pena volver a hablarles" />
        <Cifra icono={Phone} valor={resumen ? t.err : null} etiqueta="con número equivocado" tono={t.err ? 'aviso' : undefined} detalle="Hay que corregir el celular" />
      </div>

      {rol !== 'lider' && resumen && resumen.length > 0 && (
        <div className="seccion">
          <Plegable titulo={<>Avance por líder <QueEs>Cuántas personas de cada líder ya confirmaron, están dudosas, no apoyan o siguen sin contactar.</QueEs></>} cuenta={`${resumen.length} líderes`}>
            <BarrasH limite={10}
              series={[{ nombre: 'Confirmados', color: SERIES[2] }, { nombre: 'Dudosos', color: SERIES[3] }, { nombre: 'No apoyan', color: SERIES[1] }, { nombre: 'Sin contactar', color: 'var(--borde-fuerte)' }]}
              filas={[...resumen].sort((a, b) => b.total - a.total).map((l) => ({
                nombre: l.nombre, valores: [l.confirmados, l.dudosos, l.no_apoya, l.sin_contactar],
                detalle: `${pct(l.confirmados, l.total)}% confirmados · ${l.numero_errado} con número malo`,
              }))} />
          </Plegable>
        </div>
      )}

      <div className="tarjeta seccion">
        <div className="segmentos" role="group" aria-label="Qué personas ver" style={{ marginBottom: '0.75rem' }}>
          {FILTROS.map(([k, n]) => <button key={n} type="button" className="opcion" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{n}</button>)}
        </div>
        <div className="filtros">
          <input type="search" placeholder="Buscar por nombre o cédula" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar" />
          {rol !== 'lider' && (
            <select value={liderId} onChange={(e) => setLiderId(e.target.value)} aria-label="Líder">
              <option value="">Todos los líderes</option>
              {lideres.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          )}
        </div>
        {aviso && <div className="aviso ok" role="status" style={{ marginBottom: '0.75rem' }}>{aviso}</div>}
        {filas == null ? <p className="vacio">Cargando…</p> : filas.length === 0 ? (
          <p className="vacio">{filtro === 'sin_contactar' ? '¡No queda nadie por contactar!' : 'Nadie en esta lista.'}</p>
        ) : (
          <>
            <p className="ayuda">{total} {total === 1 ? 'persona' : 'personas'}</p>
            <ul className="lista-contactos">
              {filas.map((p) => {
                const wa = enlaceWhatsApp(p.telefono, `Hola ${p.nombres}, te saluda ${p.lider ?? 'tu líder'} de ${nombreOrg}. Queremos contar contigo el día de las elecciones. ¿Podemos contar con tu voto?`);
                return (
                  <li key={p.id} className="contacto">
                    <div className="contacto-datos">
                      <strong>{p.nombres} {p.apellidos}</strong>
                      <span className={`chip-compromiso ${p.compromiso}`}>{COMPROMISOS[p.compromiso]}</span>
                      <small>{p.telefono ?? 'Sin celular'} · {p.puesto ?? p.puesto_reportado ?? 'Sin puesto'}{p.mesa ? ` · mesa ${p.mesa}` : ''}{rol !== 'lider' && p.lider ? ` · ${p.lider}` : ''}{p.contactos_n ? ` · ${p.contactos_n} ${p.contactos_n === 1 ? 'intento' : 'intentos'}` : ''}</small>
                    </div>
                    <div className="contacto-canales">
                      {p.telefono && <a className="boton chico" href={`tel:+57${p.telefono}`} onClick={() => { setCanal((c) => ({ ...c, [p.id]: 'llamada' })); setAbierto(p.id); }} aria-label={`Llamar a ${p.nombres}`}><Phone className="icono" aria-hidden /><span className="rotulo">Llamar</span></a>}
                      {wa && <a className="boton chico" href={wa} target="_blank" rel="noreferrer" onClick={() => { setCanal((c) => ({ ...c, [p.id]: 'whatsapp' })); setAbierto(p.id); }} aria-label={`WhatsApp a ${p.nombres}`}><MessageCircle className="icono" aria-hidden /><span className="rotulo">WhatsApp</span></a>}
                      <button type="button" className={`boton chico${abierto === p.id ? ' primario' : ''}`} aria-expanded={abierto === p.id} onClick={() => setAbierto(abierto === p.id ? null : p.id)}>Anotar</button>
                    </div>
                    {abierto === p.id && <div className="contacto-resultado" role="group" aria-label={`Resultado con ${p.nombres}`}>
                      {BOTONES.map((b) => (
                        <button key={b.r} type="button" className={`boton chico ${b.clase ?? ''}`} onClick={() => anotar(p, b.r)}>
                          <b.icono className="icono" aria-hidden />{b.texto}
                        </button>
                      ))}
                    </div>}
                  </li>
                );
              })}
            </ul>
            {filas.length < total && <button className="boton bloque" onClick={() => cargar(filas.length)}>Ver más ({total - filas.length})</button>}
          </>
        )}
      </div>
    </>
  );
}
