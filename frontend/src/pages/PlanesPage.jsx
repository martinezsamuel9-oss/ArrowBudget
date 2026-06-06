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

  const S = {
    page: {
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0f172a 0%, #1a2540 60%, #0f172a 100%)',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      display: 'flex', flexDirection: 'column',
    },
    header: {
      padding: '20px 40px',
      borderBottom: '1px solid rgba(255,255,255,.07)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    brand: { color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: 1 },
    brandAccent: { color: '#f59e0b' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 24px 80px' },
    eyebrow: { fontSize: 13, fontWeight: 700, color: '#f59e0b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 },
    h1: { fontSize: 42, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.15, textAlign: 'center' },
    sub: { color: '#94a3b8', fontSize: 16, marginTop: 14, textAlign: 'center' },
    toggleWrap: { display: 'flex', background: 'rgba(255,255,255,.07)', borderRadius: 999, padding: 4, marginTop: 32, gap: 2 },
    cards: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24, marginTop: 52, maxWidth: 1020, width: '100%' },
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <span style={S.brand}>ARROW <span style={S.brandAccent}>BUDGET</span></span>
        <a href="/login" style={{ color: '#94a3b8', fontSize: 14, textDecoration: 'none' }}>
          Iniciar sesión →
        </a>
      </div>

      <div style={S.main}>
        <div style={S.eyebrow}>Planes y precios</div>
        <h1 style={S.h1}>Simple. Transparente.<br />Sin sorpresas.</h1>
        <p style={S.sub}>7 días de prueba gratis · Sin tarjeta de crédito · Cancela cuando quieras</p>

        {/* Toggle */}
        <div style={S.toggleWrap}>
          {[['monthly','Mensual'], ['yearly','Anual']].map(([val, label]) => (
            <button key={val} onClick={() => setBilling(val)} style={{
              padding: '9px 26px', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 14, transition: 'all .2s',
              background: billing === val ? '#f59e0b' : 'transparent',
              color: billing === val ? '#0f172a' : '#94a3b8',
            }}>
              {label}{val === 'yearly' && <span style={{ fontSize: 12, marginLeft: 6, opacity: .85 }}>−20%</span>}
            </button>
          ))}
        </div>

        {/* Cards */}
        <div style={S.cards}>
          {PLAN_ORDER.map(pid => {
            const p = planes.find(x => x.id === pid)
            if (!p) return null
            const rec = pid === 'avanzado'
            const precio = billing === 'monthly' ? p.precio_mensual : p.precio_anual
            const periodo = billing === 'monthly' ? 'mes' : 'año'

            return (
              <div key={pid} style={{
                background: rec ? '#fff' : 'rgba(255,255,255,.05)',
                border: `1.5px solid ${rec ? '#f59e0b' : 'rgba(255,255,255,.1)'}`,
                borderRadius: 20,
                padding: '36px 32px 32px',
                position: 'relative',
                boxShadow: rec ? '0 24px 60px rgba(245,158,11,.25)' : '0 4px 24px rgba(0,0,0,.3)',
                transition: 'transform .2s',
              }}>

                {rec && (
                  <div style={{
                    position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                    background: '#f59e0b', color: '#0f172a', fontSize: 11, fontWeight: 900,
                    padding: '4px 16px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: 1,
                  }}>
                    MÁS POPULAR
                  </div>
                )}

                {/* Nombre */}
                <div style={{ fontWeight: 800, fontSize: 18, color: rec ? '#0f172a' : '#e2e8f0', marginBottom: 4 }}>
                  {p.nombre}
                </div>

                {/* Precio */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, margin: '18px 0 24px' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: rec ? '#64748b' : '#64748b', marginBottom: 8 }}>$</span>
                  <span style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, color: rec ? '#0f172a' : '#f1f5f9' }}>
                    {Math.floor(precio)}
                  </span>
                  <span style={{ fontSize: 15, color: rec ? '#64748b' : '#64748b', marginBottom: 6 }}>
                    .{String(precio).split('.')[1] || '00'} / {periodo}
                  </span>
                </div>

                {/* Separador */}
                <div style={{ height: 1, background: rec ? '#e2e8f0' : 'rgba(255,255,255,.08)', marginBottom: 24 }} />

                {/* Límites */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
                  {[['proyectos', p.max_proyectos], ['usuarios', p.max_usuarios]].map(([lbl, val]) => (
                    <div key={lbl} style={{
                      flex: 1, background: rec ? '#f8fafc' : 'rgba(255,255,255,.06)',
                      borderRadius: 12, padding: '14px 0', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: '#f59e0b' }}>{val}</div>
                      <div style={{ fontSize: 12, color: rec ? '#64748b' : '#64748b', marginTop: 2 }}>{lbl}</div>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button onClick={() => handleCheckout(pid)} disabled={busy === pid} style={{
                  width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                  fontWeight: 800, fontSize: 15, cursor: busy === pid ? 'not-allowed' : 'pointer',
                  background: rec ? '#f59e0b' : 'rgba(245,158,11,.15)',
                  color: rec ? '#0f172a' : '#f59e0b',
                  opacity: busy === pid ? .7 : 1, transition: 'opacity .15s, transform .15s',
                }}>
                  {busy === pid ? 'Abriendo checkout…' : 'Comenzar gratis'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <p style={{ color: '#475569', fontSize: 13, marginTop: 44, textAlign: 'center' }}>
          Pagos procesados de forma segura por{' '}
          <a href="https://paddle.com" target="_blank" rel="noreferrer" style={{ color: '#64748b' }}>Paddle</a>
          {' '}·{' '}
          <a href="/terminos.html" style={{ color: '#64748b' }}>Términos</a>
          {' '}·{' '}
          <a href="/reembolso.html" style={{ color: '#64748b' }}>Política de reembolso</a>
        </p>
      </div>
    </div>
  )
}
