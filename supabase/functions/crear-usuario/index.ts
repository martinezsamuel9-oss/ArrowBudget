// =====================================================================
// ARROW BUDGET — Edge Function: crear-usuario
//
// El gerente crea un usuario directamente (estilo Arrow móvil):
//   - genera una clave temporal
//   - crea la cuenta ya confirmada, con org/rol pre-asignados (vía
//     metadata que procesa el trigger handle_new_user)
//   - envía la clave temporal por correo (Resend) si hay API key;
//     si no, la devuelve para compartirla manualmente
//   - el usuario debe cambiar la clave en su primer ingreso
//     (metadata must_change_password → la app lo fuerza)
//
// DESPLIEGUE (Supabase Dashboard):
//   Edge Functions → Deploy new function → nombre: crear-usuario
//   → pegar este archivo → Deploy
//
// CORREO (opcional pero recomendado):
//   Edge Functions → crear-usuario → Secrets:
//     RESEND_API_KEY = re_xxxxx        (cuenta en resend.com, dominio verificado)
//     EMAIL_FROM     = Arrow Budget <no-reply@innova504.com>
//   Sin RESEND_API_KEY la función igual funciona: devuelve la clave
//   temporal y el gerente la comparte por WhatsApp/correo.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })

const ROLES_VALIDOS = ['gerente','ing_costos_1','ing_costos_2','ing_residente','supervisor','compras','administrador_empresa','cliente']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { email, nombre, rol } = await req.json()
    const mail = String(email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return json({ ok: false, error: 'Correo inválido' })
    if (!nombre || !String(nombre).trim())         return json({ ok: false, error: 'El nombre es obligatorio' })
    if (!ROLES_VALIDOS.includes(rol))              return json({ ok: false, error: 'Rol inválido' })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Identificar al solicitante y validar que sea gerente activo ──
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user: caller } } = await admin.auth.getUser(jwt)
    if (!caller) return json({ ok: false, error: 'No autenticado' })

    const { data: om } = await admin.from('org_members')
      .select('org_id').eq('user_id', caller.id)
      .eq('role', 'gerente').eq('status', 'activo')
      .limit(1).maybeSingle()
    if (!om) return json({ ok: false, error: 'Solo un gerente puede crear usuarios' })

    // ── Límite de usuarios del plan ──
    const { data: org } = await admin.from('organizations')
      .select('nombre, max_usuarios').eq('id', om.org_id).single()
    const { count } = await admin.from('org_members')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', om.org_id).eq('status', 'activo')
    if (org && count !== null && count >= (org.max_usuarios || 5)) {
      return json({ ok: false, error: `Alcanzaste el límite de ${org.max_usuarios} usuarios de tu plan` })
    }

    // ── Clave temporal legible (ej: AB-K4TR-7291) ──
    const temp = 'AB-' +
      Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[O0IL1]/g, 'X') +
      '-' + Math.floor(1000 + Math.random() * 9000)

    // ── Crear la cuenta confirmada y pre-asignada a la org ──
    // El trigger handle_new_user lee invited_to_org/invited_role y lo une
    // a la org del gerente en lugar de crearle una org propia.
    const { error: cErr } = await admin.auth.admin.createUser({
      email: mail,
      password: temp,
      email_confirm: true,
      user_metadata: {
        full_name: String(nombre).trim(),
        invited_to_org: om.org_id,
        invited_role: rol,
        invited_by: caller.id,
        must_change_password: true,
      },
    })
    if (cErr) {
      const msg = /already|registered|exists/i.test(cErr.message)
        ? 'Ya existe un usuario con ese correo'
        : cErr.message
      return json({ ok: false, error: msg })
    }

    // ── Enviar correo con la clave temporal (si hay Resend configurado) ──
    let emailSent = false
    const key = Deno.env.get('RESEND_API_KEY')
    if (key) {
      try {
        const from = Deno.env.get('EMAIL_FROM') || 'Arrow Budget <onboarding@resend.dev>'
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
            <h2 style="color:#0F1115;margin-top:0">Te crearon una cuenta en Arrow Budget</h2>
            <p style="color:#334155">Fuiste agregado a la organización <b>${org?.nombre || ''}</b>.</p>
            <table style="width:100%;background:#f8fafc;border-radius:8px;padding:8px;border-collapse:separate">
              <tr><td style="padding:8px 12px;color:#64748b">Usuario:</td><td style="padding:8px 12px"><b>${mail}</b></td></tr>
              <tr><td style="padding:8px 12px;color:#64748b">Clave temporal:</td><td style="padding:8px 12px"><b style="font-family:monospace;font-size:16px">${temp}</b></td></tr>
            </table>
            <p style="color:#334155">Al ingresar por primera vez el sistema te pedirá <b>cambiar la clave de inmediato</b>.</p>
            <a href="https://budget.innova504.com/login" style="display:inline-block;background:#F59E0B;color:#0F1115;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none">Iniciar sesión</a>
            <p style="color:#94a3b8;font-size:12px;margin-bottom:0">Si no esperabas este correo, ignóralo.</p>
          </div>`
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [mail], subject: 'Tu cuenta en Arrow Budget — clave temporal', html }),
        })
        emailSent = r.ok
      } catch { emailSent = false }
    }

    return json({ ok: true, emailSent, tempPassword: temp })
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) })
  }
})
