export function edadDesde(fechaNacimiento: string | null, edad: number | null, edadEn: string | null): number | null {
  const hoy = new Date();
  if (fechaNacimiento) {
    const f = new Date(fechaNacimiento + 'T00:00:00');
    let e = hoy.getFullYear() - f.getFullYear();
    const m = hoy.getMonth() - f.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < f.getDate())) e--;
    return e;
  }
  if (edad != null) {
    const base = edadEn ? new Date(edadEn + 'T00:00:00') : hoy;
    const anos = Math.floor((hoy.getTime() - base.getTime()) / (365.25 * 24 * 3600 * 1000));
    return edad + Math.max(0, anos);
  }
  return null;
}

export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function soloDigitos(t: string): string {
  return t.replace(/\D/g, '');
}

export function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function formatoNumero(n: number): string {
  return n.toLocaleString('es-CO');
}

export function nombreCompleto(p: { nombres: string; apellidos?: string | null }): string {
  return [p.nombres, p.apellidos].filter(Boolean).join(' ');
}

/** Convierte errores de Supabase/Postgres en mensajes claros para el usuario. */
export function mensajeError(e: unknown): string {
  const err = e as { code?: string; message?: string; details?: string } | undefined;
  const msg = err?.message ?? String(e);
  if (err?.code === '23505' && /cedula/.test(msg + (err.details ?? ''))) return 'Esta cédula ya está registrada.';
  if (err?.code === '23505') return 'Ese dato ya existe.';
  if (err?.code === '42501' || /row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/Password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/personas_sexo_edad_obligatorios/.test(msg)) return 'Falta el sexo o la edad.';
  if (/check constraint/i.test(msg)) return 'Algún dato no tiene el formato correcto.';
  return msg;
}
