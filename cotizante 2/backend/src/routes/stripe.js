import express from 'express'
import Stripe from 'stripe'
import { requireAuth, supabaseAdmin } from '../middleware/auth.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
export const stripeRouter = express.Router()

// POST /api/stripe/checkout — crea Checkout Session
stripeRouter.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { plan_id, billing_period } = req.body
    const { data: plan } = await supabaseAdmin.from('planes').select('*').eq('id', plan_id).single()
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' })

    const priceId = billing_period === 'yearly'
      ? plan.stripe_price_id_yearly
      : plan.stripe_price_id_monthly
    if (!priceId) return res.status(400).json({ error: 'Price ID no configurado para este plan' })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: req.user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          supabase_user_id: req.user.id,
          plan_id, billing_period,
        }
      },
      success_url: `${process.env.FRONTEND_URL}/?checkout=success`,
      cancel_url: `${process.env.FRONTEND_URL}/planes?checkout=cancel`,
    })

    res.json({ url: session.url })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
})

// POST /api/stripe/webhook — eventos de Stripe
export async function stripeWebhook(req, res) {
  const sig = req.headers['stripe-signature']
  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`)
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object
      const meta = sub.metadata || {}
      await supabaseAdmin.from('subscriptions').upsert({
        user_id: meta.supabase_user_id,
        plan_id: meta.plan_id,
        billing_period: meta.billing_period,
        provider: 'stripe',
        provider_subscription_id: sub.id,
        provider_customer_id: sub.customer,
        status: sub.status,
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      }, { onConflict: 'provider_subscription_id' })
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      await supabaseAdmin.from('subscriptions').update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      }).eq('provider_subscription_id', sub.id)
      break
    }
  }

  res.json({ received: true })
}
