import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { stripeRouter, stripeWebhook } from './routes/stripe.js'
import { paypalRouter, paypalWebhook } from './routes/paypal.js'

const app = express()

// Stripe webhook necesita raw body — debe ir ANTES del json parser
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }), stripeWebhook)
app.post('/api/paypal/webhook',
  express.raw({ type: 'application/json' }), paypalWebhook)

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }))

app.use('/api/stripe', stripeRouter)
app.use('/api/paypal', paypalRouter)

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`🚀 ArrowBudget API en http://localhost:${PORT}`)
})
