export interface SavedRoute {
  id: string
  name: string
  savedAt: number
  data: string
}

const SAVED_KEY = 'gpx-explorer-routes'
const LAST_KEY = 'gpx-explorer-last'
const MAX_SAVED = 10

const toB64url = (bytes: Uint8Array) => {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function gzipStream(input: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([input]).stream().pipeThrough(stream as TransformStream<Uint8Array, Uint8Array>)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function compressText(text: string) {
  return toB64url(await gzipStream(new TextEncoder().encode(text), new CompressionStream('gzip')))
}

export async function decompressText(data: string) {
  return new TextDecoder().decode(await gzipStream(fromB64url(data), new DecompressionStream('gzip')))
}

export async function createShareUrl(text: string): Promise<string> {
  const gz = await gzipStream(new TextEncoder().encode(text), new CompressionStream('gzip'))
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/gpx+xml', 'Content-Encoding': 'gzip' },
    body: gz,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.id) throw new Error(body.error ?? 'Could not create a link.')
  return `${location.origin}${location.pathname}?s=${body.id}`
}

export const readShareId = () => new URLSearchParams(location.search).get('s')

export async function fetchShared(id: string): Promise<string> {
  const res = await fetch(`/api/share/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error('This shared link has expired or does not exist.')
  return res.text()
}

export const readRouteHash = () => location.hash.match(/^#r=([\w-]+)$/)?.[1] ?? null

export const rememberLast = (data: string) => sessionStorage.setItem(LAST_KEY, data)
export const readLast = () => sessionStorage.getItem(LAST_KEY)
export const forgetLast = () => sessionStorage.removeItem(LAST_KEY)

export function loadSaved(): SavedRoute[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]')
  } catch {
    return []
  }
}

export async function addSaved(name: string, text: string): Promise<SavedRoute[]> {
  const entry: SavedRoute = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name,
    savedAt: Date.now(),
    data: await compressText(text),
  }
  const list = [entry, ...loadSaved()].slice(0, MAX_SAVED)
  localStorage.setItem(SAVED_KEY, JSON.stringify(list))
  return list
}

export function removeSaved(id: string): SavedRoute[] {
  const list = loadSaved().filter((r) => r.id !== id)
  localStorage.setItem(SAVED_KEY, JSON.stringify(list))
  return list
}
