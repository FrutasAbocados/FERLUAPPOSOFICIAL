const required = (key: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(
      `Falta variable de entorno ${key}. Revisa .env.local (en dev) o las env vars del proyecto en Vercel (en prod).`,
    )
  }
  return value
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
}
