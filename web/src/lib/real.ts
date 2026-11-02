// Implementación real: Supabase. Toda la seguridad la aplica la base de
// datos (permisos por fila); aquí solo se arman las consultas.
import { createClient } from '@supabase/supabase-js';
import type {
  Api, Demografia, FilaImportacion, PuestoCenso, Tendencia, GrupoRevision, Importacion, Lider, Localidad, MiembroEquipo,
  PersonaFila, Puesto, Rol, Sesion, Sugerencia,
} from './tipos';
import { AVISO_VERSION } from './tipos';
import { edadDesde, hoyISO } from './utilidades';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const llave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
if (!url || !llave) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver web/.env.example)');
}

const sb = createClient(url, llave, { auth: { persistSession: true, autoRefreshToken: true } });

function ok<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
function lista<T>(r: { data: T[] | null; error: unknown }): T[] {
  if (r.error) throw r.error;
  return r.data ?? [];
}
function uno<T>(r: { data: T; error: unknown }): NonNullable<T> {
  if (r.error) throw r.error;
  if (r.data == null) throw new Error('No se encontró el dato');
  return r.data as NonNullable<T>;
}
function sinError(r: { error: unknown }): void {
  if (r.error) throw r.error;
}

// PostgREST devuelve como máximo 1.000 filas por consulta: se pagina.
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const lote = ok(await consulta(desde, desde + 999)) ?? [];
    salida.push(...lote);
    if (lote.length < 1000) return salida;
  }
}

let cacheSesion: { usuarioId: string; orgId: string; rol: Rol } | null = null;
let cacheMunicipio: number | null = null;

async function contexto() {
  if (!cacheSesion) {
    const s = await api.sesion();
    if (!s?.perfil) throw new Error('Tu usuario no tiene acceso todavía.');
  }
  return cacheSesion!;
}

async function municipioBogota(): Promise<number> {
  if (cacheMunicipio == null) {
    const m = uno(await sb.from('municipios').select('id').eq('divipola', '11001').single());
    cacheMunicipio = m.id as number;
  }
  return cacheMunicipio;
}

export const api: Api = {
  modo: 'real',

  async sesion(): Promise<Sesion | null> {
    const { data } = await sb.auth.getSession();
    const usuario = data.session?.user;
    if (!usuario) { cacheSesion = null; return null; }
    const perfil = ok(await sb.from('perfiles').select('nombre, rol, organizacion_id, activo').eq('id', usuario.id).maybeSingle());
    if (!perfil || !perfil.activo) {
      cacheSesion = null;
      return { usuarioId: usuario.id, email: usuario.email ?? '', perfil: null, organizacion: null };
    }
    const org = ok(await sb.from('organizaciones').select('nombre').eq('id', perfil.organizacion_id).maybeSingle());
    cacheSesion = { usuarioId: usuario.id, orgId: perfil.organizacion_id, rol: perfil.rol as Rol };
    return {
      usuarioId: usuario.id,
      email: usuario.email ?? '',
      perfil: { nombre: perfil.nombre, rol: perfil.rol as Rol, organizacionId: perfil.organizacion_id },
      organizacion: org?.nombre ?? null,
    };
  },

  alCambiarSesion(cb) {
    const { data } = sb.auth.onAuthStateChange(() => { cacheSesion = null; cb(); });
    return () => data.subscription.unsubscribe();
  },

  async iniciarSesion(email, clave) {
    sinError(await sb.auth.signInWithPassword({ email: email.trim(), password: clave }));
  },
  async cerrarSesion() {
    cacheSesion = null;
    await sb.auth.signOut();
  },
  async cambiarClave(clave) {
    sinError(await sb.auth.updateUser({ password: clave }));
  },
  async recuperarClave(email) {
    sinError(await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/cambiar-clave` }));
  },

  async localidades(): Promise<Localidad[]> {
    const mun = await municipioBogota();
    return lista(await sb.from('localidades').select('id, codigo, nombre').eq('municipio_id', mun).order('codigo'));
  },
  async puestos(localidadId): Promise<Puesto[]> {
    return lista(await sb.from('puestos').select('id, localidad_id, nombre, direccion, mesas_total')
      .eq('localidad_id', localidadId).order('nombre'));
  },
  async sugerirPuesto(localidadId, nombre, direccion): Promise<Sugerencia | null> {
    const r = ok(await sb.rpc('sugerir_puesto', {
      p_localidad: localidadId, p_nombre: nombre.trim() || null, p_direccion: direccion.trim() || null,
    })) as Sugerencia[] | null;
    return r?.[0] ?? null;
  },

  async lideres(): Promise<Lider[]> {
    const [fichas, avance] = await Promise.all([
      todas((a, b) => sb.from('lideres').select('id, nombre, cedula, telefono, meta_votos, coordinador_id, perfil_id')
        .eq('activo', true).order('nombre').range(a, b)),
      todas((a, b) => sb.from('v_avance_lideres').select('lider_id, registrados').range(a, b)),
    ]);
    const reg = new Map((avance as { lider_id: string; registrados: number }[]).map((x) => [x.lider_id, x.registrados]));
    return (fichas as Omit<Lider, 'registrados'>[]).map((f) => ({ ...f, registrados: reg.get(f.id) ?? 0 }));
  },
  async crearLider(d) {
    const c = await contexto();
    ok(await sb.from('lideres').insert({
      organizacion_id: c.orgId,
      nombre: d.nombre.trim(),
      cedula: d.cedula || null,
      telefono: d.telefono || null,
      meta_votos: d.meta,
      coordinador_id: c.rol === 'coordinador' ? c.usuarioId : d.coordinadorId,
    }));
  },
  async coordinadores() {
    return lista(await sb.from('perfiles').select('id, nombre').eq('rol', 'coordinador').eq('activo', true).order('nombre'));
  },

  async registrarPersona(p) {
    const c = await contexto();
    const fila = {
      organizacion_id: c.orgId,
      lider_id: p.liderId,
      cedula: p.cedula,
      nombres: p.nombres,
      apellidos: p.apellidos,
      sexo: p.sexo,
      fecha_nacimiento: p.fechaNacimiento,
      edad_declarada: p.fechaNacimiento ? null : p.edad,
      edad_declarada_en: p.fechaNacimiento || p.edad == null ? null : hoyISO(),
      telefono: p.telefono,
      localidad_votacion_id: p.localidadId,
      puesto_id: p.puestoId,
      puesto_reportado: p.puestoId ? null : p.puestoReportado,
      direccion_reportada: p.puestoId ? null : p.direccionReportada,
      mesa_reportada: p.mesa,
      origen: 'manual',
      consentimiento_version: AVISO_VERSION,
      consentimiento_en: new Date().toISOString(),
      consentimiento_canal: 'presencial',
    };
    const r = uno(await sb.from('personas').insert(fila).select('ubicacion_estado, puesto:puestos(nombre)').single()) as
      unknown as { ubicacion_estado: PersonaFila['ubicacion_estado']; puesto: { nombre: string } | null };
    return { ubicacion_estado: r.ubicacion_estado, puesto: r.puesto?.nombre ?? null };
  },

  async personas(f) {
    let q = sb.from('personas')
      .select(`id, cedula, nombres, apellidos, sexo, fecha_nacimiento, edad_declarada, edad_declarada_en, telefono,
               puesto_reportado, mesa_reportada, ubicacion_estado, creado_en,
               lider:lideres(nombre), puesto:puestos(nombre),
               localidad:localidades!localidad_votacion_id(nombre)`, { count: 'exact' })
      .is('eliminado_en', null)
      .order('creado_en', { ascending: false })
      .range(f.desde, f.desde + 49);
    const texto = f.texto.replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
    if (texto) {
      const digitos = texto.replace(/\D/g, '');
      q = digitos.length >= 3 && digitos.length === texto.replace(/\s/g, '').length
        ? q.like('cedula', `${digitos}%`)
        : q.or(texto.split(/\s+/).map((t) => `nombres.ilike.%${t}%,apellidos.ilike.%${t}%`).join(','));
    }
    if (f.estado) q = q.eq('ubicacion_estado', f.estado);
    const r = await q;
    if (r.error) throw r.error;
    type Crudo = Record<string, unknown> & {
      lider: { nombre: string } | null; puesto: { nombre: string } | null; localidad: { nombre: string } | null;
    };
    const filas = (r.data as unknown as Crudo[]).map((x): PersonaFila => ({
      id: x.id as string,
      cedula: x.cedula as string,
      nombres: x.nombres as string,
      apellidos: x.apellidos as string,
      sexo: x.sexo as PersonaFila['sexo'],
      edad: edadDesde(x.fecha_nacimiento as string | null, x.edad_declarada as number | null, x.edad_declarada_en as string | null),
      telefono: x.telefono as string | null,
      lider: x.lider?.nombre ?? null,
      localidad: x.localidad?.nombre ?? null,
      puesto: x.puesto?.nombre ?? null,
      puesto_reportado: x.puesto_reportado as string | null,
      mesa: x.mesa_reportada as number | null,
      ubicacion_estado: x.ubicacion_estado as PersonaFila['ubicacion_estado'],
      creado_en: x.creado_en as string,
    }));
    return { filas, total: r.count ?? filas.length };
  },
  async eliminarPersona(id) {
    ok(await sb.rpc('eliminar_persona', { p_id: id }));
  },
  async resumen() {
    const contar = async (filtro?: string) => {
      let q = sb.from('personas').select('id', { count: 'exact', head: true }).is('eliminado_en', null);
      if (filtro) q = q.eq('ubicacion_estado', filtro);
      const r = await q;
      if (r.error) throw r.error;
      return r.count ?? 0;
    };
    const [personas, porRevisar, sinUbicacion] = await Promise.all([contar(), contar('por_revisar'), contar('sin_dato')]);
    return { personas, porRevisar, sinUbicacion };
  },
  async demografia(): Promise<Demografia[]> {
    return todas((a, b) => sb.from('v_demografia')
      .select('localidad_id, localidad, puesto_id, puesto, rango_edad, sexo, personas').range(a, b));
  },
  async censoPuestos(): Promise<PuestoCenso[]> {
    const filas = await todas((a, b) => sb.from('puestos')
      .select('id, localidad_id, nombre, latitud, longitud, censo_mujeres, censo_hombres, censo_total').order('id').range(a, b));
    // numeric de Postgres llega como texto
    return (filas as Record<string, unknown>[]).map((p) => ({
      ...(p as unknown as PuestoCenso),
      latitud: p.latitud == null ? null : Number(p.latitud),
      longitud: p.longitud == null ? null : Number(p.longitud),
    }));
  },
  async tendencia(): Promise<Tendencia[]> {
    return todas((a, b) => sb.from('v_tendencia_diaria').select('dia, nuevos').order('dia').range(a, b));
  },

  async porRevisar(): Promise<GrupoRevision[]> {
    const r = await todas((a, b) => sb.from('v_ubicaciones_por_revisar').select('*').range(a, b)) as GrupoRevision[];
    return r.sort((x, y) => y.personas - x.personas);
  },
  async resolverUbicacion(personaId, puestoId) {
    return ok(await sb.rpc('resolver_ubicacion', { p_persona: personaId, p_puesto: puestoId })) as number;
  },

  async crearImportacion(d) {
    const c = await contexto();
    const r = uno(await sb.from('importaciones').insert({
      organizacion_id: c.orgId,
      archivo: d.archivo,
      municipio_id: await municipioBogota(),
      lider_id_defecto: d.liderId,
      fecha_datos: d.fechaDatos,
      consentimiento_version: d.consentimiento ? AVISO_VERSION : null,
    }).select('id').single());
    return r.id as string;
  },
  async cargarFilas(importacionId, filas, progreso) {
    const c = await contexto();
    for (let i = 0; i < filas.length; i += 500) {
      const lote = filas.slice(i, i + 500).map((f) => ({
        importacion_id: importacionId, organizacion_id: c.orgId, fila: f.fila, datos: f.datos,
      }));
      ok(await sb.from('importacion_filas').insert(lote));
      progreso?.(Math.min(i + 500, filas.length));
    }
  },
  async validarImportacion(id) {
    return ok(await sb.rpc('validar_importacion', { p_importacion: id })) as Importacion;
  },
  async filasImportacion(id) {
    return todas((a, b) => sb.from('importacion_filas').select('fila, datos, estado, errores, advertencias')
      .eq('importacion_id', id).order('fila').range(a, b)) as Promise<FilaImportacion[]>;
  },
  async confirmarImportacion(id) {
    return ok(await sb.rpc('confirmar_importacion', { p_importacion: id })) as Importacion;
  },
  async cancelarImportacion(id) {
    ok(await sb.from('importaciones').update({ estado: 'cancelada' }).eq('id', id));
  },

  async equipo(): Promise<MiembroEquipo[]> {
    return ok(await sb.rpc('equipo')) as MiembroEquipo[];
  },
  async vincularUsuario(email, nombre, rol, liderId) {
    ok(await sb.rpc('vincular_usuario', { p_email: email, p_nombre: nombre, p_rol: rol, p_lider: liderId }));
  },
  async desactivarUsuario(id) {
    ok(await sb.rpc('desactivar_usuario', { p_usuario: id }));
  },
};
