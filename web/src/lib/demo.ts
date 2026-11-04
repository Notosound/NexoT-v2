// Modo demostración: todo en memoria, con datos INVENTADOS (salvo el
// catálogo de puestos, que es el oficial y público). Sirve para ver y probar
// el panel sin Supabase. Nunca se incluye en el build normal.
import type {
  Api, Demografia, FilaImportacion, PuestoCenso, Tendencia,
  Eleccion, EstadoMesa, CalidadLider, PuestoCodigos, RegistrosMesa, ResultadoFilaE14, LiderE14, LocalidadE14, MesaE14, PuestoE14, TotalesE14, GrupoRevision, Importacion, Lider, Localidad, MiembroEquipo,
  PersonaFila, Puesto, Rol, Sesion, Sexo, Sugerencia, Compromiso, Testigo,
  Politica, SolicitudDatos, AccionSensible, FactorDosPasos, Historico, PotencialPuesto, FilaHistoricoResultado, MetaLider, RankingFila, Semaforo, Evento, Asistente,
} from './tipos';
import QRCode from 'qrcode';
import { TERMINOS_VERSION } from './tipos';
import { edadDesde, hoyISO, normalizar } from './utilidades';
import crudo from './demo-puestos.json';
import { codigoOficial } from './mapeoE14';

const espera = (ms = 120) => new Promise((r) => setTimeout(r, ms));

const LOCALIDADES: Localidad[] = [
  'Usaquén', 'Chapinero', 'Santa Fe', 'San Cristóbal', 'Usme', 'Tunjuelito', 'Bosa', 'Kennedy', 'Fontibón', 'Engativá',
  'Suba', 'Barrios Unidos', 'Teusaquillo', 'Los Mártires', 'Antonio Nariño', 'Puente Aranda', 'La Candelaria',
  'Rafael Uribe Uribe', 'Ciudad Bolívar', 'Sumapaz',
].map((nombre, i) => ({ id: i + 1, codigo: String(i + 1).padStart(2, '0'), nombre }));

type Crudo = [number, number, string, string, number, number | null, number | null, number, number, string, string];
const PUESTOS: Puesto[] = (crudo as Crudo[])
  .map(([id, loc, nombre, direccion, mesas]) => ({ id, localidad_id: loc, nombre, direccion, mesas_total: mesas }));
const CODIGOS = new Map((crudo as Crudo[]).map((c) => [c[0], { zona: c[9], codigo: c[10] }]));
const CENSO: PuestoCenso[] = (crudo as Crudo[]).map(([id, loc, nombre, , , lat, lon, m, h]) => ({
  id, localidad_id: loc, nombre, latitud: lat, longitud: lon, censo_mujeres: m, censo_hombres: h, censo_total: m + h,
}));

interface PersonaDemo {
  id: string; liderId: string; cedula: string; nombres: string; apellidos: string; sexo: Sexo | null;
  fechaNacimiento: string | null; edad: number | null; edadEn: string | null; telefono: string | null;
  localidadId: number | null; puestoId: number | null; puestoReportado: string | null; direccionReportada: string | null;
  mesa: number | null; creadoEn: string; eliminada: boolean; origen?: string;
  compromiso?: Compromiso; contactosN?: number; transporte?: boolean;
}

// Generador pseudoaleatorio con semilla: los mismos datos en cada carga
let semilla = 20261031;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
const uno = <T,>(xs: T[]) => xs[Math.floor(azar() * xs.length)];

const NOMBRES_F = ['Ana', 'Luz', 'Marta', 'Sandra', 'Paola', 'Diana', 'Carolina', 'Gloria', 'Yolanda', 'Natalia', 'Lina', 'Rosa'];
const NOMBRES_M = ['Carlos', 'Jorge', 'Luis', 'Andrés', 'Javier', 'Óscar', 'Fabio', 'Hernán', 'Wilson', 'Diego', 'Camilo', 'Edgar'];
const APELLIDOS = ['Rojas', 'Gómez', 'Díaz', 'Torres', 'Moreno', 'Vargas', 'Castro', 'Ruiz', 'Ortiz', 'Suárez', 'Pardo', 'Niño', 'Cárdenas', 'Mejía'];

const ORG = 'org-demo';
const HACE = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString();
const miembro = (id: string, nombre: string, rol: Rol, email: string, acepto = true): MiembroEquipo =>
  ({ id, nombre, rol, activo: true, email, creado_en: HACE(30), ultimo_ingreso: acepto ? HACE(1) : null, acepto, lider_id: null });
const usuarios: MiembroEquipo[] = [
  miembro('u-admin', 'Admin Demo', 'admin', 'admin@demo.co'),
  miembro('u-coord', 'Coordinadora Demo', 'coordinador', 'coordinadora@demo.co'),
  { ...miembro('u-lider', 'Líder Demo', 'lider', 'lider@demo.co'), lider_id: 'l-1' },
  miembro('u-cand', 'Candidato Demo', 'candidato', 'candidato@demo.co'),
  miembro('u-dig', 'Digitador Demo', 'digitador', 'digitador@demo.co'),
  miembro('u-dig2', 'Segunda Digitadora', 'digitador', 'digitadora2@demo.co', false),
];
const lideres: (Omit<Lider, 'registrados'> & { token?: string; enlaceActivo?: boolean })[] = [
  { id: 'l-1', nombre: 'Líder Demo', cedula: '900001', telefono: '3001112233', meta_votos: 250, coordinador_id: 'u-coord', perfil_id: 'u-lider' },
  { id: 'l-2', nombre: 'Marcela Pinto', cedula: '900002', telefono: null, meta_votos: 450, coordinador_id: 'u-coord', perfil_id: null },
  { id: 'l-3', nombre: 'Germán Ríos', cedula: '900003', telefono: null, meta_votos: 180, coordinador_id: null, perfil_id: null },
];
const alias = new Map<string, number>();
const personas: PersonaDemo[] = [];

const NOMBRES_ALTERNOS = ['Colegio de la 116', 'IED Sede B', 'Salón comunal', 'Coliseo del barrio'];
for (let i = 0; i < 600; i++) {
  const f = azar() < 0.55;
  const loc = uno([1, 1, 2, 4, 5, 7, 8, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13, 16, 18, 18, 18, 18, 19, 19, 6, 3, 15, 14]);
  const puestosLoc = PUESTOS.filter((p) => p.localidad_id === loc);
  const puesto = uno(puestosLoc);
  const caso = azar();
  const reportado = caso < 0.12 ? `${uno(NOMBRES_ALTERNOS)} ${loc}` : null;
  personas.push({
    id: `p-${i}`, liderId: uno(lideres).id, cedula: String(52000000 + i * 7919), sexo: f ? 'femenino' : 'masculino',
    nombres: f ? uno(NOMBRES_F) : uno(NOMBRES_M), apellidos: `${uno(APELLIDOS)} ${uno(APELLIDOS)}`,
    fechaNacimiento: `${1950 + Math.floor(azar() * 55)}-0${1 + Math.floor(azar() * 9)}-1${Math.floor(azar() * 9)}`,
    edad: null, edadEn: null, telefono: `3${String(100000000 + Math.floor(azar() * 899999999))}`,
    localidadId: caso < 0.95 ? loc : null, puestoId: reportado || caso >= 0.95 ? null : puesto.id,
    puestoReportado: reportado, direccionReportada: null,
    mesa: reportado || caso >= 0.95 ? null : 1 + Math.floor(azar() * (puesto.mesas_total ?? 1)),
    creadoEn: new Date(Date.now() - i * 3600_000 * 1.2).toISOString(), eliminada: false,
  });
}

// ── E14 en memoria (misma regla que la base de datos) ──
const elecciones: Eleccion[] = [{ id: 'e-1', nombre: 'Senado 2026 (demo)', fecha: '2026-03-08', modo_digitacion: 'doble' }];
interface DigDemo { id: number; eleccionId: string; mesaId: number; votos: number; por: string; en: string }
const digitaciones: DigDemo[] = [];
const resultados = new Map<string, { votos: number | null; estado: EstadoMesa; admin: boolean }>();
const mesaId = (puestoId: number, numero: number) => puestoId * 1000 + numero;
const clave = (e: string, m: number) => `${e}|${m}`;

function consolidar(eleccionId: string, m: number) {
  const r = resultados.get(clave(eleccionId, m));
  if (r?.admin) return;
  const modo = elecciones.find((x) => x.id === eleccionId)!.modo_digitacion;
  const ds = digitaciones.filter((d) => d.eleccionId === eleccionId && d.mesaId === m);
  let estado: EstadoMesa, votos: number | null = null;
  if (modo === 'simple') { estado = 'verificado'; votos = ds[ds.length - 1].votos; }
  else if (ds.length < 2) estado = 'una_digitacion';
  else if (new Set(ds.map((d) => d.votos)).size === 1) { estado = 'verificado'; votos = ds[0].votos; }
  else estado = 'en_revision';
  resultados.set(clave(eleccionId, m), { votos, estado, admin: false });
}

function mesasCalc(eleccionId: string) {
  const esp = new Map<number, { esperados: number; porLider: Map<string, number>; puestoId: number; numero: number }>();
  for (const p of personas) {
    if (p.eliminada || !p.puestoId || !p.mesa) continue;
    const m = mesaId(p.puestoId, p.mesa);
    const e = esp.get(m) ?? { esperados: 0, porLider: new Map(), puestoId: p.puestoId, numero: p.mesa };
    e.esperados++; e.porLider.set(p.liderId, (e.porLider.get(p.liderId) ?? 0) + 1);
    esp.set(m, e);
  }
  return [...esp.entries()].map(([m, e]) => {
    const r = resultados.get(clave(eleccionId, m));
    const puesto = PUESTOS.find((x) => x.id === e.puestoId)!;
    const loc = LOCALIDADES.find((l) => l.id === puesto.localidad_id)!;
    const votos = r?.estado === 'verificado' ? r.votos : null;
    const conf = votos == null ? null : Math.min(e.esperados, votos);
    return {
      mesa_id: m, mesa: e.numero, puesto_id: puesto.id, puesto: puesto.nombre, localidad_id: loc.id, localidad: loc.nombre,
      estado: (r?.estado ?? 'pendiente') as EstadoMesa, esperados: e.esperados, votos_reales: votos, confirmados: conf,
      faltantes: conf == null ? null : e.esperados - conf, adicionales: conf == null || votos == null ? null : votos - conf,
      porLider: e.porLider,
    };
  });
}

function sumar<K extends string>(filas: ReturnType<typeof mesasCalc>, k: (f: ReturnType<typeof mesasCalc>[number]) => K) {
  const m = new Map<K, TotalesE14 & { f: ReturnType<typeof mesasCalc>[number] }>();
  for (const f of filas) {
    const t = m.get(k(f)) ?? { esperados: 0, confirmados: 0, faltantes: 0, adicionales: 0, votos_reales: 0, mesas: 0, mesas_verificadas: 0, f };
    t.esperados += f.esperados; t.confirmados += f.confirmados ?? 0; t.faltantes += f.faltantes ?? 0;
    t.adicionales += f.adicionales ?? 0; t.votos_reales += f.votos_reales ?? 0; t.mesas++;
    if (f.estado === 'verificado') t.mesas_verificadas++;
    m.set(k(f), t);
  }
  return [...m.values()];
}

// Datos de ejemplo: parte de la gente ya fue contactada; dos comparten celular
{
  const estados: Compromiso[] = ['confirmado', 'confirmado', 'confirmado', 'dudoso', 'no_apoya', 'numero_errado'];
  personas.forEach((p, i) => { if (i % 3 === 0) { p.compromiso = estados[i % estados.length]; p.contactosN = 1 + (i % 2); } });
  if (personas.length > 12 && personas[12].telefono) personas[11].telefono = personas[12].telefono;
}

// Datos de ejemplo: parte de las mesas ya digitadas por dos personas
{
  let n = 0;
  for (const f of mesasCalc('e-1')) {
    n++;
    if (n % 10 >= 7) continue;                                   // 30% pendientes
    const real = Math.max(0, f.esperados + Math.floor(azar() * 5) - 2);
    digitaciones.push({ id: digitaciones.length + 1, eleccionId: 'e-1', mesaId: f.mesa_id, votos: real, por: 'u-dig2', en: new Date().toISOString() });
    if (n % 10 === 6) { consolidar('e-1', f.mesa_id); continue; } // una sola digitación
    const otra = n % 17 === 0 ? real + 3 : real;                 // algunas no coinciden
    digitaciones.push({ id: digitaciones.length + 1, eleccionId: 'e-1', mesaId: f.mesa_id, votos: otra, por: 'u-otro', en: new Date().toISOString() });
    consolidar('e-1', f.mesa_id);
  }
}
const nombreUsuario = (id: string) => usuarios.find((u) => u.id === id)?.nombre ?? 'Digitador externo';

let actual: { usuario: MiembroEquipo } | null = null;
try {
  const guardado = sessionStorage.getItem('demo-usuario');
  if (guardado) actual = { usuario: usuarios.find((u) => u.id === guardado)! };
} catch { /* sin almacenamiento */ }
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

const votos = new Map<string, Set<string>>();
const testigosDemo: { id: number; eleccion: string; persona_id: string; puesto_id: number; mesas: number[] }[] = [];
const oyentesDatos = new Set<(t: 'registros' | 'e14') => void>();

// Enlace de registro: fijo en la demostración (cada carga empieza de cero)
const tokenDemo = (liderId: string) => `demo${liderId.replace(/\W/g, '')}enlace`;

// Protección de datos y verificación en dos pasos (demostración)
const politicaDemo: Politica = {
  campana: 'Campaña de demostración', responsable: 'Campaña de demostración', documento: null,
  correo: 'datos@campana-demo.co', telefono: null, direccion: null, actualizada: null,
};
function habiles(n: number) {
  const d = new Date();
  for (let k = 0; k < n;) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) k++; }
  return d.toISOString().slice(0, 10);
}
const solicitudesDemo: SolicitudDatos[] = [];
let sembradas = false;
const accionesDemo: AccionSensible[] = [];
const factoresDemo: FactorDosPasos[] = [];
const recibeDemo = { valor: true };
// En la demostración los términos se piden solo si se abre con ?terminos (para probarlos)
const terminosDemo = new Set<string>();
const pedirTerminos = () => { try { return sessionStorage.getItem('demo-terminos') === '1'; } catch { return false; } };
try { if (new URLSearchParams(location.search).has('terminos')) sessionStorage.setItem('demo-terminos', '1'); } catch { /* */ }
function sembrarEventos() {
  if (eventosDemo.length) return;
  eventosDemo.push({ id: 'ev-1', nombre: 'Reunión en Suba (demo)', fecha: new Date(Date.now() - 3 * 86_400_000).toISOString(), lugar: 'Salón comunal',
    activo: true, token: 'demoevento1', lider_id: 'l-1', localidadId: 11,
    asistencias: personas.filter((p) => p.liderId === 'l-1').slice(0, 23).map((p, i) => ({ personaId: p.id, nueva: i % 4 === 0, en: p.creadoEn })) });
}
const eventosDemo: (Omit<Evento, 'asistentes' | 'nuevos' | 'lider' | 'localidad'> & { localidadId: number | null; asistencias: { personaId: string; nueva: boolean; en: string }[] })[] = [];
const fechasDemo: { inicio: string | null; fin: string | null } = { inicio: null, fin: null };
// Resultados históricos inventados para la demostración: votos por puesto
// con variación por localidad, para que el análisis de potencial tenga forma
const historicosDemo: { h: Historico; puestos: Map<number, { votos: number; validos: number }> }[] = [];
function sembrarHistorico() {
  if (historicosDemo.length) return;
  const puestos = new Map<number, { votos: number; validos: number }>();
  let semilla = 7;
  const azarH = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  for (const pu of PUESTOS) {
    const habil = CENSO.find((c) => c.id === pu.id)?.censo_total || 3000;
    const validos = Math.round(habil * (0.38 + azarH() * 0.2));
    const fuerza = 0.004 + ((pu.localidad_id * 37) % 11) / 800 + azarH() * 0.01;
    puestos.set(pu.id, { votos: Math.round(validos * fuerza), validos });
  }
  const votos = [...puestos.values()].reduce((a, x) => a + x.votos, 0);
  const validos = [...puestos.values()].reduce((a, x) => a + x.validos, 0);
  historicosDemo.push({ h: { id: 'h-2022', nombre: 'Senado 2022 (demo)', anio: 2022, cargado_en: new Date().toISOString(), puestos: puestos.size, votos, validos }, puestos });
}

// "Ver como" en demostración: cambia quién soy y prohíbe escribir
let vista: MiembroEquipo | null = null;
let vistaLider: string | null = null;
function yo() {
  if (!actual) throw new Error('Sesión cerrada');
  return vista ?? actual.usuario;
}
function soloLectura() {
  if (vista) throw new Error('Estás en "Ver como": es solo lectura');
}
function misLideres() {
  if (vistaLider) return lideres.filter((l) => l.id === vistaLider);
  const u = yo();
  if (u.rol === 'admin') return lideres;
  if (u.rol === 'coordinador') return lideres.filter((l) => l.coordinador_id === u.id);
  if (u.rol === 'lider') return lideres.filter((l) => l.perfil_id === u.id);
  return [];
}
function visibles() {
  const ids = new Set(misLideres().map((l) => l.id));
  return personas.filter((p) => !p.eliminada && ids.has(p.liderId));
}
function estado(p: PersonaDemo): PersonaFila['ubicacion_estado'] {
  if (p.puestoId && p.mesa) return 'completa';
  if (p.puestoId) return 'sin_mesa';
  if (p.puestoReportado || p.direccionReportada) return 'por_revisar';
  return 'sin_dato';
}
function sugerir(loc: number | null, nombre: string, _dir: string): Sugerencia | null {
  const n = normalizar(nombre);
  if (!n) return null;
  const candidatos = PUESTOS.filter((p) => loc == null || p.localidad_id === loc);
  const exacto = candidatos.find((p) => normalizar(p.nombre) === n);
  const porAlias = alias.get(`${loc}|${n}`);
  const parecido = candidatos.find((p) => normalizar(p.nombre).length >= 5 && (normalizar(p.nombre).includes(n) || n.includes(normalizar(p.nombre))));
  const p = exacto ?? (porAlias ? PUESTOS.find((x) => x.id === porAlias) : undefined) ?? parecido;
  if (!p) return null;
  return {
    puesto_id: p.id, nombre: p.nombre, direccion: p.direccion, mesas_total: p.mesas_total,
    metodo: exacto ? 'nombre_oficial' : porAlias ? 'alias' : 'nombre_parecido', confianza: exacto || porAlias ? 'alta' : 'media',
  };
}

function filtrarPersonas(texto: string, estadoFiltro: string, compromiso = '', liderId = '') {
  const t = normalizar(texto);
  let lista = visibles();
  if (compromiso) lista = lista.filter((p) => (p.compromiso ?? 'sin_contactar') === compromiso);
  if (liderId) lista = lista.filter((p) => p.liderId === liderId);
  if (t) lista = lista.filter((p) => p.cedula.startsWith(t) || normalizar(`${p.nombres} ${p.apellidos}`).includes(t));
  if (estadoFiltro) lista = lista.filter((p) => estado(p) === estadoFiltro);
  return lista;
}
function aFila(p: PersonaDemo): PersonaFila {
  return {
    id: p.id, cedula: p.cedula, nombres: p.nombres, apellidos: p.apellidos, sexo: p.sexo,
    edad: edadDesde(p.fechaNacimiento, p.edad, p.edadEn), telefono: p.telefono, lider: lideres.find((l) => l.id === p.liderId)?.nombre ?? null,
    localidad: LOCALIDADES.find((l) => l.id === p.localidadId)?.nombre ?? null,
    puesto: PUESTOS.find((x) => x.id === p.puestoId)?.nombre ?? null, puesto_reportado: p.puestoReportado,
    mesa: p.mesa, ubicacion_estado: estado(p), creado_en: p.creadoEn,
    compromiso: p.compromiso ?? 'sin_contactar', contactos_n: p.contactosN ?? 0, lider_id: p.liderId,
    necesita_transporte: !!p.transporte, barrio: null,
  };
}
const exportaciones: { tipo: string; filas: number; en?: string; usuario?: string }[] = [];

const importaciones = new Map<string, { imp: Importacion; filas: FilaImportacion[]; liderId: string | null }>();

export const api: Api = {
  modo: 'demo',

  async sesion(): Promise<Sesion | null> {
    await espera(60);
    if (!actual) return null;
    const u = actual.usuario;
    return { usuarioId: u.id, email: u.email, perfil: { nombre: u.nombre, rol: u.rol, organizacionId: ORG }, organizacion: 'Campaña de demostración',
      organizacionSlug: 'demo', terminos: terminosDemo.has(u.id) || !pedirTerminos() ? TERMINOS_VERSION : null };
  },
  alCambiarSesion(cb) { oyentes.add(cb); return () => oyentes.delete(cb); },
  async iniciarSesion(_email, _clave, rolDemo: Rol = 'admin') {
    await espera();
    actual = { usuario: usuarios.find((u) => u.rol === rolDemo)! };
    try { sessionStorage.setItem('demo-usuario', actual.usuario.id); } catch { /* */ }
    avisar();
  },
  async cerrarSesion() {
    actual = null;
    try { sessionStorage.removeItem('demo-usuario'); } catch { /* */ }
    avisar();
  },
  async cambiarClave() { await espera(); },
  async recuperarClave() { await espera(); },

  async localidades() { await espera(40); return LOCALIDADES; },
  async puestos(localidadId) { await espera(60); return PUESTOS.filter((p) => p.localidad_id === localidadId).sort((a, b) => a.nombre.localeCompare(b.nombre)); },
  async sugerirPuesto(loc, nombre, dir) { await espera(80); return sugerir(loc, nombre, dir); },

  async lideres() {
    await espera();
    return misLideres().map((l) => ({ ...l, registrados: personas.filter((p) => !p.eliminada && p.liderId === l.id).length }));
  },
  async crearLider(d) {
    await espera();
    const u = yo();
    if (d.cedula && lideres.some((l) => l.cedula === d.cedula)) throw new Error('Ya existe un líder con esa cédula.');
    lideres.push({ id: `l-${lideres.length + 1}`, nombre: d.nombre, cedula: d.cedula, telefono: d.telefono, meta_votos: d.meta,
      coordinador_id: u.rol === 'coordinador' ? u.id : d.coordinadorId, perfil_id: null });
  },
  async coordinadores() { await espera(40); return usuarios.filter((u) => u.rol === 'coordinador').map(({ id, nombre }) => ({ id, nombre })); },

  async registrarPersona(p) {
    await espera(250);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TypeError('Failed to fetch');  // simula la falta de señal
    if (!misLideres().some((l) => l.id === p.liderId)) throw new Error('No tienes permiso para hacer esto.');
    if (personas.some((x) => !x.eliminada && x.cedula === p.cedula)) throw new Error('Esta cédula ya está registrada.');
    let puestoId = p.puestoId;
    if (!puestoId && p.puestoReportado) {
      const s = sugerir(p.localidadId, p.puestoReportado, p.direccionReportada ?? '');
      if (s?.confianza === 'alta') puestoId = s.puesto_id;
    }
    if (!p.telefono || !/^3\d{9}$/.test(p.telefono)) throw new Error('El celular debe tener 10 dígitos y empezar por 3');
    const puesto = PUESTOS.find((x) => x.id === puestoId);
    const mesaValida = puesto && p.mesa && p.mesa <= (puesto.mesas_total ?? 0) ? p.mesa : null;
    const nueva: PersonaDemo = {
      id: `p-${personas.length}`, liderId: p.liderId, cedula: p.cedula, nombres: p.nombres, apellidos: p.apellidos, sexo: p.sexo,
      fechaNacimiento: p.fechaNacimiento, edad: p.fechaNacimiento ? null : p.edad, edadEn: hoyISO(), telefono: p.telefono,
      localidadId: puesto?.localidad_id ?? p.localidadId, puestoId: puestoId ?? null,
      puestoReportado: puestoId ? null : p.puestoReportado, direccionReportada: puestoId ? null : p.direccionReportada,
      mesa: puesto ? mesaValida : p.mesa, creadoEn: new Date().toISOString(), eliminada: false,
    };
    personas.unshift(nueva);
    return { ubicacion_estado: estado(nueva), puesto: puesto?.nombre ?? null };
  },

  async personas(f) {
    await espera();
    const lista = filtrarPersonas(f.texto, f.estado, f.compromiso ?? '', f.liderId ?? '');
    return { filas: lista.slice(f.desde, f.desde + 50).map(aFila), total: lista.length };
  },
  async personasTodas(f) { await espera(); return filtrarPersonas(f.texto, f.estado, f.compromiso ?? '', f.liderId ?? '').map(aFila); },
  async eliminarPersona(id) {
    await espera();
    const p = visibles().find((x) => x.id === id);
    if (!p) throw new Error('No tienes permiso para hacer esto.');
    p.eliminada = true;
  },
  async resumen() {
    await espera();
    const v = visibles();
    return { personas: v.length, porRevisar: v.filter((p) => estado(p) === 'por_revisar').length, sinUbicacion: v.filter((p) => estado(p) === 'sin_dato').length };
  },
  async demografia(): Promise<Demografia[]> {
    await espera();
    if (!['admin', 'coordinador', 'candidato'].includes(yo().rol)) return [];
    const m = new Map<string, Demografia>();
    for (const p of personas.filter((x) => !x.eliminada)) {
      const e = edadDesde(p.fechaNacimiento, p.edad, p.edadEn);
      const rango = e == null ? 'sin dato' : e < 25 ? '18-24' : e < 35 ? '25-34' : e < 45 ? '35-44' : e < 55 ? '45-54' : e < 65 ? '55-64' : '65+';
      const puesto = PUESTOS.find((x) => x.id === p.puestoId);
      const loc = LOCALIDADES.find((l) => l.id === (puesto?.localidad_id ?? null));
      const k = `${puesto?.id}|${rango}|${p.sexo}`;
      const fila = m.get(k) ?? {
        localidad_id: loc?.id ?? null, localidad: loc?.nombre ?? 'Sin lugar de votación',
        puesto_id: puesto?.id ?? null, puesto: puesto?.nombre ?? null,
        rango_edad: rango, sexo: p.sexo ?? 'sin dato', personas: 0,
      };
      fila.personas++;
      m.set(k, fila);
    }
    return [...m.values()];
  },
  async censoPuestos() { await espera(80); return CENSO; },
  async tendencia(): Promise<Tendencia[]> {
    await espera(60);
    const m = new Map<string, number>();
    for (const p of personas.filter((x) => !x.eliminada)) {
      const d = new Date(p.creadoEn);
      const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      m.set(dia, (m.get(dia) ?? 0) + 1);
    }
    return [...m.entries()].sort().map(([dia, nuevos]) => ({ dia, nuevos }));
  },

  async porRevisar(): Promise<GrupoRevision[]> {
    await espera();
    if (yo().rol !== 'admin') return [];
    const grupos = new Map<string, GrupoRevision>();
    for (const p of personas.filter((x) => !x.eliminada && estado(x) === 'por_revisar')) {
      const k = `${p.localidadId}|${normalizar(p.puestoReportado ?? '')}`;
      const g = grupos.get(k);
      if (g) { g.personas++; continue; }
      const s = sugerir(p.localidadId, p.puestoReportado ?? '', '');
      grupos.set(k, {
        localidad_id: p.localidadId, localidad: LOCALIDADES.find((l) => l.id === p.localidadId)?.nombre ?? null,
        puesto_reportado: p.puestoReportado, direccion_reportada: p.direccionReportada, personas: 1, persona_ejemplo: p.id,
        sugerencia_puesto_id: s?.puesto_id ?? null, sugerencia_puesto: s?.nombre ?? null,
        sugerencia_direccion: s?.direccion ?? null, sugerencia_metodo: s?.metodo ?? null,
      });
    }
    return [...grupos.values()].sort((a, b) => b.personas - a.personas);
  },
  async resolverUbicacion(personaId, puestoId) {
    await espera(200);
    if (yo().rol !== 'admin') throw new Error('Solo un administrador puede resolver ubicaciones');
    const p = personas.find((x) => x.id === personaId)!;
    const puesto = PUESTOS.find((x) => x.id === puestoId)!;
    const nombre = normalizar(p.puestoReportado ?? '');
    alias.set(`${puesto.localidad_id}|${nombre}`, puestoId);
    let n = 0;
    for (const x of personas) {
      if (x.eliminada || estado(x) !== 'por_revisar' || normalizar(x.puestoReportado ?? '') !== nombre) continue;
      if (x.localidadId != null && x.localidadId !== puesto.localidad_id) continue;
      x.puestoId = puestoId; x.localidadId = puesto.localidad_id; n++;
      if (x.mesa && x.mesa > (puesto.mesas_total ?? 0)) x.mesa = null;
    }
    return n;
  },

  async crearImportacion(d) {
    await espera();
    const id = `imp-${importaciones.size + 1}`;
    importaciones.set(id, {
      imp: { id, estado: 'cargando', total_filas: 0, filas_validas: 0, filas_con_errores: 0, filas_duplicadas: 0, filas_importadas: 0 },
      filas: [], liderId: d.liderId,
    });
    return id;
  },
  async cargarFilas(id, filas, progreso) {
    const i = importaciones.get(id)!;
    for (let k = 0; k < filas.length; k += 500) {
      await espera(60);
      i.filas.push(...filas.slice(k, k + 500).map((f) => ({ ...f, estado: 'pendiente' as const, errores: [], advertencias: [] })));
      progreso?.(Math.min(k + 500, filas.length));
    }
  },
  async validarImportacion(id) {
    await espera(400);
    const i = importaciones.get(id)!;
    const vistas = new Set<string>();
    for (const f of i.filas) {
      f.errores = []; f.advertencias = [];
      const ced = (f.datos.cedula ?? '').replace(/[\s.,]/g, '');
      if (!/^\d{3,10}$/.test(ced)) f.errores.push(`cédula inválida: "${f.datos.cedula ?? ''}"`);
      if (!f.datos.nombres) f.errores.push('falta el nombre');
      if (!i.liderId && !f.datos.lider_cedula) f.errores.push('sin líder asignado');
      const loc = LOCALIDADES.find((l) => normalizar(l.nombre) === normalizar(f.datos.localidad ?? ''));
      if (f.datos.localidad && !loc) f.advertencias.push(`localidad no encontrada: "${f.datos.localidad}"`);
      if (loc && f.datos.puesto && !sugerir(loc.id, f.datos.puesto, '')?.confianza) f.advertencias.push(`puesto por revisar: "${f.datos.puesto}"`);
      if (f.datos.telefono && !/^\d{7,10}$/.test(f.datos.telefono.replace(/\D/g, '').replace(/^57(?=\d{10}$)/, ''))) f.advertencias.push(`teléfono inválido: "${f.datos.telefono}"`);
      if (f.errores.length) f.estado = 'con_errores';
      else if (vistas.has(ced) || personas.some((p) => !p.eliminada && p.cedula === ced)) {
        f.estado = 'duplicada'; f.errores.push(vistas.has(ced) ? 'cédula repetida en el mismo archivo' : 'ya existe en la base');
      } else f.estado = 'valida';
      vistas.add(ced);
    }
    const c = (e: string) => i.filas.filter((f) => f.estado === e).length;
    i.imp = { ...i.imp, estado: 'validada', total_filas: i.filas.length, filas_validas: c('valida'), filas_con_errores: c('con_errores'), filas_duplicadas: c('duplicada') };
    return i.imp;
  },
  async filasImportacion(id) { await espera(); return importaciones.get(id)!.filas; },
  async confirmarImportacion(id) {
    await espera(400);
    const i = importaciones.get(id)!;
    let n = 0;
    for (const f of i.filas.filter((x) => x.estado === 'valida')) {
      const loc = LOCALIDADES.find((l) => normalizar(l.nombre) === normalizar(f.datos.localidad ?? ''));
      const s = loc && f.datos.puesto ? sugerir(loc.id, f.datos.puesto, '') : null;
      personas.unshift({
        id: `p-${personas.length}`, liderId: i.liderId ?? lideres[0].id, cedula: f.datos.cedula.replace(/[\s.,]/g, ''),
        nombres: f.datos.nombres, apellidos: f.datos.apellidos ?? '', sexo: null, fechaNacimiento: null, edad: null, edadEn: null,
        telefono: f.datos.telefono ?? null, localidadId: loc?.id ?? null,
        puestoId: s?.confianza === 'alta' ? s.puesto_id : null, puestoReportado: s?.confianza === 'alta' ? null : f.datos.puesto ?? null,
        direccionReportada: null, mesa: f.datos.mesa ? Number(f.datos.mesa) : null, creadoEn: new Date().toISOString(), eliminada: false,
      });
      f.estado = 'importada'; n++;
    }
    i.imp = { ...i.imp, estado: 'confirmada', filas_importadas: n };
    return i.imp;
  },
  async cancelarImportacion(id) { await espera(); importaciones.get(id)!.imp.estado = 'cancelada'; },

  async elecciones() { await espera(60); return elecciones; },
  async crearEleccion(d) {
    await espera();
    if (yo().rol !== 'admin') throw new Error('No tienes permiso para hacer esto.');
    elecciones.unshift({ id: `e-${elecciones.length + 1}`, nombre: d.nombre, fecha: d.fecha, modo_digitacion: d.modo });
  },
  async avanceE14(id) {
    await espera(60);
    if (yo().rol === 'lider') return null;
    const ms = mesasCalc(id);
    const c = (e: EstadoMesa) => ms.filter((m) => m.estado === e).length;
    return { mesas: ms.length, pendientes: c('pendiente'), una_digitacion: c('una_digitacion'), en_revision: c('en_revision'), verificadas: c('verificado') };
  },
  async pendientesE14(id) {
    await espera();
    if (!['admin', 'digitador'].includes(yo().rol)) return [];
    const mias = new Set(digitaciones.filter((d) => d.eleccionId === id && d.por === yo().id).map((d) => d.mesaId));
    return mesasCalc(id)
      .filter((m) => (m.estado === 'pendiente' || m.estado === 'una_digitacion') && !mias.has(m.mesa_id))
      .map(({ mesa_id, localidad, puesto, mesa, estado }) => ({ mesa_id, localidad, puesto, mesa, estado }))
      .sort((a, b) => a.localidad.localeCompare(b.localidad) || a.puesto.localeCompare(b.puesto) || a.mesa - b.mesa);
  },
  async digitarE14(eleccionId, m, votos) {
    await espera(120);
    if (!['admin', 'digitador'].includes(yo().rol)) throw new Error('No tienes permiso para hacer esto.');
    if (digitaciones.some((d) => d.eleccionId === eleccionId && d.mesaId === m && d.por === yo().id)) throw new Error('Ya digitaste esta mesa.');
    digitaciones.push({ id: digitaciones.length + 1, eleccionId, mesaId: m, votos, por: yo().id, en: new Date().toISOString() });
    consolidar(eleccionId, m);
  },
  async misDigitaciones(id) {
    await espera();
    const ms = new Map(mesasCalc(id).map((m) => [m.mesa_id, m]));
    return digitaciones.filter((d) => d.eleccionId === id && d.por === yo().id).reverse().map((d) => {
      const m = ms.get(d.mesaId)!;
      return { id: d.id, mesa_id: d.mesaId, localidad: m.localidad, puesto: m.puesto, mesa: m.mesa, votos: d.votos, en: d.en, estado: m.estado };
    });
  },
  async corregirDigitacion(id, votos) {
    await espera();
    const d = digitaciones.find((x) => x.id === id && x.por === yo().id);
    if (!d) throw new Error('No tienes permiso para hacer esto.');
    d.votos = votos;
    consolidar(d.eleccionId, d.mesaId);
  },
  async revisionE14(id) {
    await espera();
    if (yo().rol !== 'admin') return [];
    return mesasCalc(id).filter((m) => m.estado === 'en_revision').map((m) => ({
      mesa_id: m.mesa_id, localidad: m.localidad, puesto: m.puesto, mesa: m.mesa,
      digitaciones: digitaciones.filter((d) => d.eleccionId === id && d.mesaId === m.mesa_id).map((d) => ({ votos: d.votos, por: nombreUsuario(d.por), en: d.en })),
    }));
  },
  async resolverE14(eleccionId, m, votos) {
    await espera();
    if (yo().rol !== 'admin') throw new Error('Solo un administrador puede resolver mesas');
    resultados.set(clave(eleccionId, m), { votos, estado: 'verificado', admin: true });
  },
  async resultadosE14(id) {
    await espera();
    if (!['admin', 'coordinador', 'candidato'].includes(yo().rol)) return { localidades: [], puestos: [], lideres: [] };
    const ms = mesasCalc(id);
    const localidades: LocalidadE14[] = sumar(ms, (f) => String(f.localidad_id)).map(({ f, ...t }) => ({ ...t, localidad_id: f.localidad_id, localidad: f.localidad }));
    const puestos: PuestoE14[] = sumar(ms, (f) => String(f.puesto_id)).map(({ f, ...t }) => ({ ...t, puesto_id: f.puesto_id, puesto: f.puesto, localidad_id: f.localidad_id, localidad: f.localidad }));
    // Reparto por residuo mayor entre los líderes de cada mesa
    const porLider = new Map<string, { esperados: number; esperadosVer: number; confirmados: number; pendientes: number }>();
    for (const m of ms) {
      const entradas = [...m.porLider.entries()];
      let reparto = new Map<string, number>();
      if (m.confirmados != null) {
        const cuotas = entradas.map(([l, e]) => ({ l, e, q: (m.confirmados! * e) / m.esperados }));
        const pisos = cuotas.map((c) => ({ ...c, p: Math.floor(c.q), r: c.q - Math.floor(c.q) }));
        let sobran = m.confirmados - pisos.reduce((s, c) => s + c.p, 0);
        pisos.sort((a, b) => b.r - a.r || b.e - a.e || a.l.localeCompare(b.l));
        reparto = new Map(pisos.map((c) => [c.l, c.p + (sobran-- > 0 ? 1 : 0)]));
      }
      for (const [l, e] of entradas) {
        const t = porLider.get(l) ?? { esperados: 0, esperadosVer: 0, confirmados: 0, pendientes: 0 };
        t.esperados += e;
        if (m.estado === 'verificado') { t.esperadosVer += e; t.confirmados += reparto.get(l) ?? 0; } else t.pendientes++;
        porLider.set(l, t);
      }
    }
    const visibles = new Set(yo().rol === 'candidato' ? lideres.map((l) => l.id) : misLideres().map((l) => l.id));
    const ls: LiderE14[] = [...porLider.entries()].filter(([l]) => visibles.has(l)).map(([l, t]) => ({
      lider_id: l, nombre: lideres.find((x) => x.id === l)?.nombre ?? '', esperados: t.esperados,
      esperados_verificados: t.esperadosVer || null, confirmados: t.confirmados, mesas_pendientes: t.pendientes,
      cumplimiento: t.esperadosVer ? Math.round((1000 * t.confirmados) / t.esperadosVer) / 10 : null,
    }));
    return { localidades, puestos, lideres: ls };
  },
  async mesasE14(id, puestoId): Promise<MesaE14[]> {
    await espera();
    return mesasCalc(id).filter((m) => m.puesto_id === puestoId).sort((a, b) => a.mesa - b.mesa)
      .map(({ mesa_id, mesa, puesto_id, estado, esperados, votos_reales, confirmados, faltantes, adicionales }) =>
        ({ mesa_id, mesa, puesto_id, estado, esperados, votos_reales, confirmados, faltantes, adicionales }));
  },

  async plantillaE14(id) {
    await espera();
    if (!['admin', 'digitador'].includes(yo().rol)) return [];
    return mesasCalc(id).filter((m) => m.esperados > 0).map((m) => ({
      localidad: m.localidad, zona: CODIGOS.get(m.puesto_id)!.zona, codigo_puesto: CODIGOS.get(m.puesto_id)!.codigo, puesto: m.puesto, mesa: m.mesa,
    })).sort((a, b) => a.localidad.localeCompare(b.localidad) || a.puesto.localeCompare(b.puesto) || a.mesa - b.mesa);
  },
  async puestosConCodigos(): Promise<PuestoCodigos[]> {
    await espera();
    return PUESTOS.map((p) => ({ id: p.id, localidad: LOCALIDADES.find((l) => l.id === p.localidad_id)!.nombre, zona: CODIGOS.get(p.id)!.zona,
      codigo: CODIGOS.get(p.id)!.codigo, nombre: p.nombre, direccion: p.direccion, mesas_total: p.mesas_total ?? 0 }));
  },
  async importarE14(eleccionId, archivo, filas, confirmar) {
    await espera(300);
    if (!['admin', 'digitador'].includes(yo().rol)) throw new Error('Solo administradores y digitadores pueden subir E14');
    const vistas = new Set<number>();
    const salida: ResultadoFilaE14[] = [];
    for (const r of filas) {
      const fila = Number(r.fila);
      const txt = String(r.votos ?? '').replace(/[\s.,]/g, '');
      if (!txt) { salida.push({ fila, estado: 'vacia', mensaje: 'sin votos (se ignora)', mesa_id: null, votos: null }); continue; }
      if (!/^\d{1,4}$/.test(txt) || Number(txt) > 1000) { salida.push({ fila, estado: 'error', mensaje: `votos inválidos: "${r.votos}"`, mesa_id: null, votos: null }); continue; }
      const votos = Number(txt);
      const zona = codigoOficial(String(r.zona ?? '')), cod = codigoOficial(String(r.codigo_puesto ?? ''));
      let puesto = zona && cod
        ? PUESTOS.find((p) => codigoOficial(CODIGOS.get(p.id)!.zona) === zona && codigoOficial(CODIGOS.get(p.id)!.codigo) === cod)
        : undefined;
      if (puesto && normalizar(String(r.puesto ?? '')) && normalizar(String(r.puesto)) !== normalizar(puesto.nombre)) {
        salida.push({ fila, estado: 'error', mensaje: `el código ${zona}-${cod} es "${puesto.nombre}", no "${r.puesto}": revisa la fila`, mesa_id: null, votos }); continue;
      }
      if (!puesto) {
        const loc = LOCALIDADES.find((l) => normalizar(l.nombre) === normalizar(String(r.localidad ?? '')));
        if (!loc) { salida.push({ fila, estado: 'error', mensaje: `localidad no encontrada: "${r.localidad ?? ''}"`, mesa_id: null, votos }); continue; }
        puesto = PUESTOS.find((p) => p.localidad_id === loc.id && normalizar(p.nombre) === normalizar(String(r.puesto ?? '')));
        if (!puesto) { salida.push({ fila, estado: 'error', mensaje: `puesto no encontrado en ${r.localidad}: "${r.puesto ?? ''}"`, mesa_id: null, votos }); continue; }
      }
      const num = Number(String(r.mesa ?? '').replace(/\D/g, ''));
      if (!num || num > (puesto.mesas_total ?? 0)) { salida.push({ fila, estado: 'error', mensaje: `la mesa ${r.mesa} no existe en ese puesto`, mesa_id: null, votos }); continue; }
      const m = mesaId(puesto.id, num);
      if (vistas.has(m)) { salida.push({ fila, estado: 'error', mensaje: 'mesa repetida en el archivo', mesa_id: m, votos }); continue; }
      vistas.add(m);
      const previa = digitaciones.find((d) => d.eleccionId === eleccionId && d.mesaId === m && d.por === yo().id);
      if (confirmar) {
        if (previa) { if (previa.votos !== votos) { previa.votos = votos; consolidar(eleccionId, m); } }
        else { digitaciones.push({ id: digitaciones.length + 1, eleccionId, mesaId: m, votos, por: yo().id, en: new Date().toISOString() }); consolidar(eleccionId, m); }
      }
      salida.push({ fila, mesa_id: m, votos, ...(previa == null ? { estado: 'nueva', mensaje: null }
        : previa.votos === votos && !confirmar ? { estado: 'sin_cambios', mensaje: 'ya la habías registrado con el mismo valor' }
        : previa.votos === votos ? { estado: 'sin_cambios', mensaje: 'ya la habías registrado con el mismo valor' }
        : { estado: 'cambia', mensaje: `reemplaza tu valor anterior (${previa.votos})` }) } as ResultadoFilaE14);
      void archivo;
    }
    return salida;
  },
  async registrosMesa(): Promise<RegistrosMesa[]> {
    await espera();
    if (!['admin', 'coordinador', 'candidato'].includes(yo().rol)) return [];
    const m = new Map<number, RegistrosMesa>();
    for (const p of personas) {
      if (p.eliminada || !p.puestoId || !p.mesa) continue;
      const puesto = PUESTOS.find((x) => x.id === p.puestoId)!;
      const loc = LOCALIDADES.find((l) => l.id === puesto.localidad_id)!;
      const id = mesaId(puesto.id, p.mesa);
      const f = m.get(id) ?? { localidad_id: loc.id, localidad: loc.nombre, puesto_id: puesto.id, puesto: puesto.nombre, mesa_id: id, mesa: p.mesa, personas: 0 };
      f.personas++; m.set(id, f);
    }
    return [...m.values()];
  },
  async calidadLideres(): Promise<CalidadLider[]> {
    await espera();
    const ls = yo().rol === 'candidato' ? lideres : misLideres();
    return ls.map((l) => {
      const ps = personas.filter((p) => !p.eliminada && p.liderId === l.id);
      const c = (f: (p: PersonaDemo) => boolean) => ps.filter(f).length;
      return {
        lider_id: l.id, nombre: l.nombre, meta_votos: l.meta_votos, total: ps.length,
        ubicados: c((p) => estado(p) === 'completa'), sin_mesa: c((p) => estado(p) === 'sin_mesa'),
        por_revisar: c((p) => estado(p) === 'por_revisar'), sin_lugar: c((p) => estado(p) === 'sin_dato'),
        sin_sexo: c((p) => !p.sexo), sin_edad: c((p) => !p.fechaNacimiento && p.edad == null), sin_telefono: c((p) => !p.telefono),
        sin_consentimiento: 0, importados: 0, ultimo_registro: ps.map((p) => p.creadoEn).sort().pop() ?? null,
      };
    });
  },
  async registrarExportacion(tipo, filas) { await espera(30); exportaciones.push({ tipo, filas, en: new Date().toISOString(), usuario: yo().nombre }); },

  async equipo() { await espera(); return yo().rol === 'admin' ? usuarios : []; },
  async vincularUsuario(email, nombre, rol, liderId) {
    await espera(200);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Correo inválido');
    const existente = usuarios.find((u) => u.email === email.trim().toLowerCase());
    if (existente?.id === yo().id) throw new Error('No puedes cambiar tu propio rol');
    const u = existente ?? { ...miembro(`u-${usuarios.length + 1}`, nombre, rol, email.trim().toLowerCase(), false) };
    Object.assign(u, { nombre, rol, activo: true });
    if (!existente) usuarios.push(u);
    if (rol === 'lider') {
      const ficha = liderId ? lideres.find((l) => l.id === liderId) : undefined;
      if (ficha) ficha.perfil_id = u.id;
      else if (!lideres.some((l) => l.perfil_id === u.id)) lideres.push({ id: `l-${lideres.length + 1}`, nombre, cedula: null, telefono: null, meta_votos: 0, coordinador_id: null, perfil_id: u.id });
    }
  },
  async desactivarUsuario(id) {
    await espera();
    if (id === yo().id) throw new Error('No puedes desactivarte a ti mismo');
    usuarios.find((u) => u.id === id)!.activo = false;
  },
  async reactivarUsuario(id) { await espera(); usuarios.find((u) => u.id === id)!.activo = true; },
  async cambiarRol(id, rol) {
    await espera();
    if (id === yo().id) throw new Error('No puedes cambiar tu propio rol');
    const u = usuarios.find((x) => x.id === id)!;
    u.rol = rol;
    if (rol !== 'lider') for (const l of lideres) if (l.perfil_id === id) l.perfil_id = null;
  },
  async invitarUsuario(d) {
    await api.vincularUsuario(d.email, d.nombre, d.rol, d.liderId);
    const u = usuarios.find((x) => x.email === d.email.trim().toLowerCase())!;
    u.lider_id = lideres.find((l) => l.perfil_id === u.id)?.id ?? null;
    return `Invitación enviada a ${u.email} (en la demostración no sale ningún correo).`;
  },
  async reenviarAcceso(id) {
    await espera();
    const u = usuarios.find((x) => x.id === id)!;
    return `Reenviamos el acceso a ${u.email} (en la demostración no sale ningún correo).`;
  },

  async opcionesVerComo() {
    await espera();
    if (actual?.usuario.rol !== 'admin') return [];
    return usuarios.filter((u) => u.activo && u.id !== actual!.usuario.id)
      .map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol, lider_id: lideres.find((l) => l.perfil_id === u.id)?.id ?? null }));
  },
  async usarVistaComo(objetivo) {
    await espera(30);
    vistaLider = null;
    if (!objetivo) { vista = null; return; }
    if (actual?.usuario.rol !== 'admin') throw new Error('Solo un administrador puede usar "Ver como"');
    if (objetivo.startsWith('lider:')) {
      const l = lideres.find((x) => x.id === objetivo.slice(6));
      if (!l) throw new Error('Ese líder no es de tu organización');
      vista = { ...miembro('vista-lider', l.nombre, 'lider', ''), id: 'vista-lider' };
      vistaLider = l.id;
      return;
    }
    if (objetivo.startsWith('rol:')) {
      const rol = objetivo.slice(4) as Rol;
      vista = { ...miembro('vista', `Vista de ${rol}`, rol, ''), id: 'vista-rol' };
    } else {
      const u = usuarios.find((x) => x.id === objetivo);
      if (!u) throw new Error('Esa persona no es de tu organización');
      vista = u;
    }
  },

  async registrarContacto(personaId, resultado) {
    await espera(80); soloLectura();
    if (!['admin', 'coordinador', 'lider'].includes(yo().rol)) throw new Error('Tu rol no puede registrar contactos');
    const p = visibles().find((x) => x.id === personaId);
    if (!p) throw new Error('Esa persona no está en tu lista');
    p.contactosN = (p.contactosN ?? 0) + 1;
    if (resultado !== 'no_contesta') p.compromiso = resultado;
    setTimeout(() => oyentesDatos.forEach((f) => f('registros')), 0);
  },
  async seguimientoLideres() {
    await espera();
    const ls = yo().rol === 'candidato' ? lideres : misLideres();
    return ls.map((l) => {
      const ps = personas.filter((p) => !p.eliminada && p.liderId === l.id);
      const c = (k: Compromiso) => ps.filter((p) => (p.compromiso ?? 'sin_contactar') === k).length;
      return { lider_id: l.id, nombre: l.nombre, total: ps.length, sin_contactar: c('sin_contactar'), confirmados: c('confirmado'), dudosos: c('dudoso'),
        no_apoya: c('no_apoya'), numero_errado: c('numero_errado'), contactados: ps.filter((p) => (p.contactosN ?? 0) > 0).length };
    });
  },
  async votosMarcados(eleccionId) {
    await espera(60);
    const ids = new Set(visibles().map((p) => p.id));
    return new Set([...(votos.get(eleccionId) ?? [])].filter((x) => ids.has(x)));
  },
  async marcarVoto(eleccionId, personaId, voto) {
    await espera(60); soloLectura();
    if (!['admin', 'coordinador', 'lider'].includes(yo().rol)) throw new Error('Tu rol no puede marcar votos');
    if (!visibles().some((p) => p.id === personaId)) throw new Error('Esa persona no está en tu lista');
    const s = votos.get(eleccionId) ?? new Set<string>();
    if (voto) s.add(personaId); else s.delete(personaId);
    votos.set(eleccionId, s);
    setTimeout(() => oyentesDatos.forEach((f) => f('registros')), 0);
  },
  async diaD(eleccionId) {
    await espera();
    const base = yo().rol === 'candidato' ? personas.filter((p) => !p.eliminada) : visibles();
    const s = votos.get(eleccionId) ?? new Set<string>();
    const m = new Map<string, { lider_id: string; lider: string; localidad_id: number | null; localidad: string; personas: number; votaron: number }>();
    for (const p of base) {
      const puesto = PUESTOS.find((x) => x.id === p.puestoId);
      const loc = puesto ? LOCALIDADES.find((l) => l.id === puesto.localidad_id) : undefined;
      const k = `${p.liderId}|${loc?.id ?? ''}`;
      const f = m.get(k) ?? { lider_id: p.liderId, lider: lideres.find((l) => l.id === p.liderId)?.nombre ?? '', localidad_id: loc?.id ?? null, localidad: loc?.nombre ?? 'Sin lugar de votación', personas: 0, votaron: 0 };
      f.personas++; if (s.has(p.id)) f.votaron++;
      m.set(k, f);
    }
    return [...m.values()];
  },
  async testigos(eleccionId) {
    await espera();
    if (!['admin', 'coordinador'].includes(yo().rol)) return [];
    return testigosDemo.filter((t) => t.eleccion === eleccionId).map((t) => {
      const p = personas.find((x) => x.id === t.persona_id)!;
      const pu = PUESTOS.find((x) => x.id === t.puesto_id)!;
      return { id: t.id, persona_id: p.id, nombres: p.nombres, apellidos: p.apellidos, cedula: p.cedula, telefono: p.telefono, puesto_id: pu.id, puesto: pu.nombre,
        localidad: LOCALIDADES.find((l) => l.id === pu.localidad_id)?.nombre ?? '', mesas: t.mesas, lider: lideres.find((l) => l.id === p.liderId)?.nombre ?? null } as Testigo;
    });
  },
  async coberturaTestigos(eleccionId) {
    await espera();
    const m = new Map<string, { localidad_id: number; localidad: string; puesto_id: number; puesto: string; mesa: number; simpatizantes: number; cubierta: boolean }>();
    for (const p of personas) {
      if (p.eliminada || !p.puestoId || !p.mesa) continue;
      const pu = PUESTOS.find((x) => x.id === p.puestoId)!;
      const k = `${pu.id}|${p.mesa}`;
      const loc = LOCALIDADES.find((l) => l.id === pu.localidad_id)!;
      const f = m.get(k) ?? { localidad_id: loc.id, localidad: loc.nombre, puesto_id: pu.id, puesto: pu.nombre, mesa: p.mesa, simpatizantes: 0, cubierta: false };
      f.simpatizantes++;
      f.cubierta = testigosDemo.some((t) => t.eleccion === eleccionId && t.puesto_id === pu.id && (t.mesas.length === 0 || t.mesas.includes(p.mesa!)));
      m.set(k, f);
    }
    return [...m.values()];
  },
  async asignarTestigo(eleccionId, personaId, puestoId, mesas) {
    await espera(); soloLectura();
    if (!['admin', 'coordinador'].includes(yo().rol)) throw new Error('Solo administradores y coordinadores asignan testigos');
    const p = visibles().find((x) => x.id === personaId);
    if (!p) throw new Error('Esa persona no está registrada o no es de tus líderes');
    if (!p.telefono) throw new Error('El testigo necesita un celular para coordinarlo el día de la elección');
    const pu = PUESTOS.find((x) => x.id === puestoId);
    if (!pu) throw new Error('Puesto no encontrado');
    if (mesas.some((m) => m < 1 || m > (pu.mesas_total ?? 0))) throw new Error(`Ese puesto tiene mesas de la 1 a la ${pu.mesas_total}`);
    const previo = testigosDemo.find((t) => t.eleccion === eleccionId && t.persona_id === personaId);
    if (previo) Object.assign(previo, { puesto_id: puestoId, mesas: [...new Set(mesas)].sort((a, b) => a - b) });
    else testigosDemo.push({ id: testigosDemo.length + 1, eleccion: eleccionId, persona_id: personaId, puesto_id: puestoId, mesas: [...new Set(mesas)].sort((a, b) => a - b) });
  },
  async quitarTestigo(id) {
    await espera(); soloLectura();
    const i = testigosDemo.findIndex((t) => t.id === id);
    if (i < 0) throw new Error('Testigo no encontrado');
    testigosDemo.splice(i, 1);
  },
  async alertasCalidad() {
    await espera();
    if (!['admin', 'coordinador'].includes(yo().rol)) return [];
    const ps = visibles();
    const grupos = new Map<string, PersonaDemo[]>();
    for (const p of ps) if (p.telefono) grupos.set(p.telefono, [...(grupos.get(p.telefono) ?? []), p]);
    const nombreLider = (g: PersonaDemo[]) => [...new Set(g.map((p) => lideres.find((l) => l.id === p.liderId)?.nombre ?? ''))].join(', ');
    const salida = [...grupos.entries()].filter(([, g]) => g.length >= 2).map(([tel, g]) => ({
      tipo: 'celular_repetido' as const, titulo: `El celular ${tel} está en ${g.length} personas`, lideres: nombreLider(g), personas: g.length, persona_ids: g.map((p) => p.id) }));
    const nombres = new Map<string, PersonaDemo[]>();
    for (const p of ps) if (p.puestoId) { const k = `${p.puestoId}|${normalizar(`${p.nombres} ${p.apellidos}`)}`; nombres.set(k, [...(nombres.get(k) ?? []), p]); }
    for (const [k, g] of nombres) if (g.length >= 2) salida.push({ tipo: 'nombre_repetido' as never, titulo: `Mismo nombre en ${PUESTOS.find((x) => x.id === Number(k.split('|')[0]))?.nombre}: ${g[0].nombres} ${g[0].apellidos}`, lideres: nombreLider(g), personas: g.length, persona_ids: g.map((p) => p.id) });
    return salida.sort((a, b) => b.personas - a.personas);
  },
  async personasPorIds(ids) {
    await espera(60);
    const s = new Set(ids);
    return visibles().filter((p) => s.has(p.id)).map(aFila);
  },

  alCambiarDatos(cb, alConectar) {
    oyentesDatos.add(cb);
    setTimeout(() => alConectar?.(true), 0);
    return () => { oyentesDatos.delete(cb); };
  },

  async enlaceLider(liderId) {
    await espera();
    const l = misLideres().find((x) => x.id === liderId);
    if (!l) throw new Error('Sin acceso a ese líder');
    if (!l.token && !vista) { l.token = tokenDemo(l.id); l.enlaceActivo = true; }
    return { token: l.token ?? null, activo: l.enlaceActivo ?? true, registros_enlace: personas.filter((p) => p.liderId === l.id && p.origen === 'formulario').length };
  },
  async configurarEnlace(liderId, activo, regenerar) {
    await espera(); soloLectura();
    const l = misLideres().find((x) => x.id === liderId);
    if (!l) throw new Error('Sin acceso a ese líder');
    l.enlaceActivo = activo;
    if (regenerar || !l.token) l.token = `demo${Math.random().toString(36).slice(2, 14)}`;
  },
  async enlaceInfo(token) {
    await espera();
    const l = lideres.find((x) => (x.token ?? tokenDemo(x.id)) === token && x.enlaceActivo !== false);
    return l ? { lider: l.nombre, campana: 'Campaña de demostración', slug: 'demo' } : null;
  },
  async registrarPorEnlace(token, d) {
    await espera(200);
    const l = lideres.find((x) => (x.token ?? tokenDemo(x.id)) === token && x.enlaceActivo !== false);
    if (!l) throw new Error('Este enlace ya no está activo. Pídele uno nuevo a quien te lo envió.');
    if (!d.acepta) throw new Error('Para registrarte debes aceptar el tratamiento de tus datos.');
    const ced = d.cedula.replace(/\D/g, '');
    if (!/^\d{5,10}$/.test(ced)) throw new Error('Revisa la cédula: solo números, entre 5 y 10 dígitos.');
    if (!/^3\d{9}$/.test(d.telefono.replace(/\D/g, ''))) throw new Error('El celular debe tener 10 dígitos y empezar por 3');
    if (personas.some((p) => p.cedula === ced)) return;
    personas.push({
      id: `p-${personas.length + 1}`, cedula: ced, nombres: d.nombres.trim(), apellidos: d.apellidos.trim(), sexo: (d.sexo || null) as Sexo | null,
      fechaNacimiento: d.fecha_nacimiento || null, edad: d.fecha_nacimiento ? null : Number(d.edad) || null, edadEn: d.fecha_nacimiento ? null : hoyISO(),
      telefono: d.telefono.replace(/\D/g, '') || null, liderId: l.id, localidadId: d.localidad_id, puestoId: d.puesto_id,
      puestoReportado: d.puesto_id ? null : d.puesto_reportado || null, direccionReportada: d.puesto_id ? null : d.direccion_reportada || null,
      mesa: d.mesa ? Number(d.mesa) : null, creadoEn: new Date().toISOString(), eliminada: false, origen: 'formulario',
    });
  },
  // ── Protección de datos (demostración) ─────────────────────────────
  async politica(slug) {
    await espera(80);
    return slug === 'demo' ? { ...politicaDemo } : null;
  },
  async miPolitica() { await espera(80); return { ...politicaDemo, slug: 'demo' }; },
  async configurarPolitica(d) {
    await espera(); soloLectura();
    if (yo().rol !== 'admin') throw new Error('Solo un administrador puede cambiar estos datos');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo.trim())) throw new Error('Escribe un correo válido para que los titulares puedan escribir');
    Object.assign(politicaDemo, { responsable: d.responsable || politicaDemo.campana, documento: d.documento || null, correo: d.correo.trim().toLowerCase(),
      telefono: d.telefono || null, direccion: d.direccion || null, actualizada: hoyISO() });
  },
  async solicitarDatos(slug, d) {
    await espera(200);
    if (slug !== 'demo') throw new Error('No encontramos esta campaña.');
    const ced = d.cedula.replace(/\D/g, '');
    if (!/^\d{5,10}$/.test(ced)) throw new Error('Revisa la cédula: solo números, entre 5 y 10 dígitos.');
    if (d.nombre.trim().length < 3) throw new Error('Escribe tu nombre completo.');
    if (d.contacto.trim().length < 7) throw new Error('Escribe un celular o correo para responderte.');
    const radicado = Math.random().toString(16).slice(2, 10).toUpperCase();
    solicitudesDemo.unshift({ id: `s-${solicitudesDemo.length + 1}`, radicado, tipo: d.tipo, cedula: ced, nombre: d.nombre.trim(), contacto: d.contacto.trim(),
      detalle: d.detalle.trim() || null, estado: 'pendiente', respuesta: null, personas_suprimidas: null, creado_en: new Date().toISOString(),
      vence_en: habiles(d.tipo === 'consulta' ? 10 : 15), atendida_en: null });
    return radicado;
  },
  async solicitudesDatos() {
    await espera();
    if (!sembradas) {
      sembradas = true;
      const p = personas[7];
      solicitudesDemo.push({ id: 's-ejemplo', radicado: 'A1B2C3D4', tipo: 'supresion', cedula: p.cedula, nombre: `${p.nombres} ${p.apellidos}`,
        contacto: p.telefono ?? '3000000000', detalle: 'Ya no quiero que me llamen.', estado: 'pendiente', respuesta: null, personas_suprimidas: null,
        creado_en: new Date(Date.now() - 9 * 86_400_000).toISOString(), vence_en: habiles(5), atendida_en: null });
    }
    return yo().rol === 'admin' ? solicitudesDemo.map((x) => ({ ...x })) : [];
  },
  async datosDelTitular(id) {
    await espera();
    const s = solicitudesDemo.find((x) => x.id === id);
    if (!s || yo().rol !== 'admin') return [];
    return personas.filter((p) => p.cedula === s.cedula).map((p) => ({
      persona_id: p.id, nombres: p.nombres, apellidos: p.apellidos, telefono: p.telefono, lider: lideres.find((l) => l.id === p.liderId)?.nombre ?? '',
      puesto: PUESTOS.find((x) => x.id === p.puestoId)?.nombre ?? null, origen: p.origen ?? 'manual', creado_en: p.creadoEn,
      autorizacion_en: p.creadoEn, autorizacion_canal: p.origen === 'importacion' ? 'importacion' : 'presencial', eliminado: p.eliminada,
    }));
  },
  async atenderSolicitud(id, estado, respuesta, suprimir) {
    await espera(); soloLectura();
    if (yo().rol !== 'admin') throw new Error('Solo un administrador atiende solicitudes');
    const s = solicitudesDemo.find((x) => x.id === id)!;
    if (s.estado !== 'pendiente') throw new Error('Esta solicitud ya fue atendida');
    if (respuesta.trim().length < 10) throw new Error('Escribe la respuesta que se le dio al titular (mínimo 10 caracteres).');
    if (suprimir && (estado !== 'atendida' || !['supresion', 'revocatoria'].includes(s.tipo))) throw new Error('Solo se suprimen datos en solicitudes de supresión o revocatoria atendidas');
    let n = 0;
    if (suprimir) {
      for (const p of personas.filter((x) => x.cedula === s.cedula)) {
        Object.assign(p, { nombres: 'Titular', apellidos: 'suprimido', telefono: null, cedula: `0${Math.floor(Math.random() * 1e9)}`, eliminada: true });
        n++;
      }
      accionesDemo.unshift({ id: Date.now(), en: new Date().toISOString(), accion: 'SUPRESION', tabla: 'solicitudes_datos', registro_id: s.radicado,
        detalle: { tipo: 'supresion', radicado: s.radicado, personas: n }, usuario: yo().nombre });
    }
    Object.assign(s, { estado, respuesta: respuesta.trim(), atendida_en: new Date().toISOString(), personas_suprimidas: suprimir ? n : null });
    return n;
  },
  async accionesSensibles() {
    await espera();
    if (yo().rol !== 'admin') return [];
    const exp = exportaciones.map((e, i) => ({ id: -i - 1, en: e.en ?? new Date().toISOString(), accion: 'EXPORT' as const, tabla: 'exportacion',
      registro_id: e.tipo, detalle: { tipo: e.tipo, filas: e.filas }, usuario: e.usuario ?? 'Admin Demo' }));
    return [...accionesDemo, ...exp].sort((a, b) => b.en.localeCompare(a.en));
  },

  // ── Verificación en dos pasos (demostración: cualquier código de 6 dígitos sirve) ──
  async factoresDosPasos() { await espera(60); return factoresDemo.map((f) => ({ ...f })); },
  async inscribirDosPasos() {
    await espera();
    for (let i = factoresDemo.length - 1; i >= 0; i--) if (!factoresDemo[i].verificado) factoresDemo.splice(i, 1);
    const secreto = 'DEMO' + Math.random().toString(36).slice(2, 14).toUpperCase();
    const f = { id: `f-${Date.now()}`, nombre: `Celular ${factoresDemo.length + 1}`, verificado: false, creado: new Date().toISOString() };
    factoresDemo.push(f);
    const qr = await QRCode.toDataURL(`otpauth://totp/NexoT:demo?secret=${secreto}&issuer=NexoT`, { margin: 1, width: 220 });
    return { factorId: f.id, qr, secreto };
  },
  async confirmarDosPasos(factorId, codigo) {
    await espera();
    if (!/^\d{6}$/.test(codigo.replace(/\D/g, ''))) throw new Error('El código no es correcto o ya cambió. Escribe el que aparece ahora en la app.');
    factoresDemo.find((f) => f.id === factorId)!.verificado = true;
  },
  async quitarDosPasos(factorId) {
    await espera();
    const i = factoresDemo.findIndex((f) => f.id === factorId);
    if (i >= 0) factoresDemo.splice(i, 1);
  },
  async verificarCodigo(codigo) {
    await espera();
    if (!/^\d{6}$/.test(codigo.replace(/\D/g, ''))) throw new Error('El código no es correcto o ya cambió. Escribe el que aparece ahora en la app.');
  },
  async equipoDosPasos() {
    await espera(60);
    return Object.fromEntries(usuarios.map((u) => [u.id, u.id === actual?.usuario.id && factoresDemo.some((f) => f.verificado)]));
  },
  async historicos() {
    await espera(80);
    if (!['admin', 'coordinador', 'candidato'].includes(yo().rol)) return [];
    sembrarHistorico();
    return historicosDemo.map((x) => ({ ...x.h }));
  },
  async potencial(id) {
    await espera();
    const x = historicosDemo.find((y) => y.h.id === id);
    if (!x) return [];
    const hoy = new Map<number, { s: number; c: number }>();
    for (const p of visibles()) {
      if (!p.puestoId) continue;
      const v = hoy.get(p.puestoId) ?? { s: 0, c: 0 };
      v.s++; if (p.compromiso === 'confirmado') v.c++;
      hoy.set(p.puestoId, v);
    }
    const ids = new Set([...x.puestos.keys(), ...hoy.keys()]);
    return [...ids].map((pid) => {
      const pu = PUESTOS.find((q) => q.id === pid)!;
      const loc = LOCALIDADES.find((l) => l.id === pu.localidad_id)!;
      const hp = x.puestos.get(pid);
      return { historico_id: id, localidad_id: loc.id, localidad: loc.nombre, puesto_id: pid, puesto: pu.nombre, habilitados: CENSO.find((c) => c.id === pid)?.censo_total ?? null,
        votos_antes: hp?.votos ?? 0, validos_antes: hp?.validos ?? null, simpatizantes: hoy.get(pid)?.s ?? 0, confirmados: hoy.get(pid)?.c ?? 0 } as PotencialPuesto;
    });
  },
  async importarHistorico(nombre, anio, filas, confirmar) {
    await espera(300);
    if (yo().rol !== 'admin') throw new Error('Solo un administrador carga resultados históricos');
    if (!nombre.trim()) throw new Error('Ponle un nombre a la carga (por ejemplo: Senado 2022)');
    const puestos = new Map<number, { votos: number; validos: number }>();
    const r: FilaHistoricoResultado[] = filas.map((f, i) => {
      const fila = Number(f.fila ?? i + 2);
      const votos = Number(String(f.votos ?? '').replace(/[\s.,]/g, ''));
      if (!String(f.votos ?? '').trim()) return { fila, estado: 'vacia', mensaje: 'sin votos (se ignora)', puesto_id: null, votos: null };
      if (!Number.isFinite(votos)) return { fila, estado: 'error', mensaje: `votos inválidos: "${f.votos}"`, puesto_id: null, votos: null };
      const pu = PUESTOS.find((q) => normalizar(q.nombre) === normalizar(f.puesto ?? ''));
      if (!pu) return { fila, estado: 'error', mensaje: `puesto no encontrado: "${f.puesto ?? ''}" en "${f.localidad ?? ''}"`, puesto_id: null, votos };
      const v = puestos.get(pu.id) ?? { votos: 0, validos: 0 };
      v.votos += votos; v.validos += Number(String(f.validos ?? '').replace(/[\s.,]/g, '')) || 0;
      puestos.set(pu.id, v);
      return { fila, estado: 'ok', mensaje: null, puesto_id: pu.id, votos };
    });
    if (confirmar) {
      const votos = [...puestos.values()].reduce((a, x) => a + x.votos, 0);
      const i = historicosDemo.findIndex((x) => x.h.nombre === nombre.trim());
      const h = { id: i >= 0 ? historicosDemo[i].h.id : `h-${Date.now()}`, nombre: nombre.trim(), anio, cargado_en: new Date().toISOString(), puestos: puestos.size, votos, validos: null };
      if (i >= 0) historicosDemo[i] = { h, puestos }; else historicosDemo.unshift({ h, puestos });
    }
    return r;
  },
  async eliminarHistorico(id) {
    await espera();
    const i = historicosDemo.findIndex((x) => x.h.id === id);
    if (i >= 0) historicosDemo.splice(i, 1);
  },
  async metasLideres() {
    await espera();
    const u = yo();
    const ls = u.rol === 'candidato' ? lideres : misLideres();
    const f = await api.fechasMeta();
    const semana = Date.now() - 7 * 86_400_000, dos = Date.now() - 14 * 86_400_000;
    return ls.map((l) => {
      const ps = personas.filter((p) => p.liderId === l.id && !p.eliminada);
      const n = ps.length, meta = l.meta_votos;
      const esperado = meta > 0 && f.esperado != null ? Math.ceil(meta * f.esperado) : null;
      const semaforo: Semaforo = meta === 0 ? 'sin_meta' : n >= meta ? 'cumplida'
        : esperado != null ? (n >= meta * f.esperado! ? 'verde' : n >= 0.7 * meta * f.esperado! ? 'amarillo' : 'rojo')
        : (n >= 0.75 * meta ? 'verde' : n >= 0.4 * meta ? 'amarillo' : 'rojo');
      const t = (p: PersonaDemo) => new Date(p.creadoEn).getTime();
      return {
        lider_id: l.id, nombre: l.nombre, meta, coordinador: usuarios.find((x) => x.id === l.coordinador_id)?.nombre ?? '',
        registrados: n, confirmados: ps.filter((p) => p.compromiso === 'confirmado').length,
        esta_semana: ps.filter((p) => t(p) >= semana).length, semana_anterior: ps.filter((p) => t(p) >= dos && t(p) < semana).length,
        ultimo_registro: ps.reduce<string | null>((a, p) => (!a || p.creadoEn > a ? p.creadoEn : a), null), esperado_hoy: esperado, semaforo,
      } as MetaLider;
    });
  },
  async fechasMeta() {
    await espera(40);
    if (!fechasDemo.inicio || !fechasDemo.fin) return { ...fechasDemo, esperado: null };
    const ini = new Date(fechasDemo.inicio).getTime(), fin = new Date(fechasDemo.fin).getTime();
    return { ...fechasDemo, esperado: Math.min(1, Math.max(0, (Date.now() - ini) / (fin - ini))) };
  },
  async configurarFechasMeta(inicio, fin) {
    await espera(); soloLectura();
    if (yo().rol !== 'admin') throw new Error('Solo un administrador define las fechas');
    if (!inicio || !fin || fin <= inicio) throw new Error('La fecha final debe ser posterior a la inicial');
    Object.assign(fechasDemo, { inicio, fin });
  },
  async cambiarMeta(liderId, meta) {
    await espera(); soloLectura();
    const l = misLideres().find((x) => x.id === liderId);
    if (!l || !['admin', 'coordinador'].includes(yo().rol)) throw new Error('No tienes permiso para cambiar la meta de este líder');
    l.meta_votos = meta;
  },
  async rankingSemanal() {
    await espera();
    const semana = Date.now() - 7 * 86_400_000;
    const u = yo();
    const filas = lideres.map((l) => ({ l, n: personas.filter((p) => p.liderId === l.id && !p.eliminada && new Date(p.creadoEn).getTime() >= semana).length }))
      .sort((a, b) => b.n - a.n || a.l.nombre.localeCompare(b.l.nombre));
    return filas.map((x, i) => ({
      posicion: filas.findIndex((y) => y.n === x.n) + 1, lider_id: x.l.id, nombre: x.l.nombre, registros: x.n,
      soy_yo: vistaLider ? x.l.id === vistaLider : x.l.perfil_id === u.id, rn: i + 1,
    })).filter((x) => (x.rn <= 10 && x.registros > 0) || x.soy_yo).map(({ rn: _rn, ...r }) => r as RankingFila);
  },
  async aceptarTerminos() { await espera(); terminosDemo.add(actual!.usuario.id); avisar(); },
  async recibeInforme() { await espera(40); return recibeDemo.valor; },
  async cambiarRecibeInforme(recibe) { await espera(); recibeDemo.valor = recibe; },
  async probarInforme() { await espera(300); return `Te enviamos el informe a ${yo().email} (en la demostración no sale ningún correo).`; },
  async eventos() {
    await espera();
    const u = yo();
    const visiblesL = new Set(misLideres().map((l) => l.id));
    sembrarEventos();
    return eventosDemo.filter((e) => u.rol === 'admin' || u.rol === 'candidato' || visiblesL.has(e.lider_id)).map((e) => ({
      id: e.id, nombre: e.nombre, fecha: e.fecha, lugar: e.lugar, activo: e.activo, token: e.token, lider_id: e.lider_id,
      lider: lideres.find((l) => l.id === e.lider_id)?.nombre ?? '', localidad: LOCALIDADES.find((l) => l.id === e.localidadId)?.nombre ?? null,
      asistentes: e.asistencias.length, nuevos: e.asistencias.filter((a) => a.nueva).length,
    })).sort((a, b) => b.fecha.localeCompare(a.fecha));
  },
  async crearEvento(d) {
    await espera(); soloLectura();
    if (!['admin', 'coordinador'].includes(yo().rol)) throw new Error('Solo administradores y coordinadores crean eventos');
    if (!d.nombre.trim()) throw new Error('Ponle un nombre al evento');
    if (!d.fecha) throw new Error('Elige la fecha y la hora');
    if (!misLideres().some((l) => l.id === d.liderId)) throw new Error('Elige el líder al que quedarán asignadas las personas nuevas');
    const id = `ev-${Date.now()}`;
    eventosDemo.unshift({ id, nombre: d.nombre.trim(), fecha: new Date(d.fecha).toISOString(), lugar: d.lugar.trim() || null, activo: true,
      token: `demoev${Math.random().toString(36).slice(2, 12)}`, lider_id: d.liderId, localidadId: d.localidadId, asistencias: [] });
    return id;
  },
  async cerrarEvento(id, activo) { await espera(); soloLectura(); eventosDemo.find((e) => e.id === id)!.activo = activo; },
  async asistentes(eventoId) {
    await espera();
    const e = eventosDemo.find((x) => x.id === eventoId);
    const vis = new Set(visibles().map((p) => p.id));
    return (e?.asistencias ?? []).filter((a) => vis.has(a.personaId)).map((a) => {
      const p = personas.find((x) => x.id === a.personaId)!;
      return { persona_id: p.id, nombres: p.nombres, apellidos: p.apellidos, telefono: p.telefono, lider: lideres.find((l) => l.id === p.liderId)?.nombre ?? null, nueva: a.nueva, en: a.en } as Asistente;
    });
  },
  async eventoInfo(token) {
    await espera();
    sembrarEventos();
    const e = eventosDemo.find((x) => x.token === token && x.activo);
    return e ? { evento: e.nombre, campana: 'Campaña de demostración', fecha: e.fecha, lugar: e.lugar, slug: 'demo' } : null;
  },
  async registrarAsistencia(token, d) {
    await espera(200);
    const e = eventosDemo.find((x) => x.token === token && x.activo);
    if (!e) throw new Error('Este evento ya no recibe asistencias.');
    const ced = d.cedula.replace(/\D/g, '');
    if (!/^\d{5,10}$/.test(ced)) throw new Error('Revisa la cédula: solo números, entre 5 y 10 dígitos.');
    if (!d.acepta) throw new Error('Para registrarte debes aceptar el tratamiento de tus datos.');
    let p = personas.find((x) => x.cedula === ced && !x.eliminada);
    let nueva = false;
    if (!p) {
      if (!d.nombres.trim()) throw new Error('Escribe tu nombre.');
      if (!/^3\d{9}$/.test(d.telefono)) throw new Error('El celular debe tener 10 dígitos y empezar por 3.');
      if (!d.sexo) throw new Error('Elige una opción en sexo.');
      if (!(Number(d.edad) >= 18)) throw new Error('Escribe tu edad (debes ser mayor de edad).');
      p = { id: `p-${personas.length + 1}`, cedula: ced, nombres: d.nombres.trim(), apellidos: d.apellidos.trim(), sexo: d.sexo as Sexo, fechaNacimiento: null,
        edad: Number(d.edad), edadEn: hoyISO(), telefono: d.telefono, liderId: e.lider_id, localidadId: null, puestoId: null, puestoReportado: null,
        direccionReportada: null, mesa: null, creadoEn: new Date().toISOString(), eliminada: false, origen: 'formulario' };
      personas.push(p);
      nueva = true;
    }
    if (!e.asistencias.some((a) => a.personaId === p!.id)) e.asistencias.push({ personaId: p.id, nueva, en: new Date().toISOString() });
  },
  async marcarTransporte(personaId, necesita) {
    await espera(); soloLectura();
    const p = visibles().find((x) => x.id === personaId);
    if (!p || !['admin', 'coordinador', 'lider'].includes(yo().rol)) throw new Error('Esa persona no está en tu lista');
    p.transporte = necesita;
  },
  async personasTransporte() {
    await espera();
    if (!personas.some((p) => p.transporte)) personas.forEach((p, i) => { if (i % 29 === 0) p.transporte = true; });
    return visibles().filter((p) => p.transporte && !p.eliminada).map(aFila);
  },
  async quitarDosPasosDe(id) {
    await espera(); soloLectura();
    const u = usuarios.find((x) => x.id === id)!;
    return `${u.nombre} ya puede entrar solo con su contraseña (en la demostración no cambia nada).`;
  },
};

// En vivo (demostración): cada escritura avisa a las pantallas abiertas
for (const k of ['registrarPersona', 'resolverUbicacion', 'confirmarImportacion', 'digitarE14', 'corregirDigitacion', 'resolverE14', 'importarE14', 'registrarPorEnlace', 'eliminarPersona'] as (keyof Api)[]) {
  const original = api[k] as (...a: unknown[]) => Promise<unknown>;
  (api as unknown as Record<string, unknown>)[k] = async (...a: unknown[]) => {
    const r = await original.apply(api, a);
    const tema = /E14/.test(k) ? 'e14' : 'registros';
    setTimeout(() => oyentesDatos.forEach((f) => f(tema)), 0);
    return r;
  };
}

// En "Ver como" ninguna escritura pasa (igual que en la base real)
const ESCRITURAS: (keyof Api)[] = ['crearLider', 'registrarPersona', 'eliminarPersona', 'resolverUbicacion', 'crearImportacion', 'cargarFilas',
  'confirmarImportacion', 'cancelarImportacion', 'crearEleccion', 'digitarE14', 'corregirDigitacion', 'resolverE14', 'importarE14',
  'vincularUsuario', 'desactivarUsuario', 'reactivarUsuario', 'cambiarRol', 'invitarUsuario', 'reenviarAcceso',
  'configurarPolitica', 'atenderSolicitud', 'importarHistorico', 'eliminarHistorico', 'configurarFechasMeta', 'cambiarMeta', 'crearEvento', 'cerrarEvento', 'marcarTransporte', 'quitarDosPasosDe', 'inscribirDosPasos', 'confirmarDosPasos', 'quitarDosPasos'];
for (const k of ESCRITURAS) {
  const original = api[k] as (...a: unknown[]) => Promise<unknown>;
  (api as unknown as Record<string, unknown>)[k] = async (...a: unknown[]) => {
    soloLectura();
    return original.apply(api, a);
  };
}
