import { APP_TZ, todayIn } from '@shared/dates'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Today's date in the project timezone (Thailand, GMT+7), as YYYY-MM-DD — the same "today" on every device. */
export function localToday(): string {
  return todayIn(APP_TZ)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = new URL(path, window.location.origin)
  url.searchParams.set('today', localToday())
  const res = await fetch(url.toString(), {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  const text = await res.text()
  let json: unknown = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
  }
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('auth:unauthorized'))
    const msg = (json && typeof json === 'object' && 'error' in json && typeof (json as { error: unknown }).error === 'string'
      ? (json as { error: string }).error
      : res.statusText) || `Request failed (${res.status})`
    throw new ApiError(res.status, msg)
  }
  return json as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
