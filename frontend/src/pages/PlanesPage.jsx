import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

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

const PLAN_FEATURES = {
  intermedio: ['5 proyectos', '5 usuarios', 'Fichas ilimitadas', 'Exportación PDF y Excel', 'Explosión de Insumos', 'Soporte por email'],
  avanzado:   ['10 proyectos', '10 usuarios', 'Todo Intermedio', 'Plantillas catálogo', 'Logo personalizado', 'Soporte prioritario'],
  enterprise: ['40 proyectos', '20 usuarios', 'Todo Avanzado', 'Acceso API', 'Onboarding personalizado', 'SLA 99.9%'],
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
    if (!priceId) { alert('Configuración de precio no disponible. Contacta a soporte.'); return }
    setBusy(planId)
    try {
      await loadPaddleJs()
      const opts = { items: [{ priceId, quantity: 1 }], successUrl: `${window.location.origin}/?checkout=success` }
      if (user?.email) opts.customer = { email: user.email }
      window.Paddle.Checkout.open(opts)
    } catch { alert('No se pudo abrir el checkout. Intenta de nuevo.') }
    setBusy(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#161c28', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,.07)', padding: '18px 32px' }}>
        <span style={{ color: '#fff', fontWeight: 900, fontSize: 20, letterSpacing: 1 }}>
          ARROW <span style={{ color: '#f59e0b' }}>BUDGET</span>
        </span>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '56px 24px 80px' }}>

        {/* Título */}
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <h1 style={{ color: '#fff', fontSize: 38, fontWeight: 800, margin: '0 0 10px' }}>
            Elige tu plan
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 15, margin: 0 }}>
            7 días de prueba gratis · Sin contrato · Cancela cuando quieras
          </p>

          {/* Toggle */}
          <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 999, padding: 4, marginTop: 24, gap: 4 }}>
            {[['monthly','Mensual'], ['yearly','Anual']].map(([val, label]) => (
              <button key={val} onClick={() => setBilling(val)} style={{
                padding: '8px 24px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 14,
                background: billing === val ? '#f59e0b' : 'transparent',
                color: billing === val ? '#0f1115' : '#94a3b8',
              }}>
                {label}{val === 'yearly' && <span style={{ fontSize: 12, marginLeft: 5 }}>-20%</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, alignItems: 'start' }}>
          {PLAN_ORDER.map(pid => {
            const p = planes.find(x => x.id === pid)
            if (!p) return null
            const rec = pid === 'avanzado'
            const precio = billing === 'monthly' ? p.precio_mensual : p.precio_anual
            const periodo = billing === 'monthly' ? '/mes' : '/año'

            return (
              <div key={pid} style={{
                background: 'rgba(255,255,255,.06)',
                border: `2px solid ${rec ? '#f59e0b' : 'rgba(255,255,255,.1)'}`,
                borderRadius: 16,
                padding: '28px 24px 24px',
                position: 'relative',
                backdropFilter: 'blur(8px)',
              }}>
                {rec && (
                  <div style={{
                    position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                    background: '#f59e0b', color: '#0f1115', fontSize: 11, fontWeight: 800,
                    padding: '3px 16px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: 1,
                  }}>
                    MÁS POPULAR
                  </div>
                )}

                {/* Nombre */}
                <div style={{ fontWeight: 800, fontSize: 22, color: '#f1f5f9', marginBottom: 12 }}>
                  {p.nombre}
                </div>

                {/* Precio */}
                <div style={{ marginBottom: 20 }}>
                  <span style={{ color: '#f59e0b', fontWeight: 900, fontSize: 44 }}>${precio}</span>
                  <span style={{ color: '#64748b', fontSize: 14, marginLeft: 4 }}>{periodo}</span>
                </div>

                {/* Proyectos / Usuarios */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                  {[['proyectos', p.max_proyectos], ['usuarios', p.max_usuarios]].map(([lbl, val]) => (
                    <div key={lbl} style={{
                      flex: 1, background: 'rgba(0,0,0,.3)', borderRadius: 10,
                      padding: '12px 0', textAlign: 'center',
                    }}>
                      <div style={{ color: '#f59e0b', fontWeight: 900, fontSize: 28 }}>{val}</div>
                      <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{lbl}</div>
                    </div>
                  ))}
                </div>

                {/* Features */}
                <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0 }}>
                  {PLAN_FEATURES[pid].map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 15 }}>✓</span>
                      <span style={{ color: '#e2e8f0', fontSize: 14 }}>{f}</span>
                    </li>
                  ))}
                </ul>

                <button onClick={() => handleCheckout(pid)} disabled={busy === pid} style={{
                  width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
                  fontWeight: 700, fontSize: 15, cursor: busy === pid ? 'not-allowed' : 'pointer',
                  background: rec ? '#f59e0b' : 'rgba(255,255,255,.1)',
                  color: rec ? '#0f1115' : '#e2e8f0',
                  opacity: busy === pid ? .7 : 1,
                }}>
                  {busy === pid ? 'Abriendo checkout…' : 'Suscribirme'}
                </button>
              </div>
            )
          })}
        </div>

        <p style={{ textAlign: 'center', color: '#475569', fontSize: 13, marginTop: 36 }}>
          Pagos procesados de forma segura por{' '}
          <a href="https://paddle.com" target="_blank" rel="noreferrer" style={{ color: '#64748b' }}>Paddle</a>
          {' '}· Cancela desde tu perfil en cualquier momento ·{' '}
          <a href="/reembolso.html" style={{ color: '#64748b' }}>Política de reembolso</a>
        </p>
      </div>
    </div>
  )
}
