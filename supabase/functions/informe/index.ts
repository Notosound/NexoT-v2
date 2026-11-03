// Función "informe": resumen semanal de la campaña por correo.
//
//   POST { accion: 'enviar_todos' }  + encabezado x-informe-clave
//        La llama la base de datos (pg_cron) cada lunes. Envía el informe de
//        cada organización a sus administradores y al candidato.
//   POST { accion: 'probar' }        + sesión de un administrador o candidato
//        Envía el informe de su organización solo a quien lo pide.
//
// El correo sale por Resend con la clave RESEND_API_KEY (secreto de la
// función, nunca en el código ni en el navegador).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND = Deno.env.get('RESEND_API_KEY') ?? '';
const REMITENTE = Deno.env.get('INFORME_REMITENTE') ?? 'NexoT <no-responder@fulars.com>';
const PANEL = Deno.env.get('PANEL_URL') ?? 'https://nexot-v2.jonnathanpena1.workers.dev';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-informe-clave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors, 'Content-Type': 'application/json' } });

interface Informe {
  organizacion: string; total: number; nuevos_semana: number; nuevos_anterior: number; meta_total: number; avance_meta: number;
  esperado: number | null; confirmados: number; contactados: number; por_revisar: number; lideres: number;
  ranking: { nombre: string; n: number }[]; atrasados: { nombre: string; n: number; meta: number }[]; quietos: number;
  localidades: { nombre: string; n: number }[]; solicitudes_pendientes: number; solicitudes_vencidas: number;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const num = (n: number) => n.toLocaleString('es-CO');
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);

function html(i: Informe, nombre: string, rol: string): string {
  const delta = i.nuevos_semana - i.nuevos_anterior;
  const tendencia = delta > 0 ? `▲ ${num(delta)} más que la semana anterior` : delta < 0 ? `▼ ${num(-delta)} menos que la semana anterior` : 'igual que la semana anterior';
  const color = delta >= 0 ? '#15803d' : '#b91c1c';
  const cifra = (valor: string, texto: string, detalle = '') => `
    <td style="padding:12px;border:1px solid #e5e7f0;border-radius:12px;vertical-align:top;width:50%">
      <div style="font-size:26px;font-weight:800;color:#1f2347">${valor}</div>
      <div style="font-size:14px;color:#4b5068">${texto}</div>${detalle ? `<div style="font-size:12px;color:#7a7f99;margin-top:4px">${detalle}</div>` : ''}
    </td>`;
  const lista = (items: string[]) => items.length ? `<ul style="margin:6px 0 0;padding-left:18px;color:#2b2f4a;font-size:14px;line-height:1.6">${items.join('')}</ul>` : '';
  const pendientes: string[] = [];
  if (i.atrasados.length) pendientes.push(`<li><b>Líderes muy atrás de su meta:</b> ${i.atrasados.map((a) => `${esc(a.nombre)} (${num(a.n)} de ${num(a.meta)})`).join(', ')}.</li>`);
  if (i.quietos) pendientes.push(`<li><b>${num(i.quietos)} ${i.quietos === 1 ? 'líder no registra' : 'líderes no registran'}</b> a nadie hace una semana o más.</li>`);
  if (i.por_revisar && rol === 'admin') pendientes.push(`<li><b>${num(i.por_revisar)} personas</b> con el puesto de votación por revisar.</li>`);
  if (i.solicitudes_pendientes && rol === 'admin') pendientes.push(`<li><b>${num(i.solicitudes_pendientes)} ${i.solicitudes_pendientes === 1 ? 'solicitud' : 'solicitudes'} de datos personales</b> por atender${i.solicitudes_vencidas ? `, <span style="color:#b91c1c">${num(i.solicitudes_vencidas)} ya vencida${i.solicitudes_vencidas === 1 ? '' : 's'}</span>` : ''}.</li>`);

  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f5fb;font-family:Inter,Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5fb;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden">
    <tr><td style="background:linear-gradient(135deg,#667eea,#764ba2);padding:24px;color:#fff">
      <div style="font-size:13px;opacity:.85">Informe semanal · ${esc(i.organizacion)}</div>
      <div style="font-size:22px;font-weight:800;margin-top:4px">Hola, ${esc(nombre.split(' ')[0])}: así va la campaña</div>
    </td></tr>
    <tr><td style="padding:20px 20px 4px">
      <table role="presentation" width="100%" cellspacing="8" cellpadding="0"><tr>
        ${cifra(num(i.total), 'personas registradas', `<span style="color:${color}">+${num(i.nuevos_semana)} esta semana · ${tendencia}</span>`)}
        ${cifra(i.meta_total ? `${pct(i.avance_meta, i.meta_total)}%` : '—', 'de la meta de líderes', i.esperado != null ? `Hoy se debería llevar el ${Math.round(i.esperado * 100)}%` : `${num(i.avance_meta)} de ${num(i.meta_total)}`)}
      </tr><tr>
        ${cifra(`${pct(i.confirmados, i.total)}%`, 'confirmaron su apoyo', `${num(i.confirmados)} personas · ${pct(i.contactados, i.total)}% ya contactado`)}
        ${cifra(num(i.lideres), 'líderes activos', i.localidades.length ? `Más registros: ${i.localidades.map((l) => esc(l.nombre)).join(', ')}` : '')}
      </tr></table>
    </td></tr>
    ${i.ranking.length ? `<tr><td style="padding:8px 28px">
      <div style="font-size:16px;font-weight:700;color:#1f2347">🏆 Los que más registraron esta semana</div>
      ${lista(i.ranking.map((r, k) => `<li>${['🥇', '🥈', '🥉'][k]} ${esc(r.nombre)}: <b>${num(r.n)}</b></li>`))}
    </td></tr>` : ''}
    ${pendientes.length ? `<tr><td style="padding:8px 28px">
      <div style="font-size:16px;font-weight:700;color:#1f2347">Para atender esta semana</div>${lista(pendientes)}
    </td></tr>` : ''}
    <tr><td style="padding:16px 28px 24px">
      <a href="${PANEL}" style="display:inline-block;background:#667eea;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Abrir NexoT</a>
      <p style="font-size:12px;color:#7a7f99;margin:16px 0 0">Recibes este correo cada lunes. Puedes dejar de recibirlo en NexoT → Mi cuenta. Este correo no trae datos de ninguna persona registrada.</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

async function enviar(para: string, nombre: string, rol: string, i: Informe) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMITENTE, to: [para], subject: `Informe semanal · ${i.organizacion}: ${num(i.total)} registrados (+${num(i.nuevos_semana)})`, html: html(i, nombre, rol) }),
  });
  if (!r.ok) throw new Error(`Resend respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);
  if (!RESEND) return responder({ error: 'Falta configurar el envío de informes: agrega el secreto RESEND_API_KEY a las funciones de Supabase.' }, 503);
  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = await req.json(); } catch { /* vacío */ }
  const servicio = createClient(URL_SB, SERVICIO, { auth: { persistSession: false } });

  if (cuerpo.accion === 'enviar_todos') {
    const clave = req.headers.get('x-informe-clave') ?? '';
    const { data: valida } = await servicio.rpc('verificar_clave_informe', { p_clave: clave });
    if (!clave || valida !== true) return responder({ error: 'No autorizado' }, 401);
    const { data: orgs, error } = await servicio.from('organizaciones').select('id').eq('activa', true);
    if (error) return responder({ error: error.message }, 500);
    let enviados = 0;
    const fallos: string[] = [];
    for (const o of orgs ?? []) {
      const { data: inf } = await servicio.rpc('informe_semanal', { p_org: o.id });
      const { data: dest } = await servicio.rpc('destinatarios_informe', { p_org: o.id });
      for (const d of (dest ?? []) as { email: string; nombre: string; rol: string }[]) {
        try { await enviar(d.email, d.nombre, d.rol, inf as Informe); enviados++; } catch (e) { fallos.push(String((e as Error).message)); }
      }
    }
    return responder({ ok: true, enviados, fallos: fallos.length });
  }

  if (cuerpo.accion === 'probar') {
    const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user?.email) return responder({ error: 'Inicia sesión de nuevo' }, 401);
    const { data: yo } = await comoUsuario.from('perfiles').select('nombre, rol, activo, organizacion_id').eq('id', user.id).maybeSingle();
    if (!yo?.activo || !['admin', 'candidato'].includes(yo.rol)) return responder({ error: 'El informe es para administradores y el candidato' }, 403);
    const { data: inf, error } = await servicio.rpc('informe_semanal', { p_org: yo.organizacion_id });
    if (error) return responder({ error: error.message }, 500);
    try { await enviar(user.email, yo.nombre, yo.rol, inf as Informe); } catch (e) { return responder({ error: (e as Error).message }, 502); }
    return responder({ ok: true, mensaje: `Te enviamos el informe a ${user.email}.` });
  }

  return responder({ error: 'Acción desconocida' }, 400);
});
