export type Rol = 'admin' | 'coordinador' | 'lider' | 'digitador' | 'candidato';
export type Sexo = 'femenino' | 'masculino' | 'otro' | 'no_informa';
export type EstadoUbicacion = 'completa' | 'sin_mesa' | 'por_revisar' | 'sin_dato';

export const ROLES: Record<Rol, string> = {
  admin: 'Administrador',
  coordinador: 'Coordinador',
  lider: 'Líder',
  digitador: 'Digitador E14',
  candidato: 'Candidato',
};

export const SEXOS: Record<Sexo, string> = {
  femenino: 'Femenino',
  masculino: 'Masculino',
  otro: 'Otro',
  no_informa: 'Prefiere no decir',
};

export const ESTADOS_UBICACION: Record<EstadoUbicacion, string> = {
  completa: 'Ubicado',
  sin_mesa: 'Falta mesa',
  por_revisar: 'Puesto por revisar',
  sin_dato: 'Sin lugar de votación',
};

// Texto del aviso que acepta cada persona. Si cambia el texto, cambia la versión.
export const AVISO_VERSION = 'aviso-2026-10';
export const AVISO_TEXTO =
  'La persona autoriza el tratamiento de sus datos personales, incluido el dato sensible de su preferencia política, ' +
  'con fines logísticos y de conteo de la campaña, conforme a la Ley 1581 de 2012 y la política de tratamiento de datos. ' +
  'Sabe que su autorización es voluntaria y que puede consultar, corregir o pedir que se eliminen sus datos.';

export interface Sesion {
  usuarioId: string;
  email: string;
  perfil: { nombre: string; rol: Rol; organizacionId: string } | null;
  organizacion: string | null;
}

export interface Localidad { id: number; codigo: string; nombre: string }

export interface Puesto {
  id: number;
  localidad_id: number;
  nombre: string;
  direccion: string | null;
  mesas_total: number | null;
}

export interface Sugerencia {
  puesto_id: number;
  nombre: string;
  direccion: string | null;
  mesas_total: number | null;
  metodo: string;
  confianza: 'alta' | 'media';
}

export interface Lider {
  id: string;
  nombre: string;
  cedula: string | null;
  telefono: string | null;
  meta_votos: number;
  coordinador_id: string | null;
  perfil_id: string | null;
  registrados: number;
}

export interface NuevaPersona {
  liderId: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  sexo: Sexo;
  fechaNacimiento: string | null;
  edad: number | null;
  telefono: string | null;
  localidadId: number | null;
  puestoId: number | null;
  puestoReportado: string | null;
  direccionReportada: string | null;
  mesa: number | null;
}

export interface ResultadoRegistro {
  ubicacion_estado: EstadoUbicacion;
  puesto: string | null;
}

export interface PersonaFila {
  id: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  sexo: Sexo | null;
  edad: number | null;
  telefono: string | null;
  lider: string | null;
  localidad: string | null;
  puesto: string | null;
  puesto_reportado: string | null;
  mesa: number | null;
  ubicacion_estado: EstadoUbicacion;
  creado_en: string;
  compromiso: Compromiso;
  contactos_n: number;
  lider_id: string | null;
}

export interface FiltroPersonas {
  texto: string;
  estado: EstadoUbicacion | '';
  desde: number;
  compromiso?: Compromiso | '';
  liderId?: string;
}

// ── Seguimiento, Día D, testigos y alertas ──
export type Compromiso = 'sin_contactar' | 'confirmado' | 'dudoso' | 'no_apoya' | 'numero_errado';
export type ResultadoContacto = Exclude<Compromiso, 'sin_contactar'> | 'no_contesta';
export const COMPROMISOS: Record<Compromiso, string> = {
  sin_contactar: 'Sin contactar', confirmado: 'Confirmado', dudoso: 'Dudoso', no_apoya: 'No apoya', numero_errado: 'Número equivocado',
};
export interface SeguimientoLider { lider_id: string; nombre: string; total: number; sin_contactar: number; confirmados: number; dudosos: number; no_apoya: number; numero_errado: number; contactados: number }
export interface DiaDFila { lider_id: string; lider: string; localidad_id: number | null; localidad: string; personas: number; votaron: number }
export interface Testigo { id: number; persona_id: string; nombres: string; apellidos: string; cedula: string; telefono: string | null; puesto_id: number; puesto: string; localidad: string; mesas: number[]; lider: string | null }
export interface CoberturaMesa { localidad_id: number; localidad: string; puesto_id: number; puesto: string; mesa: number; simpatizantes: number; cubierta: boolean }
export interface AlertaCalidad { tipo: 'celular_repetido' | 'nombre_repetido' | 'rafaga'; titulo: string; lideres: string; personas: number; persona_ids: string[] }

export interface GrupoRevision {
  localidad_id: number | null;
  localidad: string | null;
  puesto_reportado: string | null;
  direccion_reportada: string | null;
  personas: number;
  persona_ejemplo: string;
  sugerencia_puesto_id: number | null;
  sugerencia_puesto: string | null;
  sugerencia_direccion: string | null;
  sugerencia_metodo: string | null;
}

export interface Importacion {
  id: string;
  estado: 'cargando' | 'validada' | 'confirmada' | 'cancelada';
  total_filas: number;
  filas_validas: number;
  filas_con_errores: number;
  filas_duplicadas: number;
  filas_importadas: number;
}

export interface FilaImportacion {
  fila: number;
  datos: Record<string, string>;
  estado: 'pendiente' | 'valida' | 'con_errores' | 'duplicada' | 'importada';
  errores: string[];
  advertencias: string[];
}

export interface MiembroEquipo {
  id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  email: string;
  creado_en: string;
  ultimo_ingreso: string | null;
  acepto: boolean;
  lider_id: string | null;
}

/** A quién puede "ver como" el admin */
export interface OpcionVerComo { id: string; nombre: string; rol: Rol; lider_id: string | null }
/** Vista activa: 'rol:candidato' o el id de un perfil */
export interface VistaComo { objetivo: string; nombre: string; rol: Rol }

export interface EnlaceLider { token: string | null; activo: boolean; registros_enlace: number }
export interface DatosFormularioPublico {
  cedula: string; nombres: string; apellidos: string; sexo: Sexo | ''; fecha_nacimiento: string; edad: string;
  telefono: string; localidad_id: number | null; puesto_id: number | null; puesto_reportado: string;
  direccion_reportada: string; mesa: string; acepta: boolean;
}

export interface Resumen {
  personas: number;
  porRevisar: number;
  sinUbicacion: number;
}

export interface Demografia {
  localidad_id: number | null;
  localidad: string;
  puesto_id: number | null;
  puesto: string | null;
  rango_edad: string;
  sexo: string;
  personas: number;
}

export interface PuestoCenso {
  id: number;
  localidad_id: number;
  nombre: string;
  latitud: number | null;
  longitud: number | null;
  censo_mujeres: number;
  censo_hombres: number;
  censo_total: number;
}

export interface Tendencia { dia: string; nuevos: number }

// ── E14 ──
export type ModoDigitacion = 'simple' | 'doble';
export type EstadoMesa = 'pendiente' | 'una_digitacion' | 'en_revision' | 'verificado';
export interface Eleccion { id: string; nombre: string; fecha: string; modo_digitacion: ModoDigitacion }
export interface AvanceE14 { mesas: number; pendientes: number; una_digitacion: number; en_revision: number; verificadas: number }
export interface MesaPendiente { mesa_id: number; localidad: string; puesto: string; mesa: number; estado: EstadoMesa }
export interface MiDigitacion { id: number; mesa_id: number; localidad: string; puesto: string; mesa: number; votos: number; en: string; estado: EstadoMesa }
export interface MesaEnRevision { mesa_id: number; localidad: string; puesto: string; mesa: number; digitaciones: { votos: number; por: string; en: string }[] }
export interface TotalesE14 { esperados: number; confirmados: number; faltantes: number; adicionales: number; votos_reales: number; mesas: number; mesas_verificadas: number }
export interface LocalidadE14 extends TotalesE14 { localidad_id: number; localidad: string }
export interface PuestoE14 extends TotalesE14 { puesto_id: number; puesto: string; localidad_id: number; localidad: string }
export interface MesaE14 { mesa_id: number; mesa: number; puesto_id: number; estado: EstadoMesa; esperados: number; votos_reales: number | null; confirmados: number | null; faltantes: number | null; adicionales: number | null }
export interface FilaPlantillaE14 { localidad: string; zona: string; codigo_puesto: string; puesto: string; mesa: number }
export interface PuestoCodigos { id: number; localidad: string; zona: string; codigo: string; nombre: string; direccion: string | null; mesas_total: number }
export interface ResultadoFilaE14 { fila: number; estado: 'nueva' | 'cambia' | 'sin_cambios' | 'vacia' | 'error'; mensaje: string | null; mesa_id: number | null; votos: number | null }
export interface RegistrosMesa { localidad_id: number; localidad: string; puesto_id: number; puesto: string; mesa_id: number; mesa: number; personas: number }
export interface CalidadLider {
  lider_id: string; nombre: string; meta_votos: number; total: number; ubicados: number; sin_mesa: number; por_revisar: number;
  sin_lugar: number; sin_sexo: number; sin_edad: number; sin_telefono: number; sin_consentimiento: number; importados: number;
  ultimo_registro: string | null;
}
export interface PersonaExport extends PersonaFila { barrio: string | null; origen: string; mesa_confirmada: boolean }
export interface LiderE14 { lider_id: string; nombre: string; esperados: number; esperados_verificados: number | null; confirmados: number; mesas_pendientes: number; cumplimiento: number | null }

export interface Api {
  modo: 'real' | 'demo';
  // sesión
  sesion(): Promise<Sesion | null>;
  alCambiarSesion(cb: () => void): () => void;
  iniciarSesion(email: string, clave: string, rolDemo?: Rol): Promise<void>;
  cerrarSesion(): Promise<void>;
  cambiarClave(clave: string): Promise<void>;
  recuperarClave(email: string): Promise<void>;
  // catálogo
  localidades(): Promise<Localidad[]>;
  puestos(localidadId: number): Promise<Puesto[]>;
  sugerirPuesto(localidadId: number | null, nombre: string, direccion: string): Promise<Sugerencia | null>;
  // líderes
  lideres(): Promise<Lider[]>;
  crearLider(d: { nombre: string; cedula: string | null; telefono: string | null; meta: number; coordinadorId: string | null }): Promise<void>;
  coordinadores(): Promise<{ id: string; nombre: string }[]>;
  // personas
  registrarPersona(p: NuevaPersona): Promise<ResultadoRegistro>;
  personas(f: FiltroPersonas): Promise<{ filas: PersonaFila[]; total: number }>;
  eliminarPersona(id: string): Promise<void>;
  resumen(): Promise<Resumen>;
  demografia(): Promise<Demografia[]>;
  censoPuestos(): Promise<PuestoCenso[]>;
  tendencia(): Promise<Tendencia[]>;
  // revisión de puestos
  porRevisar(): Promise<GrupoRevision[]>;
  resolverUbicacion(personaId: string, puestoId: number): Promise<number>;
  // importación
  crearImportacion(d: { archivo: string; liderId: string | null; fechaDatos: string; consentimiento: boolean }): Promise<string>;
  cargarFilas(importacionId: string, filas: { fila: number; datos: Record<string, string> }[], progreso?: (n: number) => void): Promise<void>;
  validarImportacion(id: string): Promise<Importacion>;
  filasImportacion(id: string): Promise<FilaImportacion[]>;
  confirmarImportacion(id: string): Promise<Importacion>;
  cancelarImportacion(id: string): Promise<void>;
  // E14
  elecciones(): Promise<Eleccion[]>;
  crearEleccion(d: { nombre: string; fecha: string; modo: ModoDigitacion }): Promise<void>;
  avanceE14(eleccionId: string): Promise<AvanceE14 | null>;
  pendientesE14(eleccionId: string): Promise<MesaPendiente[]>;
  digitarE14(eleccionId: string, mesaId: number, votos: number): Promise<void>;
  misDigitaciones(eleccionId: string): Promise<MiDigitacion[]>;
  corregirDigitacion(id: number, votos: number): Promise<void>;
  revisionE14(eleccionId: string): Promise<MesaEnRevision[]>;
  resolverE14(eleccionId: string, mesaId: number, votos: number): Promise<void>;
  resultadosE14(eleccionId: string): Promise<{ localidades: LocalidadE14[]; puestos: PuestoE14[]; lideres: LiderE14[] }>;
  mesasE14(eleccionId: string, puestoId: number): Promise<MesaE14[]>;
  plantillaE14(eleccionId: string): Promise<FilaPlantillaE14[]>;
  puestosConCodigos(): Promise<PuestoCodigos[]>;
  importarE14(eleccionId: string, archivo: string, filas: Record<string, string | number>[], confirmar: boolean): Promise<ResultadoFilaE14[]>;
  // análisis y exportes
  registrosMesa(): Promise<RegistrosMesa[]>;
  calidadLideres(): Promise<CalidadLider[]>;
  personasTodas(f: Omit<FiltroPersonas, 'desde'>): Promise<PersonaFila[]>;
  registrarExportacion(tipo: string, filas: number, filtros?: Record<string, unknown>): Promise<void>;
  // equipo
  equipo(): Promise<MiembroEquipo[]>;
  vincularUsuario(email: string, nombre: string, rol: Rol, liderId: string | null): Promise<void>;
  desactivarUsuario(id: string): Promise<void>;
  reactivarUsuario(id: string): Promise<void>;
  cambiarRol(id: string, rol: Rol): Promise<void>;
  /** Envía el correo de invitación (función del servidor). Devuelve el mensaje para mostrar. */
  invitarUsuario(d: { email: string; nombre: string; rol: Rol; liderId: string | null }): Promise<string>;
  reenviarAcceso(id: string): Promise<string>;
  // ver como (solo admin)
  opcionesVerComo(): Promise<OpcionVerComo[]>;
  /** Activa o quita la vista de solo lectura; null = volver a ser admin */
  usarVistaComo(objetivo: string | null): Promise<void>;
  // seguimiento
  registrarContacto(personaId: string, resultado: ResultadoContacto, canal: 'llamada' | 'whatsapp' | 'visita' | 'otro', nota?: string): Promise<void>;
  seguimientoLideres(): Promise<SeguimientoLider[]>;
  // día D
  votosMarcados(eleccionId: string): Promise<Set<string>>;
  marcarVoto(eleccionId: string, personaId: string, voto: boolean): Promise<void>;
  diaD(eleccionId: string): Promise<DiaDFila[]>;
  // testigos
  testigos(eleccionId: string): Promise<Testigo[]>;
  coberturaTestigos(eleccionId: string): Promise<CoberturaMesa[]>;
  asignarTestigo(eleccionId: string, personaId: string, puestoId: number, mesas: number[]): Promise<void>;
  quitarTestigo(id: number): Promise<void>;
  // alertas de calidad
  alertasCalidad(): Promise<AlertaCalidad[]>;
  personasPorIds(ids: string[]): Promise<PersonaFila[]>;
  // en vivo: avisa cuando cambian registros o E14 en la organización
  alCambiarDatos(cb: (tema: 'registros' | 'e14') => void, alConectar?: (ok: boolean) => void): () => void;
  // enlace de registro del líder
  enlaceLider(liderId: string): Promise<EnlaceLider>;
  configurarEnlace(liderId: string, activo: boolean, regenerar: boolean): Promise<void>;
  enlaceInfo(token: string): Promise<{ lider: string; campana: string } | null>;
  registrarPorEnlace(token: string, d: DatosFormularioPublico): Promise<void>;
}
