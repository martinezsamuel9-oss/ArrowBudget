import express from 'express'
import { requireAuth, supabaseAdmin } from '../middleware/auth.js'

export const paypalRouter = express.Router()

const PAYPAL_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com'

async function getPaypalToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64')
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  return data.access_token
}

// POST /api/paypal/checkout — crea suscripción en PayPal y devuelve approval_url
paypalRouter.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { plan_id, billing_period } = req.body
    const { data: plan } = await supabaseAdmin.from('planes').select('*').eq('id', plan_id).single()
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' })

    const paypalPlanId = billing_period === 'yearly'
      ? plan.paypal_plan_id_yearly
      : plan.paypal_plan_id_monthly
    if (!paypalPlanId) return res.status(400).json({ error: 'PayPal Plan ID no configurado' })

    const token = await getPaypalToken()
    const resp = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan_id: paypalPlanId,
        subscriber: { email_address: req.user.email },
        custom_id: req.user.id,
        application_context: {
          brand_name: 'ArrowBudget',
          return_url: `${process.env.FRONTEND_URL}/?checkout=success`,
          cancel_url: `${process.env.FRONTEND_URL}/planes?checkout=cancel`,
        }
      })
    })
    const sub = await resp.json()
    const approveLink = sub.links?.find(l => l.rel === 'approve')?.href
    if (!approveLink) {
      return res.status(500).json({ error: 'PayPal no devolvió URL de aprobación', detail: sub })
    }

    // Pre-registrar la suscripción en estado incomplete
    await supabaseAdmin.from('subscriptions').insert({
      user_id: req.user.id,
      plan_id,
      billing_period,
      provider: 'paypal',
      provider_subscription_id: sub.id,
      status: 'incomplete',
    })

    res.json({ approval_url: approveLink })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
})

// POST /api/paypal/webhook
export async function paypalWebhook(req, res) {
  // En producción: verificar la firma con /v1/notifications/verify-webhook-signature
  const event = JSON.parse(req.body.toString())
  const subId = event?.resource?.id

  switch (event.event_type) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
      await supabaseAdmin.from('subscriptions').update({
        status: 'active',
        current_period_start: event.resource.start_time,
      }).eq('provider_subscription_id', subId)
      break
    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.EXPIRED':
      await supabaseAdmin.from('subscriptions').update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      }).eq('provider_subscription_id', subId)
      break
    case 'PAYMENT.SALE.COMPLETED':
      // Renovación cobrada — actualizar período si aplica
      break
  }
  res.json({ received: true })
}
