import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// Price IDs de Paddle (configurar en Cloudflare Pages → Settings → Environment Variables)
const PADDLE_PRICES = {
  intermedio: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_INTERMEDIO_MONTHLY || '',
    yearly:  import.meta.env.VITE_PADDLE_PRICE_INTERMEDIO_YEARLY  || '',
  },
  avanzado: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_AVANZADO_MONTHLY || '',
    yearly:  import.meta.env.VITE_PADDLE_PRICE_AVANZADO_YEARLY  || '',
  },
  enterprise: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_ENTERPRISE_MONTHLY || '',
    yearly:  import.meta.env.VITE_PADDLE_PRICE_ENTERPRISE_YEARLY  || '',
  },
}

const PLAN_ORDER = ['intermedio', 'avanzado', 'enterprise']

function loadPaddleJs() {
  if (window.Paddle) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'
    s.onload = () => {
      window.Paddle.Initialize({ token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN || '' })
      resolve()
    }
    s.onerror = reject
    document.head.appendChild(s)
  })
}

export default function PlanesPage() {
  const { user } = useAuth()
  const [planes, setPlanes]   = useState([])
  const [billing, setBilling] = useState('monthly')
  const [busy, setBusy]       = useState(null)

  useEffect(() => {
    supabase.from('planes')
      .select('*')
      .in('id', PLAN_ORDER)
      .eq('activo', true)
      .order('orden')
      .then(({ data }) => setPlanes(data || []))
  }, [])

  const handleCheckout = async (planId) => {
    const priceId = PADDLE_PRICES[planId]?.[billing]
    if (!priceId) {
      alert('Configuración de precio no disponible. Contacta a soporte.')
      return
    }
    setBusy(planId)
    try {
      await loadPaddleJs()
      const opts = {
        items: [{ priceId, quantity: 1 }],
        successUrl: `${window.location.origin}/?checkout=success`,
      }
      if (user?.email) opts.customer = { email: user.email }
      window.Paddle.Checkout.open(opts)
    } catch (e) {
      alert('No se pudo abrir el checkout. Intenta de nuevo.')
    }
    setBusy(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1c2130', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>

      {/* Header */}
      <div style={{ borderBottom: '1px solid #2d3448', padding: '18px 32px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 20, letterSpacing: 1 }}>
          ARROW <span style={{ color: '#f59e0b' }}>BUDGET</span>
        </span>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '56px 24px 80px' }}>

        {/* Título */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ color: '#fff', fontSize: 36, fontWeight: 800, marginBottom: 10 }}>
            Elige tu plan
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 16 }}>
            7 días de prueba gratis · Sin contrato · Cancela cuando quieras
          </p>

          {/* Toggle mensual/anual */}
          <div style={{
            display: 'inline-flex', background: '#252d40', border: '1px solid #3a4260',
            borderRadius: 999, padding: 4, marginTop: 24, gap: 4,
          }}>
            {['monthly', 'yearly'].map(b => (
              <button key={b} onClick={() => setBilling(b)} style={{
                padding: '8px 22px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 14, transition: 'all .15s',
                background: billing === b ? '#f59e0b' : 'transparent',
                color: billing === b ? '#0f1115' : '#94a3b8',
              }}>
                {b === 'monthly' ? 'Mensual' : 'Anual'}{b === 'yearly' && <span style={{ fontSize: 12, marginLeft: 4 }}>-20%</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {PLAN_ORDER.map(pid => {
            const p = planes.find(x => x.id === pid)
            if (!p) return null
            const isRecomendado = pid === 'avanzado'
            const precio = billing === 'monthly' ? p.precio_mensual : p.precio_anual
            const periodo = billing === 'monthly' ? '/mes' : '/año'

            return (
              <div key={pid} style={{
                background: isRecomendado ? '#252d40' : '#202636',
                border: `2px solid ${isRecomendado ? '#f59e0b' : '#2d3448'}`,
                borderRadius: 16, padding: '28px 24px', position: 'relative',
              }}>
                {isRecomendado && (
                  <div style={{
                    position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                    background: '#f59e0b', color: '#0f1115', fontSize: 12, fontWeight: 800,
                    padding: '3px 14px', borderRadius: 999, whiteSpace: 'nowrap',
                  }}>
                    MÁS POPULAR
                  </div>
                )}

                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>{p.nombre}</span>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: 38 }}>${precio}</span>
                  <span style={{ color: '#64748b', fontSize: 14, marginLeft: 4 }}>{periodo}</span>
                </div>

                {/* Límites */}
                <div style={{
                  background: '#161c2a', borderRadius: 8, padding: '10px 14px',
                  marginBottom: 16, display: 'flex', gap: 20,
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: 20 }}>{p.max_proyectos}</div>
                    <div style={{ color: '#64748b', fontSize: 11 }}>proyectos</div>
                  </div>
                  <div style={{ width: 1, background: '#1e2229' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: 20 }}>{p.max_usuarios}</div>
                    <div style={{ color: '#64748b', fontSize: 11 }}>usuarios</div>
                  </div>
                </div>

                {/* Botón Paddle */}
                <button
                  onClick={() => handleCheckout(pid)}
                  disabled={busy === pid}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
                    fontWeight: 700, fontSize: 15, cursor: busy === pid ? 'not-allowed' : 'pointer',
                    background: isRecomendado ? '#f59e0b' : '#1e2229',
                    color: isRecomendado ? '#0f1115' : '#e2e8f0',
                    opacity: busy === pid ? 0.7 : 1, transition: 'opacity .15s',
                  }}
                >
                  {busy === pid ? 'Abriendo checkout…' : 'Suscribirme'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', color: '#475569', fontSize: 13, marginTop: 40 }}>
          Pagos procesados de forma segura por{' '}
          <a href="https://paddle.com" target="_blank" rel="noreferrer" style={{ color: '#64748b' }}>Paddle</a>
          {' '}· Cancela desde tu perfil en cualquier momento ·{' '}
          <a href="/reembolso.html" style={{ color: '#64748b' }}>Política de reembolso</a>
        </p>
      </div>
    </div>
  )
}
