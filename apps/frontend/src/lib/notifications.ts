export const notificationEvent = 'visual-library-notification'

export type AppNotification = {
  id: string
  kind: 'success' | 'error'
  message: string
}

export function notify(kind: AppNotification['kind'], message: string) {
  window.dispatchEvent(new CustomEvent<AppNotification>(notificationEvent, {
    detail: { id: crypto.randomUUID(), kind, message },
  }))
}
