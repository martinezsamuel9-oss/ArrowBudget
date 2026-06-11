import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let resolved = false
    // Failsafe: si getSession no responde (red caída, storage corrupto), la app
    // no se queda en "Cargando…" infinito — tras 8s asume sin sesión → login
    const failsafe = setTimeout(() => {
      if (!resolved) { setUser(null); setLoading(false) }
    }, 8000)
    supabase.auth.getSession()
      .then(({ data }) => setUser(data.session?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => { resolved = true; clearTimeout(failsafe); setLoading(false) })
    // Sesión vencida (refresh token inválido tras días sin abrir): supabase emite
    // SIGNED_OUT → user pasa a null → ProtectedRoute redirige al login solo
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => { clearTimeout(failsafe); sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!user) { setProfile(null); return }
    supabase.from('profiles').select('*').eq('id', user.id).single()
      .then(({ data }) => setProfile(data))
  }, [user])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signUp = (email, password, meta = {}) =>
    supabase.auth.signUp({
      email,
      password,
      options: { data: meta },
    })

  const signOut = () => supabase.auth.signOut()

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({ provider: 'google' })

  const resetPassword = (email) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    })

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signUp, signOut, signInWithGoogle, resetPassword
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
