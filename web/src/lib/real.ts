// Implementación real: Supabase. Toda la seguridad la aplica la base de
// datos (permisos por fila); aquí solo se arman las consultas.
import { createClient } from '@supabase/supabase-js';
import type {
  Api, Demografia, FilaImportacion, PuestoCenso, Tendencia,
  AvanceE14, Eleccion, CalidadLider, FilaPlantillaE14, PuestoCodigos, RegistrosMesa, ResultadoFilaE14, LiderE14, LocalidadE14, MesaE14, MesaEnRevision, MesaPendiente, MiDigitacion, PuestoE14, GrupoRevision, Importacion, Lider, Localidad, MiembroEquipo,
  PersonaFila, Puesto, Rol, Sesion, Sugerencia, OpcionVerComo, EnlaceLider,
  SeguimientoLider, DiaDFila, Testigo, CoberturaMesa, AlertaCalidad,
} from './tipos';
import { AVISO_VERSION } from './tipos';
import { edadDesde, hoyISO } from './utilidades';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const llave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
if (!url || !llave) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver web/.env.example)');
}

// "Ver como": mientras esté activo, cada consulta a la base lleva el
// encabezado x-ver-como; la base cambia la identidad y SOLO permite leer.
let verComo: string | null = null;
const fetchConVista: typeof fetch = (entrada, init) => {
  const u = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  if (verComo && u.includes('/rest/v1/')) {
    const h = new Headers(init?.headers ?? (entrada instanceof Request ? entrada.headers : undefined));
    h.set('x-ver-como', verComo);
    return fetch(entrada, { ...init, headers: h });
  }
  return fetch(entrada, init);
};
const sb = createClient(url, llave, { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: fetchConVista } });
/** RPC de solo lectura: en "Ver como" va por GET (la base rechaza POST) */
const rpcLectura = (fn: string, args?: Record<string, unknown>) => sb.rpc(fn, args, { get: !!verComo });

async function llamarFuncion(cuerpo: Record<string, unknown>): Promise<string> {
  // El servidor verifica la sesión: si ya no existe allá (venció o se cerró
  // desde otro lado), se intenta renovar; si no se puede, se pide entrar de nuevo.
  const sesionValida = async () => {
    const u = await sb.auth.getUser();
    if (!u.error) return (await sb.auth.getSession()).data.session;
    const r = await sb.auth.refreshSession();
    if (r.error || !r.data.session) {
      await sb.auth.signOut({ scope: 'local' });
      throw new Error('Tu sesión se cerró. Vuelve a entrar con tu correo y contraseña.');
    }
    return r.data.session;
  };
  const session = await sesionValida();
  if (!session) throw new Error('Tu sesión se cerró. Vuelve a entrar con tu correo y contraseña.');
  const { data, error } = await sb.functions.invoke('equipo', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { ...cuerpo, redirect: window.location.origin },
  });
  if (error) {
    let mensaje = error.message;
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) mensaje = j.error; } catch { /* sin cuerpo */ }
    throw new Error(mensaje);
  }
  if (data?.error) throw new Error(data.error);
  return data?.mensaje ?? 'Listo';
}

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

type CrudoPersona = Record<string, unknown> & {
  lider: { nombre: string } | null; puesto: { nombre: string } | null; localidad: { nombre: string } | null;
};

function consultaPersonas(textoLibre: string, estado: string, extra: { compromiso?: string; liderId?: string; ids?: string[] } = {}) {
  let q = sb.from('personas')
    .select(`id, cedula, nombres, apellidos, sexo, fecha_nacimiento, edad_declarada, edad_declarada_en, telefono,
             puesto_reportado, mesa_reportada, ubicacion_estado, creado_en, compromiso, contactos_n, lider_id,
             lider:lideres(nombre), puesto:puestos(nombre),
             localidad:localidades!localidad_votacion_id(nombre)`, { count: 'exact' })
    .is('eliminado_en', null)
    .order('creado_en', { ascending: false });
  const texto = textoLibre.replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
  if (texto) {
    const digitos = texto.replace(/\D/g, '');
    q = digitos.length >= 3 && digitos.length === texto.replace(/\s/g, '').length
      ? q.like('cedula', `${digitos}%`)
      : q.or(texto.split(/\s+/).map((t) => `nombres.ilike.%${t}%,apellidos.ilike.%${t}%`).join(','));
  }
  if (estado) q = q.eq('ubicacion_estado', estado);
  if (extra.compromiso) q = q.eq('compromiso', extra.compromiso);
  if (extra.liderId) q = q.eq('lider_id', extra.liderId);
  if (extra.ids) q = q.in('id', extra.ids);
  return q;
}

function aFila(x: CrudoPersona): PersonaFila {
  return {
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
    compromiso: (x.compromiso ?? 'sin_contactar') as PersonaFila['compromiso'],
    contactos_n: Number(x.contactos_n ?? 0),
    lider_id: (x.lider_id as string | null) ?? null,
  };
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
    const r = ok(await rpcLectura('sugerir_puesto', {
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
    const r = await consultaPersonas(f.texto, f.estado, { compromiso: f.compromiso || undefined, liderId: f.liderId }).range(f.desde, f.desde + 49);
    if (r.error) throw r.error;
    return { filas: (r.data as unknown as CrudoPersona[]).map(aFila), total: r.count ?? 0 };
  },
  async personasTodas(f) {
    const filas = await todas((a, b) => consultaPersonas(f.texto, f.estado, { compromiso: f.compromiso || undefined, liderId: f.liderId }).range(a, b));
    return (filas as unknown as CrudoPersona[]).map(aFila);
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

  async elecciones(): Promise<Eleccion[]> {
    return lista(await sb.from('elecciones').select('id, nombre, fecha, modo_digitacion').order('fecha', { ascending: false })) as Eleccion[];
  },
  async crearEleccion(d) {
    const c = await contexto();
    sinError(await sb.from('elecciones').insert({
      organizacion_id: c.orgId, nombre: d.nombre.trim(), fecha: d.fecha, modo_digitacion: d.modo, municipio_id: await municipioBogota(),
    }));
  },
  async avanceE14(id) {
    return (ok(await sb.from('v_e14_avance').select('mesas, pendientes, una_digitacion, en_revision, verificadas').eq('eleccion_id', id).maybeSingle()) as AvanceE14 | null);
  },
  async pendientesE14(id) {
    return todas((a, b) => sb.from('v_e14_pendientes').select('mesa_id, localidad, puesto, mesa, estado')
      .eq('eleccion_id', id).order('localidad').order('puesto').order('mesa').range(a, b)) as Promise<MesaPendiente[]>;
  },
  async digitarE14(eleccionId, mesaId, votos) {
    const c = await contexto();
    sinError(await sb.from('e14_digitaciones').insert({ eleccion_id: eleccionId, organizacion_id: c.orgId, mesa_id: mesaId, votos }));
  },
  async misDigitaciones(id) {
    return todas((a, b) => sb.from('v_mis_digitaciones').select('id, mesa_id, localidad, puesto, mesa, votos, en, estado')
      .eq('eleccion_id', id).order('en', { ascending: false }).range(a, b)) as Promise<MiDigitacion[]>;
  },
  async corregirDigitacion(id, votos) {
    const r = await sb.from('e14_digitaciones').update({ votos }).eq('id', id).select('id');
    if (r.error) throw r.error;
    if (!r.data?.length) throw new Error('No tienes permiso para hacer esto.');
  },
  async revisionE14(id) {
    return todas((a, b) => sb.from('v_e14_revision').select('mesa_id, localidad, puesto, mesa, digitaciones')
      .eq('eleccion_id', id).order('localidad').order('puesto').order('mesa').range(a, b)) as Promise<MesaEnRevision[]>;
  },
  async resolverE14(eleccionId, mesaId, votos) {
    sinError(await sb.rpc('resolver_e14', { p_eleccion: eleccionId, p_mesa: mesaId, p_votos: votos }));
  },
  async resultadosE14(id) {
    const campos = 'esperados, confirmados, faltantes, adicionales, votos_reales, mesas, mesas_verificadas';
    const [localidades, puestos, lideres] = await Promise.all([
      todas((a, b) => sb.from('v_e14_localidades').select(`localidad_id, localidad, ${campos}`).eq('eleccion_id', id).range(a, b)),
      todas((a, b) => sb.from('v_e14_puestos').select(`puesto_id, puesto, localidad_id, localidad, ${campos}`).eq('eleccion_id', id).range(a, b)),
      todas((a, b) => sb.from('v_e14_lideres').select('lider_id, nombre, esperados, esperados_verificados, confirmados, mesas_pendientes, cumplimiento').eq('eleccion_id', id).range(a, b)),
    ]);
    // Los totales vienen como enteros (::int); solo "cumplimiento" es numeric y llega como texto
    // Una localidad o puesto sin mesas verificadas suma null en la base: se normaliza a 0
    const totales = <T extends Record<string, unknown>>(x: T) => ({
      ...x, esperados: Number(x.esperados ?? 0), confirmados: Number(x.confirmados ?? 0), faltantes: Number(x.faltantes ?? 0),
      adicionales: Number(x.adicionales ?? 0), votos_reales: Number(x.votos_reales ?? 0), mesas: Number(x.mesas ?? 0), mesas_verificadas: Number(x.mesas_verificadas ?? 0),
    });
    return {
      localidades: (localidades as Record<string, unknown>[]).map(totales) as unknown as LocalidadE14[],
      puestos: (puestos as Record<string, unknown>[]).map(totales) as unknown as PuestoE14[],
      lideres: (lideres as LiderE14[]).map((l) => ({
        ...l, esperados: Number(l.esperados ?? 0), confirmados: Number(l.confirmados ?? 0),
        cumplimiento: l.cumplimiento == null ? null : Number(l.cumplimiento),
      })),
    };
  },
  async mesasE14(eleccionId, puestoId) {
    return lista(await sb.from('v_e14_mesas').select('mesa_id, mesa, puesto_id, estado, esperados, votos_reales, confirmados, faltantes, adicionales')
      .eq('eleccion_id', eleccionId).eq('puesto_id', puestoId).order('mesa')) as MesaE14[];
  },

  async plantillaE14(id) {
    return todas((a, b) => sb.from('v_e14_plantilla').select('localidad, zona, codigo_puesto, puesto, mesa')
      .eq('eleccion_id', id).order('localidad').order('puesto').order('mesa').range(a, b)) as Promise<FilaPlantillaE14[]>;
  },
  async puestosConCodigos() {
    const filas = await todas((a, b) => sb.from('puestos')
      .select('id, zona, codigo, nombre, direccion, mesas_total, localidad:localidades(nombre)').order('zona').order('codigo').range(a, b));
    return (filas as unknown as (Omit<PuestoCodigos, 'localidad'> & { localidad: { nombre: string } })[])
      .map((p) => ({ ...p, localidad: p.localidad.nombre }));
  },
  async importarE14(eleccionId, archivo, filas, confirmar) {
    return lista(await sb.rpc('importar_e14', { p_eleccion: eleccionId, p_archivo: archivo, p_filas: filas, p_confirmar: confirmar })) as ResultadoFilaE14[];
  },
  async registrosMesa() {
    return todas((a, b) => sb.from('v_registros_mesa').select('*').order('mesa_id').range(a, b)) as Promise<RegistrosMesa[]>;
  },
  async calidadLideres() {
    return todas((a, b) => sb.from('v_calidad_lideres').select('*').order('nombre').range(a, b)) as Promise<CalidadLider[]>;
  },
  async registrarExportacion(tipo, filas, filtros = {}) {
    sinError(await sb.rpc('registrar_exportacion', { p_tipo: tipo, p_filas: filas, p_filtros: filtros }));
  },

  async equipo(): Promise<MiembroEquipo[]> {
    return ok(await rpcLectura('equipo')) as MiembroEquipo[];
  },
  async vincularUsuario(email, nombre, rol, liderId) {
    ok(await sb.rpc('vincular_usuario', { p_email: email, p_nombre: nombre, p_rol: rol, p_lider: liderId }));
  },
  async desactivarUsuario(id) {
    ok(await sb.rpc('desactivar_usuario', { p_usuario: id }));
  },
  async reactivarUsuario(id) {
    ok(await sb.rpc('reactivar_usuario', { p_usuario: id }));
  },
  async cambiarRol(id, rol) {
    ok(await sb.rpc('cambiar_rol', { p_usuario: id, p_rol: rol }));
  },
  invitarUsuario(d) {
    return llamarFuncion({ accion: 'invitar', email: d.email, nombre: d.nombre, rol: d.rol, lider_id: d.liderId });
  },
  reenviarAcceso(id) {
    return llamarFuncion({ accion: 'reenviar', usuario_id: id });
  },

  async opcionesVerComo() {
    const antes = verComo; verComo = null;
    try { return lista(await sb.rpc('opciones_ver_como')) as OpcionVerComo[]; } finally { verComo = antes; }
  },
  async usarVistaComo(objetivo) {
    if (objetivo) {
      verComo = null;
      sinError(await sb.rpc('registrar_ver_como', { p_objetivo: objetivo }));
    }
    verComo = objetivo;
  },

  async registrarContacto(personaId, resultado, canal, nota) {
    ok(await sb.rpc('registrar_contacto', { p_persona: personaId, p_resultado: resultado, p_canal: canal, p_nota: nota ?? null }));
  },
  async seguimientoLideres() {
    return todas((a, b) => sb.from('v_seguimiento_lideres').select('*').order('nombre').range(a, b)) as Promise<SeguimientoLider[]>;
  },
  async votosMarcados(eleccionId) {
    const filas = await todas((a, b) => sb.from('votos_marcados').select('persona_id').eq('eleccion_id', eleccionId).range(a, b)) as { persona_id: string }[];
    return new Set(filas.map((f) => f.persona_id));
  },
  async marcarVoto(eleccionId, personaId, voto) {
    ok(await sb.rpc('marcar_voto', { p_eleccion: eleccionId, p_persona: personaId, p_voto: voto }));
  },
  async diaD(eleccionId) {
    return todas((a, b) => sb.from('v_dia_d').select('*').eq('eleccion_id', eleccionId).range(a, b)) as Promise<DiaDFila[]>;
  },
  async testigos(eleccionId) {
    return todas((a, b) => sb.from('v_testigos').select('*').eq('eleccion_id', eleccionId).order('localidad').range(a, b)) as Promise<Testigo[]>;
  },
  async coberturaTestigos(eleccionId) {
    return todas((a, b) => sb.from('v_testigos_cobertura').select('*').eq('eleccion_id', eleccionId).range(a, b)) as Promise<CoberturaMesa[]>;
  },
  async asignarTestigo(eleccionId, personaId, puestoId, mesas) {
    ok(await sb.rpc('asignar_testigo', { p_eleccion: eleccionId, p_persona: personaId, p_puesto: puestoId, p_mesas: mesas }));
  },
  async quitarTestigo(id) {
    ok(await sb.rpc('quitar_testigo', { p_id: id }));
  },
  async alertasCalidad() {
    return lista(await sb.from('v_alertas_calidad').select('*').order('personas', { ascending: false })) as AlertaCalidad[];
  },
  async personasPorIds(ids) {
    if (!ids.length) return [];
    const r = await consultaPersonas('', '', { ids: ids.slice(0, 200) });
    if (r.error) throw r.error;
    return (r.data as unknown as CrudoPersona[]).map(aFila);
  },

  alCambiarDatos(cb, alConectar) {
    const canal = sb.channel(`actividad-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actividad' },
        (p) => cb(((p.new as { tema?: string })?.tema ?? 'registros') as 'registros' | 'e14'))
      .subscribe((estado) => alConectar?.(estado === 'SUBSCRIBED'));
    return () => { sb.removeChannel(canal); };
  },

  async enlaceLider(liderId) {
    const r = lista(await rpcLectura('enlace_lider', { p_lider: liderId })) as EnlaceLider[];
    return r[0] ?? { token: null, activo: false, registros_enlace: 0 };
  },
  async configurarEnlace(liderId, activo, regenerar) {
    ok(await sb.rpc('configurar_enlace', { p_lider: liderId, p_activo: activo, p_regenerar: regenerar }));
  },
  async enlaceInfo(token) {
    const r = lista(await sb.rpc('enlace_info', { p_token: token })) as { lider: string; campana: string }[];
    return r[0] ?? null;
  },
  async registrarPorEnlace(token, d) {
    sinError(await sb.rpc('registrar_por_enlace', { p_token: token, p: { ...d, aviso_version: AVISO_VERSION } }));
  },
};
