import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) { setProfile(null); return }
    supabase.from('profiles').select('*').eq('id', user.id).single()
      .then(({ data }) => setProfile(data))
  }, [user])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signUp = async (email, password, { fullName = '', companyName = '' } = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    })
    if (!error && data?.user) {
      // Upsert profile with name + company immediately after signup
      await supabase.from('profiles').upsert({
        id:           data.user.id,
        email,
        full_name:    fullName,
        company_name: companyName,
        updated_at:   new Date().toISOString(),
      })
    }
    return { data, error }
  }

  const signOut = () => supabase.auth.signOut()
  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({ provider: 'google' })

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signUp, signOut, signInWithGoogle
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
