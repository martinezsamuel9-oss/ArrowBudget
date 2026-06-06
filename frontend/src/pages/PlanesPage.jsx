import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/* ─── Paddle price IDs ─── */
const PADDLE_PRICES = {
  intermedio: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_INTERMEDIO_MONTHLY || '',
    yearly:  import.meta.env.VITE_PADDLE_PRICE_INTERMEDIO_YEARLY  || '',
  },
  experto: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_AVANZADO_MONTHLY || '',
    yearly:  import.meta.env.VITE_PADDLE_PRICE_AVANZADO_YEARLY  || '',
  },
  enterprise: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_ENTERPRISE_MONTHLY || '',
    yearly:  import.meta.env.VITE_PADDLE_PRICE_ENTERPRISE_YEARLY  || '',
  },
}

/* ─── Plan data ─── */
const PLANS = [
  {
    id: 'intermedio',
    name: 'Intermedio',
    tagline: 'Para equipos pequeños que dejan atrás el Excel.',
    monthly: 29.99,
    annual:  23.99,
    proyectos: '5',
    usuarios:  '5',
    features: [
      '5 proyectos activos',
      '5 usuarios',
      'Fichas ilimitadas',
      'Exportación PDF y Excel',
      'Explosión de insumos',
      'Soporte por email',
    ],
    cta:  'Comenzar prueba gratis',
    kind: 'subscribe',
  },
  {
    id: 'experto',
    name: 'Experto',
    tagline: 'El favorito de las constructoras en crecimiento.',
    monthly: 59.99,
    annual:  47.99,
    proyectos: '10',
    usuarios:  '10',
    popular: true,
    features: [
      '10 proyectos activos',
      '10 usuarios',
      'Todo lo de Intermedio',
      'Plantillas de catálogo',
      'Logo personalizado',
      'Soporte prioritario',
    ],
    cta:  'Comenzar prueba gratis',
    kind: 'subscribe',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Operaciones a gran escala con control total.',
    monthly: 119.99,
    annual:  95.99,
    proyectos: '40',
    usuarios:  '20',
    features: [
      '40 proyectos activos',
      '20 usuarios',
      'Todo lo de Experto',
      'Acceso a la API',
      'Onboarding personalizado',
      'SLA garantizado de 99.9%',
    ],
    cta:  'Contactar ventas',
    kind: 'contact',
  },
]

/* ─── Icons ─── */
const Check = ({ className = '' }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <path d="M5 10.5l3.2 3.2L15 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ArrowLogo = ({ className = '' }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="url(#ab-g)" />
    <path d="M9 16.5l5 5 9-11" stroke="#0A1322" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id="ab-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop stopColor="#E6BF55" /><stop offset="1" stopColor="#C9A347" />
      </linearGradient>
    </defs>
  </svg>
)

/* ─── Paddle loader ─── */
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

/* ─── Nav ─── */
function Nav() {
  const navigate = useNavigate()
  return (
    <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
      <a href="/" className="flex items-center gap-3">
        <ArrowLogo className="h-9 w-9" />
        <div className="leading-tight">
          <div className="font-display text-lg font-700 text-white">
            Arrow <span className="text-gold">Budget</span>
          </div>
          <div className="text-[10px] font-600 uppercase tracking-[0.22em] text-slate-400">Suite Arrow · INNOVA 504</div>
        </div>
      </a>
      <nav className="hidden items-center gap-8 md:flex">
        <a href="#planes" className="text-sm font-500 text-gold transition-colors hover:text-white">Planes</a>
      </nav>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/login')}
          className="hidden text-sm font-600 text-slate-200 transition-colors hover:text-white sm:block">
          Iniciar sesión
        </button>
        <a href="#planes"
          className="rounded-lg bg-gold px-4 py-2.5 text-sm font-700 text-navy-deep transition-transform hover:-translate-y-0.5">
          Prueba gratis
        </a>
      </div>
    </header>
  )
}

/* ─── Billing toggle ─── */
function BillingToggle({ annual, setAnnual }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-navy-surface/70 p-1 backdrop-blur">
      <button onClick={() => setAnnual(false)}
        className={`rounded-full px-6 py-2.5 text-sm font-600 transition-all
          ${!annual ? 'bg-gold text-navy-deep shadow-lg shadow-gold/20' : 'text-slate-300 hover:text-white'}`}>
        Mensual
      </button>
      <button onClick={() => setAnnual(true)}
        className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-600 transition-all
          ${annual ? 'bg-gold text-navy-deep shadow-lg shadow-gold/20' : 'text-slate-300 hover:text-white'}`}>
        Anual
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-700
          ${annual ? 'bg-navy-deep/20 text-navy-deep' : 'bg-gold/15 text-gold'}`}>
          −20%
        </span>
      </button>
    </div>
  )
}

/* ─── Plan card ─── */
function PlanCard({ plan, annual, onSubscribe, busy }) {
  const price = annual ? plan.annual : plan.monthly
  const [dollars, cents] = price.toFixed(2).split('.')
  const popular = plan.popular

  return (
    <div className={`relative flex flex-col rounded-3xl p-7 transition-transform duration-300 lg:p-8
      ${popular
        ? 'bg-gradient-to-b from-navy-surface to-navy z-10 lg:-my-4 lg:scale-[1.04] ring-1 ring-gold/70 shadow-2xl shadow-gold/10'
        : 'bg-white/[0.03] ring-1 ring-white/10 hover:ring-white/20'}`}>

      {popular && (
        <>
          <div className="pointer-events-none absolute -inset-px -z-10 rounded-3xl bg-gradient-to-b from-gold/30 to-transparent opacity-60 blur-xl" />
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
            <span className="rounded-full bg-gold px-4 py-1.5 text-[11px] font-800 uppercase tracking-[0.14em] text-navy-deep shadow-lg shadow-gold/30">
              Más popular
            </span>
          </div>
        </>
      )}

      <div className="mb-5">
        <h3 className="font-display text-2xl font-700 text-white">{plan.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{plan.tagline}</p>
      </div>

      <div className="mb-6">
        <div className="flex items-end gap-1">
          <span className="font-display text-2xl font-600 text-gold">$</span>
          <span className="font-display text-5xl font-700 leading-none tracking-tight text-gold">{dollars}</span>
          <span className="font-display text-2xl font-600 text-gold">.{cents}</span>
          <span className="mb-1 ml-1 text-sm font-500 text-slate-400">/mes</span>
        </div>
        <p className="mt-2 h-4 text-xs text-slate-500">
          {annual ? `Facturado $${(price * 12).toFixed(2)} al año` : 'Facturación mensual · sin contrato'}
        </p>
      </div>

      {/* Capacity */}
      <div className={`mb-6 grid grid-cols-2 divide-x overflow-hidden rounded-xl
        ${popular ? 'divide-white/10 bg-navy-deep/60' : 'divide-white/10 bg-black/20'}`}>
        <div className="px-4 py-3 text-center">
          <div className="font-display text-2xl font-700 text-gold">{plan.proyectos}</div>
          <div className="text-[11px] font-500 uppercase tracking-wide text-slate-400">proyectos</div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="font-display text-2xl font-700 text-gold">{plan.usuarios}</div>
          <div className="text-[11px] font-500 uppercase tracking-wide text-slate-400">usuarios</div>
        </div>
      </div>

      {/* Features */}
      <ul className="mb-8 flex flex-col gap-3.5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm text-slate-200">
            <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full
              ${popular ? 'bg-gold text-navy-deep' : 'bg-gold/15 text-gold'}`}>
              <Check className="h-3.5 w-3.5" />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        <button
          onClick={() => onSubscribe(plan)}
          disabled={busy === plan.id}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-700 transition-all
            ${plan.kind === 'contact'
              ? 'border border-gold/40 bg-transparent text-gold hover:bg-gold/10'
              : popular
                ? 'bg-gold text-navy-deep hover:-translate-y-0.5 hover:shadow-xl hover:shadow-gold/20'
                : 'bg-white/10 text-white hover:bg-white/15'}
            disabled:opacity-60 disabled:cursor-not-allowed`}>
          {busy === plan.id ? 'Un momento…' : plan.cta}
          {busy !== plan.id && <span aria-hidden="true">→</span>}
        </button>
        {plan.kind !== 'contact' && (
          <p className="mt-3 text-center text-[11px] text-slate-500">7 días gratis · no se requiere tarjeta</p>
        )}
      </div>
    </div>
  )
}

/* ─── Trust strip ─── */
function TrustStrip() {
  const items = [
    { t: 'Pagos seguros con Paddle', d: 'Procesamiento PCI-DSS' },
    { t: 'Cancela cuando quieras',   d: 'Desde tu perfil, sin llamadas' },
    { t: 'Política de reembolso',    d: 'Garantía de 14 días' },
    { t: 'Datos en la nube',         d: 'Respaldo automático diario' },
  ]
  return (
    <div className="mx-auto mt-20 max-w-5xl px-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 rounded-2xl border border-white/10 bg-white/[0.02] p-8 md:grid-cols-4">
        {items.map((i) => (
          <div key={i.t} className="flex flex-col items-center text-center md:items-start md:text-left">
            <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
              <Check className="h-5 w-5" />
            </span>
            <div className="text-sm font-600 text-white">{i.t}</div>
            <div className="text-xs text-slate-400">{i.d}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Enterprise band ─── */
function EnterpriseBand() {
  return (
    <div className="mx-auto mt-8 max-w-5xl px-6" id="contacto">
      <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-gold/20 bg-gradient-to-r from-navy-surface to-navy p-8 md:flex-row md:items-center">
        <div>
          <h3 className="font-display text-xl font-700 text-white">¿Necesitas más proyectos o usuarios?</h3>
          <p className="mt-1.5 max-w-xl text-sm text-slate-400">
            Diseñamos planes a medida para constructoras y desarrolladoras con operaciones grandes. Hablemos de volumen, integraciones y facturación corporativa.
          </p>
        </div>
        <a href="mailto:info@innova504.com?subject=Enterprise Arrow Budget"
          className="flex-none rounded-xl border border-gold/40 px-6 py-3.5 text-sm font-700 text-gold transition-colors hover:bg-gold/10">
          Contactar al equipo de ventas →
        </a>
      </div>
    </div>
  )
}

/* ─── Suite footer ─── */
function SuiteFooter() {
  const apps = [
    { n: 'Arrow',           d: 'Gestión de obras',         live: true,  here: false },
    { n: 'Arrow Budget',    d: 'Presupuestos',              live: true,  here: true  },
    { n: 'Arrow Dovehawks', d: '',                           live: false, here: false },
  ]
  return (
    <footer className="relative z-10 mt-24 border-t border-white/10">
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
        <div className="mb-12">
          <div className="text-[11px] font-600 uppercase tracking-[0.22em] text-slate-500">Una suite, una obra completa</div>
          <h3 className="mt-3 font-display text-2xl font-700 text-white">El ecosistema Arrow</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {apps.map((a) => (
            <div key={a.n} className={`flex items-center gap-4 rounded-2xl border p-5
              ${a.here ? 'border-gold/40 bg-gold/[0.04]' : 'border-white/10 bg-white/[0.02]'}`}>
              <ArrowLogo className="h-10 w-10 flex-none" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-display font-700 text-white">{a.n}</span>
                  {a.here && (
                    <span className="rounded bg-gold px-1.5 py-0.5 text-[9px] font-700 uppercase text-navy-deep">Aquí</span>
                  )}
                </div>
                <div className="text-xs text-slate-400">{a.d}</div>
              </div>
              <span className={`text-[11px] font-600 ${a.live ? 'text-emerald-400' : 'text-slate-500'}`}>
                {a.live ? '● Activo' : 'Próximo'}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs text-slate-500 md:flex-row">
          <div className="flex items-center gap-3">
            <ArrowLogo className="h-6 w-6" />
            <span>© 2026 INNOVA 504 · Construcción + Tecnología · 🇸🇻 🇭🇳</span>
          </div>
          <div className="flex gap-6">
            <a href="/terminos.html"   className="hover:text-slate-300">Términos</a>
            <a href="/privacidad.html" className="hover:text-slate-300">Privacidad</a>
            <a href="/reembolso.html"  className="hover:text-slate-300">Reembolsos</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ─── Page ─── */
export default function PlanesPage() {
  const [annual, setAnnual] = useState(false)
  const [busy, setBusy]     = useState(null)

  const handleSubscribe = async (plan) => {
    if (plan.kind === 'contact') {
      window.location.href = 'mailto:info@innova504.com?subject=Enterprise Arrow Budget'
      return
    }
    const billing  = annual ? 'yearly' : 'monthly'
    const priceId  = PADDLE_PRICES[plan.id]?.[billing]
    if (!priceId) { alert('Precio no configurado. Contacta a soporte.'); return }
    setBusy(plan.id)
    try {
      await loadPaddleJs()
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        successUrl: `${window.location.origin}/?checkout=success`,
      })
    } catch { alert('No se pudo abrir el checkout. Intenta de nuevo.') }
    setBusy(null)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-navy-deep font-sans">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute left-1/2 top-[-10%] h-[600px] w-[900px] rounded-full bg-gold/10 blur-[140px] animate-glow" />
        <div className="absolute right-[-5%] top-[30%] h-[400px] w-[400px] rounded-full bg-blue-500/10 blur-[120px]" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden="true">
          <defs>
            <pattern id="bg-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(201,163,71,0.12)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg-grid)" />
        </svg>
      </div>

      <div className="relative z-10">
        <Nav />

        {/* Header */}
        <section id="planes" className="mx-auto max-w-3xl px-6 pt-12 text-center lg:pt-20">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/[0.06] px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            <span className="text-xs font-600 uppercase tracking-[0.16em] text-gold">Presupuestos de construcción</span>
          </div>
          <h1 className="font-display text-5xl font-700 leading-[0.95] tracking-tight text-white sm:text-6xl">
            Elige tu plan
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-400">
            7 días de prueba gratis · Sin contrato · Cancela cuando quieras. Precios en USD.
          </p>
          <div className="mt-9 flex justify-center">
            <BillingToggle annual={annual} setAnnual={setAnnual} />
          </div>
        </section>

        {/* Cards */}
        <section className="mx-auto mt-12 grid max-w-6xl gap-6 px-6 lg:mt-16 lg:grid-cols-3 lg:items-center lg:gap-7">
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} annual={annual} onSubscribe={handleSubscribe} busy={busy} />
          ))}
        </section>

        <TrustStrip />
        <EnterpriseBand />
        <SuiteFooter />
      </div>
    </div>
  )
}
