import { useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/shared/lib/supabase'
import type { Profile, Role } from '@/shared/types'
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    user: null,
    session: null,
    profile: null,
  })

  useEffect(() => {
    let active = true

    const loadProfile = async (user: User | null): Promise<Profile | null> => {
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, role, created_at')
        .eq('id', user.id)
        .maybeSingle()
      if (error) {
        console.warn('No se pudo cargar perfil:', error.message)
        return null
      }
      if (!data) return null
      return {
        id: data.id,
        email: data.email,
        display_name: data.display_name,
        role: data.role as Role,
        created_at: data.created_at,
      }
    }

    const sync = async (session: Session | null) => {
      const user = session?.user ?? null
      const profile = await loadProfile(user)
      if (active) setState({ loading: false, user, session, profile })
    }

    supabase.auth.getSession().then(({ data }) => sync(data.session))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      sync(session)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
