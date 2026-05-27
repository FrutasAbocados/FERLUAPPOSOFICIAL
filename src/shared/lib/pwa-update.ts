import { registerSW } from 'virtual:pwa-register'

export function initPwaUpdate() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW(true).catch(() => {
        window.location.reload()
      })
    },
    onOfflineReady() {
      // noop: la app ya muestra estado online/offline en la shell.
    },
    onRegisteredSW(_swUrl, registration) {
      void registration?.update().catch(() => undefined)
    },
  })
}
