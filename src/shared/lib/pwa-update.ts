import { registerSW } from 'virtual:pwa-register'

export function initPwaUpdate() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true)
    },
    onOfflineReady() {
      // noop: la app ya muestra estado online/offline en la shell.
    },
    onRegisteredSW(_swUrl, registration) {
      registration?.update()
    },
  })
}
