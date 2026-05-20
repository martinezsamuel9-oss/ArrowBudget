import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function PlanesPage() {
  const { user } = useAuth()
  const [planes, setPlanes] = useState([])
  const [billing, setBilling] = useState('monthly')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    supabase.from('planes').select('*').eq('activo', true).order('orden')
      .then(({ data }) => setPlanes(data || []))
  }, [])

  const checkout = async (planId, provider) => {
    setBusy(`${planId}-${provider}`)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API}/api/${provider}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan_id: planId, billing_period: billing }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else if (data.approval_url) window.location.href = data.approval_url
      else alert('No se pudo iniciar el pago')
    } catch (e) {
      alert(e.message)
    }
    setBusy(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <Link to="/" className="text-blue-700 text-sm">← Volver</Link>
        <div className="text-center mb-8 mt-2">
          <h1 className="text-3xl font-bold text-slate-800">Elige tu plan</h1>
          <p className="text-gray-600 mt-2">Comenzá gratis 7 días. Cancelá cuando quieras.</p>
          <div className="inline-flex bg-white border rounded-full p-1 mt-4">
            <button onClick={() => setBilling('monthly')}
              className={`px-4 py-1.5 rounded-full text-sm ${billing === 'monthly' ? 'bg-blue-700 text-white' : 'text-gray-600'}`}>
              Mensual
            </button>
            <button onClick={() => setBilling('yearly')}
              className={`px-4 py-1.5 rounded-full text-sm ${billing === 'yearly' ? 'bg-blue-700 text-white' : 'text-gray-600'}`}>
              Anual <span className="text-xs">(-20%)</span>
            </button>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {planes.map(p => (
            <div key={p.id} className={`bg-white rounded-xl border-2 p-6 ${p.id === 'pro' ? 'border-blue-600 ring-2 ring-blue-500' : 'border-gray-200'}`}>
              <h3 className="font-bold text-lg">{p.nombre}</h3>
              <div className="my-3">
                <span className="text-4xl font-bold">${billing === 'monthly' ? p.precio_mensual : p.precio_anual}</span>
                <span className="text-gray-500 text-sm">/{billing === 'monthly' ? 'mes' : 'año'}</span>
              </div>
              <ul className="space-y-2 text-sm text-gray-700 mb-6">
                {(p.features || []).map(f => <li key={f}>✓ {f}</li>)}
              </ul>
              <div className="space-y-2">
                <button onClick={() => checkout(p.id, 'stripe')} disabled={busy === `${p.id}-stripe`}
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white py-2 rounded font-semibold disabled:opacity-60">
                  {busy === `${p.id}-stripe` ? 'Procesando…' : 'Pagar con Stripe'}
                </button>
                <button onClick={() => checkout(p.id, 'paypal')} disabled={busy === `${p.id}-paypal`}
                  className="w-full bg-yellow-400 hover:bg-yellow-500 text-blue-900 py-2 rounded font-semibold disabled:opacity-60">
                  {busy === `${p.id}-paypal` ? 'Procesando…' : 'PayPal'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
