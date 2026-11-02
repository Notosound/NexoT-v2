// Función "equipo": invita usuarios y reenvía accesos desde el panel.
//
// Corre en el servidor de Supabase, donde vive la clave de servicio (nunca
// llega al navegador). Solo atiende a administradores activos y actúa
// siempre dentro de SU organización. El correo lo envía Supabase Auth por
// el SMTP configurado (Resend, desde el dominio de la campaña).
//
//   POST { accion: 'invitar', email, nombre, rol, lider_id?, redirect }
//   POST { accion: 'reenviar', usuario_id, redirect }
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ROLES = ['admin', 'coordinador', 'lider', 'digitador', 'candidato'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors, 'Content-Type': 'application/json' } });
const fallo = (mensaje: string, estado = 400) => responder({ error: mensaje }, estado);

// Solo se acepta volver al panel (https), nunca a otro sitio
function destino(redirect: unknown): string | undefined {
  try {
    const u = new URL(String(redirect));
    return u.protocol === 'https:' || u.hostname === 'localhost' ? `${u.origin}/cambiar-clave` : undefined;
  } catch { return undefined; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fallo('Método no permitido', 405);

  const autorizacion = req.headers.get('Authorization') ?? '';
  const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: autorizacion } }, auth: { persistSession: false } });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return fallo('Inicia sesión de nuevo', 401);
  const { data: yo } = await comoUsuario.from('perfiles').select('rol, activo, organizacion_id').eq('id', user.id).maybeSingle();
  if (!yo || !yo.activo || yo.rol !== 'admin') return fallo('Solo un administrador puede gestionar el equipo', 403);

  let cuerpo: Record<string, unknown>;
  try { cuerpo = await req.json(); } catch { return fallo('Petición inválida'); }
  const servicio = createClient(URL_SB, SERVICIO, { auth: { persistSession: false } });
  const redirectTo = destino(cuerpo.redirect);

  if (cuerpo.accion === 'invitar') {
    const email = String(cuerpo.email ?? '').trim().toLowerCase();
    const nombre = String(cuerpo.nombre ?? '').trim();
    const rol = String(cuerpo.rol ?? '');
    const liderId = cuerpo.lider_id ? String(cuerpo.lider_id) : null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fallo('Revisa el correo');
    if (!nombre) return fallo('Falta el nombre');
    if (!ROLES.includes(rol)) return fallo('Rol inválido');

    const { data: existente, error: e1 } = await comoUsuario.rpc('estado_correo', { p_email: email });
    if (e1) return fallo(e1.message);
    const previo = (existente as { usuario_id: string; organizacion_id: string | null; misma_org: boolean }[])[0];
    if (previo?.organizacion_id && !previo.misma_org) return fallo('Ese correo ya pertenece a otra organización');

    let creado: string | null = null;
    if (!previo) {
      const { data, error } = await servicio.auth.admin.inviteUserByEmail(email, { redirectTo, data: { nombre } });
      if (error) return fallo(`No se pudo enviar la invitación: ${error.message}`);
      creado = data.user.id;
    }
    const { error: e2 } = await comoUsuario.rpc('vincular_usuario', { p_email: email, p_nombre: nombre, p_rol: rol, p_lider: liderId });
    if (e2) {
      if (creado) await servicio.auth.admin.deleteUser(creado); // no dejar cuentas a medias
      return fallo(e2.message);
    }
    if (previo) {
      // Ya tenía cuenta: se le manda un enlace para entrar / poner clave
      await comoUsuario.auth.resetPasswordForEmail(email, { redirectTo });
      return responder({ ok: true, mensaje: `${nombre} ya tenía cuenta: quedó con el rol nuevo y le enviamos un enlace para entrar.` });
    }
    return responder({ ok: true, mensaje: `Invitación enviada a ${email}.` });
  }

  if (cuerpo.accion === 'reenviar') {
    const id = String(cuerpo.usuario_id ?? '');
    const { data: equipo, error } = await comoUsuario.rpc('equipo');
    if (error) return fallo(error.message);
    const miembro = (equipo as { id: string; email: string; acepto: boolean; nombre: string }[]).find((m) => m.id === id);
    if (!miembro) return fallo('Usuario no encontrado', 404);
    if (!miembro.acepto) {
      const r = await servicio.auth.admin.inviteUserByEmail(miembro.email, { redirectTo, data: { nombre: miembro.nombre } });
      if (r.error) {
        // Supabase no reenvía invitaciones a cuentas ya creadas: se manda enlace de acceso
        const r2 = await comoUsuario.auth.resetPasswordForEmail(miembro.email, { redirectTo });
        if (r2.error) return fallo(`No se pudo reenviar: ${r2.error.message}`);
      }
      return responder({ ok: true, mensaje: `Reenviamos el acceso a ${miembro.email}.` });
    }
    const r = await comoUsuario.auth.resetPasswordForEmail(miembro.email, { redirectTo });
    if (r.error) return fallo(`No se pudo enviar: ${r.error.message}`);
    return responder({ ok: true, mensaje: `Le enviamos a ${miembro.email} un enlace para poner una contraseña nueva.` });
  }

  return fallo('Acción desconocida');
});
