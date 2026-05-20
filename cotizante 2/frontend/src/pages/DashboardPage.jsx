import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const nav = useNavigate()
  const [presupuestos, setPresupuestos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase.from('presupuestos').select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setPresupuestos(data || []); setLoading(false) })
  }, [user])

  const crear = async () => {
    const { data, error } = await supabase.from('presupuestos').insert({
      user_id: user.id,
      nombre_proyecto: 'Nuevo presupuesto',
      cotizante: '', cliente: '', lugar: '',
    }).select().single()
    if (data) nav(`/presupuesto/${data.id}`)
    if (error) alert(error.message)
  }

  return (
    <div className="min-h-screen">
      <header className="bg-blue-900 text-white px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏗️</span>
          <span className="font-bold">COTIZANTE</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link to="/planes" className="bg-yellow-400 text-blue-900 px-3 py-1 rounded font-semibold">Planes</Link>
          <span className="opacity-80">{user?.email}</span>
          <button onClick={() => { signOut(); nav('/login') }} className="underline opacity-80">salir</button>
        </div>
      </header>
      <main className="p-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-slate-800">Mis presupuestos</h1>
          <button onClick={crear} className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-800">
            + Nuevo presupuesto
          </button>
        </div>
        {loading ? <p>Cargando…</p> : presupuestos.length === 0 ? (
          <div className="bg-white rounded shadow p-8 text-center text-gray-500">
            Aún no tenés presupuestos. Empezá creando uno.
          </div>
        ) : (
          <div className="bg-white rounded shadow divide-y">
            {presupuestos.map(p => (
              <Link key={p.id} to={`/presupuesto/${p.id}`}
                className="block p-4 hover:bg-blue-50">
                <div className="font-semibold">{p.nombre_proyecto}</div>
                <div className="text-sm text-gray-500">{p.cliente} · {p.fecha} · rev {p.revision}</div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
