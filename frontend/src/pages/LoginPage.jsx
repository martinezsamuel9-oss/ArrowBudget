import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const nav = useNavigate()
  const [mode,  setMode]  = useState('login')
  const [email, setEmail] = useState('')
  const [pwd,   setPwd]   = useState('')
  const [err,   setErr]   = useState(null)
  const [busy,  setBusy]  = useState(false)
  const [done,  setDone]  = useState(false)

  const switchMode = (m) => { setMode(m); setErr(null); setDone(false) }

  const submit = async (e) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    if (mode === 'login') {
      const { error } = await signIn(email, pwd)
      setBusy(false)
      if (error) setErr(error.message)
      else nav('/')
    } else {
      const { error } = await signUp(email, pwd)
      setBusy(false)
      if (error) setErr(error.message)
      else setDone(true)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">

        {/* Header */}
        <div className="login-header">
          <div className="login-logo">
            <img src="/favicon.png" alt="Arrow Budget"
              onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
            <span style={{ display: 'none', color: '#14213D', fontWeight: 800, fontSize: 22 }}>A</span>
          </div>
          <div className="login-title">ARROW BUDGET</div>
          <div className="login-sub">Presupuestos de obra rápidos, exactos y profesionales</div>
        </div>

        {/* Body */}
        <div className="login-body">
          <div className="login-tabs">
            <button className={`login-tab${mode === 'login'    ? ' active' : ''}`} onClick={() => switchMode('login')}>
              Iniciar sesión
            </button>
            <button className={`login-tab${mode === 'register' ? ' active' : ''}`} onClick={() => switchMode('register')}>
              Crear cuenta
            </button>
          </div>

          {done ? (
            <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📬</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-ink)', marginBottom: 6 }}>
                ¡Revisa tu correo!
              </div>
              <div style={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
                Enviamos un enlace de confirmación a <b>{email}</b>.<br />
                Haz clic en el enlace para activar tu cuenta.
              </div>
              <button className="login-submit" style={{ marginTop: 20 }} onClick={() => switchMode('login')}>
                Volver al inicio de sesión
              </button>
            </div>
          ) : (
            <>
              <form className="login-form" onSubmit={submit}>
                <div>
                  <label className="login-field-label">Correo electrónico</label>
                  <input
                    type="email"
                    className="login-input"
                    required
                    placeholder="tu@empresa.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="login-field-label">Contraseña</label>
                  <input
                    type="password"
                    className="login-input"
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    value={pwd}
                    onChange={e => setPwd(e.target.value)}
                  />
                </div>

                {err && <div className="login-error">{err}</div>}

                <button type="submit" className="login-submit" disabled={busy}>
                  {busy ? 'Procesando…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
                </button>
              </form>

              <div className="login-divider">o continuar con</div>

              <button className="login-google" onClick={signInWithGoogle}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continuar con Google
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
