import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// ── Validación y sanitización de entradas ──────────────────────────────────
// Nota: Supabase ya usa queries parametrizadas en el backend, pero validamos
// en el cliente para rechazar patrones sospechosos desde la entrada.
const SQL_PATTERNS = /('|"|;|--|\/\*|\*\/|xp_|union\s+select|select\s+.*\s+from|insert\s+into|drop\s+table|delete\s+from|update\s+.*\s+set|exec\s*\(|cast\s*\(|convert\s*\(|char\s*\(|nchar\s*\(|varchar\s*\(|0x[0-9a-f]+)/i

const hasSQLInjection = str => SQL_PATTERNS.test(str)

const validateInputs = fields => {
  for (const [label, value] of Object.entries(fields)) {
    if (typeof value === 'string' && hasSQLInjection(value)) {
      return `El campo "${label}" contiene caracteres no permitidos.`
    }
    if (typeof value === 'string' && value.length > 255) {
      return `El campo "${label}" es demasiado largo.`
    }
  }
  return null
}

// ── pequeño helper para mostrar / ocultar contraseña ──
function PwdInput({ value, onChange, placeholder, id }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className="login-input"
        required
        minLength={6}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{ paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', lineHeight: 1,
        }}
        tabIndex={-1}
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {show
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
        }
      </button>
    </div>
  )
}

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth()
  const nav = useNavigate()

  // 'login' | 'register' | 'forgot'
  const [mode, setMode] = useState('login')

  // login fields
  const [email, setEmail]       = useState('')
  const [pwd,   setPwd]         = useState('')

  // register fields
  const [nombre,   setNombre]   = useState('')
  const [apellido, setApellido] = useState('')
  const [empresa,  setEmpresa]  = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPwd,   setRegPwd]   = useState('')
  const [regPwd2,  setRegPwd2]  = useState('')
  const [terminos, setTerminos] = useState(false)

  // forgot password
  const [fpEmail, setFpEmail]   = useState('')
  const [fpDone,  setFpDone]    = useState(false)

  // shared
  const [err,  setErr]  = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const switchMode = m => { setMode(m); setErr(null); setDone(false); setFpDone(false) }

  // ── LOGIN ──
  const handleLogin = async e => {
    e.preventDefault()
    setErr(null)
    const valErr = validateInputs({ 'Correo': email, 'Contraseña': pwd })
    if (valErr) { setErr(valErr); return }
    setBusy(true)
    const { error } = await signIn(email.trim(), pwd)
    setBusy(false)
    if (error) setErr(translateError(error.message))
    else nav('/')
  }

  // ── REGISTER ──
  const handleRegister = async e => {
    e.preventDefault()
    setErr(null)
    const valErr = validateInputs({
      'Nombre': nombre, 'Apellido': apellido,
      'Empresa': empresa, 'Correo': regEmail,
    })
    if (valErr) { setErr(valErr); return }
    if (regPwd !== regPwd2) { setErr('Las contraseñas no coinciden.'); return }
    if (!terminos) { setErr('Debes aceptar los términos y condiciones.'); return }
    // Validar formato de correo básico
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) {
      setErr('Ingresa un correo electrónico válido.'); return
    }
    setBusy(true)
    const { error } = await signUp(regEmail.trim(), regPwd, {
      full_name:    `${nombre.trim()} ${apellido.trim()}`,
      company_name: empresa.trim(),
    })
    setBusy(false)
    if (error) setErr(translateError(error.message))
    else setDone(true)
  }

  // ── FORGOT PASSWORD ──
  const handleForgot = async e => {
    e.preventDefault()
    setErr(null)
    const valErr = validateInputs({ 'Correo': fpEmail })
    if (valErr) { setErr(valErr); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fpEmail.trim())) {
      setErr('Ingresa un correo electrónico válido.'); return
    }
    setBusy(true)
    const { error } = await resetPassword(fpEmail.trim())
    setBusy(false)
    if (error) setErr(translateError(error.message))
    else setFpDone(true)
  }

  // traduce mensajes de Supabase al español
  const translateError = msg => {
    if (!msg) return 'Error desconocido'
    if (msg.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.'
    if (msg.includes('Email not confirmed'))       return 'Confirma tu correo antes de ingresar.'
    if (msg.includes('User already registered'))   return 'Ya existe una cuenta con ese correo.'
    if (msg.includes('Password should be at least')) return 'La contraseña debe tener mínimo 6 caracteres.'
    return msg
  }

  return (
    <div className="login-screen">
      <div className="login-card" style={{ maxWidth: mode === 'register' ? 480 : 420 }}>

        {/* Header */}
        <div className="login-header">
          <div className="login-logo">
            <img src="/favicon.png" alt="Arrow Budget"
              onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
            <span style={{ display:'none', color:'#14213D', fontWeight:800, fontSize:22 }}>A</span>
          </div>
          <div className="login-title">ARROW BUDGET</div>
          <div className="login-sub">Presupuestos de obra rápidos, exactos y profesionales</div>
        </div>

        {/* Body */}
        <div className="login-body">

          {/* Tabs (solo login / register) */}
          {mode !== 'forgot' && (
            <div className="login-tabs">
              <button className={`login-tab${mode==='login'    ? ' active' : ''}`} onClick={() => switchMode('login')}>
                Iniciar sesión
              </button>
              <button className={`login-tab${mode==='register' ? ' active' : ''}`} onClick={() => switchMode('register')}>
                Crear cuenta
              </button>
            </div>
          )}

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <form className="login-form" onSubmit={handleLogin}>
              <div>
                <label className="login-field-label">Correo electrónico</label>
                <input type="email" className="login-input" required placeholder="tu@empresa.com"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="login-field-label" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>Contraseña</span>
                  <button type="button" onClick={() => switchMode('forgot')}
                    style={{ fontSize:12, color:'var(--c-primary)', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>
                    ¿Olvidaste tu contraseña?
                  </button>
                </label>
                <PwdInput id="login-pwd" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Tu contraseña" />
              </div>

              {err && <div className="login-error">{err}</div>}

              <button type="submit" className="login-submit" disabled={busy}>
                {busy ? 'Verificando…' : 'Entrar'}
              </button>

              <div className="login-divider">o continuar con</div>

              <button type="button" className="login-google" onClick={signInWithGoogle}>
                <GoogleIcon />
                Continuar con Google
              </button>
            </form>
          )}

          {/* ── REGISTER ── */}
          {mode === 'register' && !done && (
            <form className="login-form" onSubmit={handleRegister}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label className="login-field-label">Nombre *</label>
                  <input type="text" className="login-input" required placeholder="Juan"
                    value={nombre} onChange={e => setNombre(e.target.value)} />
                </div>
                <div>
                  <label className="login-field-label">Apellido *</label>
                  <input type="text" className="login-input" required placeholder="Pérez"
                    value={apellido} onChange={e => setApellido(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="login-field-label">Empresa / Organización</label>
                <input type="text" className="login-input" placeholder="Tu empresa S.A."
                  value={empresa} onChange={e => setEmpresa(e.target.value)} />
              </div>
              <div>
                <label className="login-field-label">Correo electrónico *</label>
                <input type="email" className="login-input" required placeholder="tu@empresa.com"
                  value={regEmail} onChange={e => setRegEmail(e.target.value)} />
              </div>
              <div>
                <label className="login-field-label">Contraseña *</label>
                <PwdInput id="reg-pwd" value={regPwd} onChange={e => setRegPwd(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <div>
                <label className="login-field-label">Confirmar contraseña *</label>
                <PwdInput id="reg-pwd2" value={regPwd2} onChange={e => setRegPwd2(e.target.value)} placeholder="Repite tu contraseña" />
                {regPwd && regPwd2 && regPwd !== regPwd2 && (
                  <div style={{ fontSize:12, color:'#ef4444', marginTop:4 }}>Las contraseñas no coinciden</div>
                )}
                {regPwd && regPwd2 && regPwd === regPwd2 && regPwd.length >= 6 && (
                  <div style={{ fontSize:12, color:'#22c55e', marginTop:4 }}>✓ Las contraseñas coinciden</div>
                )}
              </div>

              {/* Términos */}
              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', userSelect:'none' }}>
                <input type="checkbox" checked={terminos} onChange={e => setTerminos(e.target.checked)}
                  style={{ marginTop:2, width:16, height:16, accentColor:'var(--c-primary)', flexShrink:0 }} />
                <span style={{ fontSize:13, color:'#64748b', lineHeight:1.5 }}>
                  Acepto los{' '}
                  <a href="#" style={{ color:'var(--c-primary)', fontWeight:500 }} onClick={e => e.preventDefault()}>
                    Términos y Condiciones
                  </a>{' '}y la{' '}
                  <a href="#" style={{ color:'var(--c-primary)', fontWeight:500 }} onClick={e => e.preventDefault()}>
                    Política de Privacidad
                  </a>
                </span>
              </label>

              {err && <div className="login-error">{err}</div>}

              <button type="submit" className="login-submit" disabled={busy || !terminos}>
                {busy ? 'Creando cuenta…' : 'Crear cuenta'}
              </button>

              <div className="login-divider">o registrarse con</div>
              <button type="button" className="login-google" onClick={signInWithGoogle}>
                <GoogleIcon />
                Continuar con Google
              </button>
            </form>
          )}

          {/* ── REGISTRO EXITOSO ── */}
          {mode === 'register' && done && (
            <div style={{ textAlign:'center', padding:'16px 0 8px' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📬</div>
              <div style={{ fontWeight:700, fontSize:15, color:'var(--c-ink)', marginBottom:8 }}>
                ¡Cuenta creada!
              </div>
              <div style={{ fontSize:13, color:'var(--c-text-2)', lineHeight:1.7 }}>
                Enviamos un enlace de confirmación a<br />
                <b style={{ color:'var(--c-ink)' }}>{regEmail}</b>.<br />
                Haz clic en el enlace para activar tu cuenta.
              </div>
              <button className="login-submit" style={{ marginTop:20 }} onClick={() => switchMode('login')}>
                Ir al inicio de sesión
              </button>
            </div>
          )}

          {/* ── OLVIDÉ MI CONTRASEÑA ── */}
          {mode === 'forgot' && !fpDone && (
            <form className="login-form" onSubmit={handleForgot}>
              <button type="button" onClick={() => switchMode('login')}
                style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', color:'#64748b', fontSize:13, padding:'0 0 4px', fontWeight:500 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                Volver al inicio de sesión
              </button>

              <div style={{ marginBottom:4 }}>
                <div style={{ fontWeight:700, fontSize:16, color:'var(--c-ink)', marginBottom:4 }}>Recuperar contraseña</div>
                <div style={{ fontSize:13, color:'#64748b', lineHeight:1.5 }}>
                  Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
                </div>
              </div>

              <div>
                <label className="login-field-label">Correo electrónico</label>
                <input type="email" className="login-input" required placeholder="tu@empresa.com"
                  value={fpEmail} onChange={e => setFpEmail(e.target.value)} />
              </div>

              {err && <div className="login-error">{err}</div>}

              <button type="submit" className="login-submit" disabled={busy}>
                {busy ? 'Enviando…' : 'Enviar enlace de recuperación'}
              </button>
            </form>
          )}

          {/* ── RESET ENVIADO ── */}
          {mode === 'forgot' && fpDone && (
            <div style={{ textAlign:'center', padding:'16px 0 8px' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✉️</div>
              <div style={{ fontWeight:700, fontSize:15, color:'var(--c-ink)', marginBottom:8 }}>
                Enlace enviado
              </div>
              <div style={{ fontSize:13, color:'var(--c-text-2)', lineHeight:1.7 }}>
                Revisá tu bandeja de entrada en<br />
                <b style={{ color:'var(--c-ink)' }}>{fpEmail}</b>.<br />
                El enlace expira en 24 horas.
              </div>
              <button className="login-submit" style={{ marginTop:20 }} onClick={() => switchMode('login')}>
                Volver al inicio de sesión
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
