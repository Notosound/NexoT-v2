// Modo demostración: todo en memoria, con datos INVENTADOS (salvo el
// catálogo de puestos, que es el oficial y público). Sirve para ver y probar
// el panel sin Supabase. Nunca se incluye en el build normal.
import type {
  Api, Demografia, FilaImportacion, PuestoCenso, Tendencia,
  Eleccion, EstadoMesa, CalidadLider, PuestoCodigos, RegistrosMesa, ResultadoFilaE14, LiderE14, LocalidadE14, MesaE14, PuestoE14, TotalesE14, GrupoRevision, Importacion, Lider, Localidad, MiembroEquipo,
  PersonaFila, Puesto, Rol, Sesion, Sexo, Sugerencia,
} from './tipos';
import { edadDesde, hoyISO, normalizar } from './utilidades';
import crudo from './demo-puestos.json';

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
  mesa: number | null; creadoEn: string; eliminada: boolean;
}

// Generador pseudoaleatorio con semilla: los mismos datos en cada carga
let semilla = 20261031;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
const uno = <T,>(xs: T[]) => xs[Math.floor(azar() * xs.length)];

const NOMBRES_F = ['Ana', 'Luz', 'Marta', 'Sandra', 'Paola', 'Diana', 'Carolina', 'Gloria', 'Yolanda', 'Natalia', 'Lina', 'Rosa'];
const NOMBRES_M = ['Carlos', 'Jorge', 'Luis', 'Andrés', 'Javier', 'Óscar', 'Fabio', 'Hernán', 'Wilson', 'Diego', 'Camilo', 'Edgar'];
const APELLIDOS = ['Rojas', 'Gómez', 'Díaz', 'Torres', 'Moreno', 'Vargas', 'Castro', 'Ruiz', 'Ortiz', 'Suárez', 'Pardo', 'Niño', 'Cárdenas', 'Mejía'];

const ORG = 'org-demo';
const usuarios: (MiembroEquipo & { lider?: string })[] = [
  { id: 'u-admin', nombre: 'Admin Demo', rol: 'admin', activo: true, email: 'admin@demo.co' },
  { id: 'u-coord', nombre: 'Coordinadora Demo', rol: 'coordinador', activo: true, email: 'coordinadora@demo.co' },
  { id: 'u-lider', nombre: 'Líder Demo', rol: 'lider', activo: true, email: 'lider@demo.co' },
  { id: 'u-cand', nombre: 'Candidato Demo', rol: 'candidato', activo: true, email: 'candidato@demo.co' },
  { id: 'u-dig', nombre: 'Digitador Demo', rol: 'digitador', activo: true, email: 'digitador@demo.co' },
  { id: 'u-dig2', nombre: 'Segunda Digitadora', rol: 'digitador', activo: true, email: 'digitadora2@demo.co' },
];
const lideres: Omit<Lider, 'registrados'>[] = [
  { id: 'l-1', nombre: 'Líder Demo', cedula: '900001', telefono: '3001112233', meta_votos: 60, coordinador_id: 'u-coord', perfil_id: 'u-lider' },
  { id: 'l-2', nombre: 'Marcela Pinto', cedula: '900002', telefono: null, meta_votos: 40, coordinador_id: 'u-coord', perfil_id: null },
  { id: 'l-3', nombre: 'Germán Ríos', cedula: '900003', telefono: null, meta_votos: 80, coordinador_id: null, perfil_id: null },
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

function yo() {
  if (!actual) throw new Error('Sesión cerrada');
  return actual.usuario;
}
function misLideres() {
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

function filtrarPersonas(texto: string, estadoFiltro: string) {
  const t = normalizar(texto);
  let lista = visibles();
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
  };
}
const exportaciones: { tipo: string; filas: number }[] = [];

const importaciones = new Map<string, { imp: Importacion; filas: FilaImportacion[]; liderId: string | null }>();

export const api: Api = {
  modo: 'demo',

  async sesion(): Promise<Sesion | null> {
    await espera(60);
    if (!actual) return null;
    const u = actual.usuario;
    return { usuarioId: u.id, email: u.email, perfil: { nombre: u.nombre, rol: u.rol, organizacionId: ORG }, organizacion: 'Campaña de demostración' };
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
    if (!misLideres().some((l) => l.id === p.liderId)) throw new Error('No tienes permiso para hacer esto.');
    if (personas.some((x) => !x.eliminada && x.cedula === p.cedula)) throw new Error('Esta cédula ya está registrada.');
    let puestoId = p.puestoId;
    if (!puestoId && p.puestoReportado) {
      const s = sugerir(p.localidadId, p.puestoReportado, p.direccionReportada ?? '');
      if (s?.confianza === 'alta') puestoId = s.puesto_id;
    }
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
    const lista = filtrarPersonas(f.texto, f.estado);
    return { filas: lista.slice(f.desde, f.desde + 50).map(aFila), total: lista.length };
  },
  async personasTodas(f) { await espera(); return filtrarPersonas(f.texto, f.estado).map(aFila); },
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
      let puesto = r.zona && r.codigo_puesto
        ? PUESTOS.find((p) => Number(CODIGOS.get(p.id)!.zona) === Number(String(r.zona).replace(/\D/g, '')) && Number(CODIGOS.get(p.id)!.codigo) === Number(String(r.codigo_puesto).replace(/\D/g, '')))
        : undefined;
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
  async registrarExportacion(tipo, filas) { await espera(30); exportaciones.push({ tipo, filas }); },

  async equipo() { await espera(); return yo().rol === 'admin' ? usuarios : []; },
  async vincularUsuario(email, nombre, rol, liderId) {
    await espera(200);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Correo inválido');
    const existente = usuarios.find((u) => u.email === email.trim().toLowerCase());
    if (existente?.id === yo().id) throw new Error('No puedes cambiar tu propio rol');
    const u = existente ?? { id: `u-${usuarios.length + 1}`, email: email.trim().toLowerCase(), nombre, rol, activo: true };
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
};
