import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true)
    const fn = mode === 'login' ? signIn : signUp
    const { error } = await fn(email, pwd)
    setBusy(false)
    if (error) setErr(error.message)
    else nav('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 p-4">
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-md">
        <div className="bg-blue-900 text-white p-6 text-center">
          <div className="text-3xl font-bold">ARROW BUDGET</div>
          <p className="text-blue-100 text-sm mt-1">Presupuestos de obra rápidos, exactos y profesionales</p>
        </div>
        <div className="p-6">
          <div className="flex border-b mb-4">
            <button onClick={() => setMode('login')}
              className={`flex-1 py-2 text-sm font-medium ${mode === 'login' ? 'border-b-2 border-blue-700 text-blue-700' : 'text-gray-500'}`}>
              Iniciar sesión
            </button>
            <button onClick={() => setMode('register')}
              className={`flex-1 py-2 text-sm font-medium ${mode === 'register' ? 'border-b-2 border-blue-700 text-blue-700' : 'text-gray-500'}`}>
              Crear cuenta
            </button>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700">Contraseña</label>
              <input type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)}
                className="w-full mt-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {err && <div className="text-red-600 text-sm">{err}</div>}
            <button type="submit" disabled={busy}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white py-2 rounded font-semibold disabled:opacity-60">
              {busy ? 'Procesando…' : (mode === 'login' ? 'Entrar' : 'Crear cuenta')}
            </button>
          </form>
          <div className="my-3 text-center text-xs text-gray-400">o continuar con</div>
          <button onClick={signInWithGoogle}
            className="w-full border rounded py-2 flex items-center justify-center gap-2 text-sm hover:bg-gray-50">
            🔐 Google
          </button>
        </div>
      </div>
    </div>
  )
}
