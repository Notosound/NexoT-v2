// Modo demostración: todo en memoria, con datos INVENTADOS (salvo el
// catálogo de puestos, que es el oficial y público). Sirve para ver y probar
// el panel sin Supabase. Nunca se incluye en el build normal.
import type {
  Api, Demografia, FilaImportacion, GrupoRevision, Importacion, Lider, Localidad, MiembroEquipo,
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

const PUESTOS: Puesto[] = (crudo as [number, number, string, string, number][])
  .map(([id, loc, nombre, direccion, mesas]) => ({ id, localidad_id: loc, nombre, direccion, mesas_total: mesas }));

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
];
const lideres: Omit<Lider, 'registrados'>[] = [
  { id: 'l-1', nombre: 'Líder Demo', cedula: '900001', telefono: '3001112233', meta_votos: 60, coordinador_id: 'u-coord', perfil_id: 'u-lider' },
  { id: 'l-2', nombre: 'Marcela Pinto', cedula: '900002', telefono: null, meta_votos: 40, coordinador_id: 'u-coord', perfil_id: null },
  { id: 'l-3', nombre: 'Germán Ríos', cedula: '900003', telefono: null, meta_votos: 80, coordinador_id: null, perfil_id: null },
];
const alias = new Map<string, number>();
const personas: PersonaDemo[] = [];

const NOMBRES_ALTERNOS = ['Colegio de la 116', 'IED Sede B', 'Salón comunal', 'Coliseo del barrio'];
for (let i = 0; i < 140; i++) {
  const f = azar() < 0.55;
  const loc = uno([1, 8, 8, 10, 11, 11, 18, 18, 18, 7, 9, 19]);
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
    creadoEn: new Date(Date.now() - i * 3600_000 * 5).toISOString(), eliminada: false,
  });
}

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
    const t = normalizar(f.texto);
    let lista = visibles();
    if (t) lista = lista.filter((p) => p.cedula.startsWith(t) || normalizar(`${p.nombres} ${p.apellidos}`).includes(t));
    if (f.estado) lista = lista.filter((p) => estado(p) === f.estado);
    const lider = new Map(lideres.map((l) => [l.id, l.nombre]));
    const filas = lista.slice(f.desde, f.desde + 50).map((p): PersonaFila => ({
      id: p.id, cedula: p.cedula, nombres: p.nombres, apellidos: p.apellidos, sexo: p.sexo,
      edad: edadDesde(p.fechaNacimiento, p.edad, p.edadEn), telefono: p.telefono, lider: lider.get(p.liderId) ?? null,
      localidad: LOCALIDADES.find((l) => l.id === p.localidadId)?.nombre ?? null,
      puesto: PUESTOS.find((x) => x.id === p.puestoId)?.nombre ?? null, puesto_reportado: p.puestoReportado,
      mesa: p.mesa, ubicacion_estado: estado(p), creado_en: p.creadoEn,
    }));
    return { filas, total: lista.length };
  },
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
      const localidad = LOCALIDADES.find((l) => l.id === p.localidadId)?.nombre ?? 'Sin lugar de votación';
      const k = `${localidad}|${rango}|${p.sexo}`;
      const fila = m.get(k) ?? { localidad, rango_edad: rango, sexo: p.sexo ?? 'sin dato', personas: 0 };
      fila.personas++;
      m.set(k, fila);
    }
    return [...m.values()];
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
