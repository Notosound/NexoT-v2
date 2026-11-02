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
}

export interface FiltroPersonas {
  texto: string;
  estado: EstadoUbicacion | '';
  desde: number;
}

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
  // equipo
  equipo(): Promise<MiembroEquipo[]>;
  vincularUsuario(email: string, nombre: string, rol: Rol, liderId: string | null): Promise<void>;
  desactivarUsuario(id: string): Promise<void>;
}
