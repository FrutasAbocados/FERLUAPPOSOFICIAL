import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from '@/shared/types'

export type AuthState = {
  loading: boolean
  user: User | null
  session: Session | null
  profile: Profile | null
}

export type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
