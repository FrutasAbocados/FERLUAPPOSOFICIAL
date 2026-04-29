import { supabase } from './supabase'
import { env } from './env'

export type PushEstado = 'no-soportado' | 'denegado' | 'pendiente' | 'activo'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSoportado(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export async function registrarSW(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSoportado()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch (e) {
    console.error('SW register error', e)
    return null
  }
}

export async function estadoPush(): Promise<PushEstado> {
  if (!pushSoportado()) return 'no-soportado'
  if (Notification.permission === 'denied') return 'denegado'
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'pendiente'
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return Notification.permission === 'granted' ? 'pendiente' : 'pendiente'
  return 'activo'
}

export async function activarPush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSoportado()) return { ok: false, error: 'Tu navegador no soporta push notifications.' }
  if (!env.vapidPublicKey) return { ok: false, error: 'Falta VITE_VAPID_PUBLIC_KEY.' }

  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registrarSW())
  if (!reg) return { ok: false, error: 'No se pudo registrar el service worker.' }

  const permiso = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permiso !== 'granted') return { ok: false, error: 'Permiso denegado.' }

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey) as BufferSource,
    })
  }

  const json = sub.toJSON()
  const { error } = await supabase.rpc('push_subscription_upsert', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function desactivarPush(): Promise<{ ok: boolean; error?: string }> {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return { ok: true }
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return { ok: true }
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  const { error } = await supabase.rpc('push_subscription_delete', { p_endpoint: endpoint })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
