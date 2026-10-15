// Minimal Garmin FIT decoder: reads 'record' messages and emits GPX text, so the
// rest of the app (parsing, analysis, saved routes, sharing) stays GPX-only.

const FIT_EPOCH_MS = Date.UTC(1989, 11, 31)
const SEMICIRCLE = 180 / 2 ** 31

const BASE_SIZE: Record<number, number> = {
  0x00: 1, 0x01: 1, 0x02: 1, 0x0a: 1,
  0x83: 2, 0x84: 2, 0x8b: 2,
  0x85: 4, 0x86: 4, 0x88: 4, 0x8c: 4,
  0x89: 8,
}

interface FieldDef {
  num: number
  size: number
  base: number
}

interface MessageDef {
  global: number
  little: boolean
  fields: FieldDef[]
  devSize: number
}

// Returns null for FIT "invalid" sentinels (all-ones, or zero for the *z types).
const readValue = (dv: DataView, off: number, base: number, size: number, little: boolean): number | null => {
  if (!(base in BASE_SIZE) || size < BASE_SIZE[base]) return null
  switch (base) {
    case 0x00: case 0x02: { const v = dv.getUint8(off); return v === 0xff ? null : v }
    case 0x01: { const v = dv.getInt8(off); return v === 0x7f ? null : v }
    case 0x0a: { const v = dv.getUint8(off); return v === 0 ? null : v }
    case 0x83: { const v = dv.getInt16(off, little); return v === 0x7fff ? null : v }
    case 0x84: { const v = dv.getUint16(off, little); return v === 0xffff ? null : v }
    case 0x8b: { const v = dv.getUint16(off, little); return v === 0 ? null : v }
    case 0x85: { const v = dv.getInt32(off, little); return v === 0x7fffffff ? null : v }
    case 0x86: { const v = dv.getUint32(off, little); return v === 0xffffffff ? null : v }
    case 0x8c: { const v = dv.getUint32(off, little); return v === 0 ? null : v }
    case 0x88: { const v = dv.getFloat32(off, little); return Number.isFinite(v) ? v : null }
    case 0x89: { const v = dv.getFloat64(off, little); return Number.isFinite(v) ? v : null }
    default: return null
  }
}

export function isFit(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(12, buf.byteLength))
  return b.length >= 12 && b[8] === 0x2e && b[9] === 0x46 && b[10] === 0x49 && b[11] === 0x54
}

interface RawPoint {
  time: number | null
  lat: number | null
  lon: number | null
  ele: number | null
  hr: number | null
  cad: number | null
  temp: number | null
  power: number | null
}

export function fitToGpx(buf: ArrayBuffer, name: string): string {
  const dv = new DataView(buf)
  const headerSize = dv.getUint8(0)
  const dataEnd = Math.min(buf.byteLength, headerSize + dv.getUint32(4, true))
  const defs = new Map<number, MessageDef>()
  const points: RawPoint[] = []
  let off = headerSize
  let lastTs = 0

  while (off < dataEnd) {
    const h = dv.getUint8(off++)
    let local: number
    let compressedTs: number | null = null
    if (h & 0x80) {
      local = (h >> 5) & 0x03
      const delta = h & 0x1f
      const base = lastTs & ~0x1f
      lastTs = base + delta + (delta < (lastTs & 0x1f) ? 0x20 : 0)
      compressedTs = lastTs
    } else if (h & 0x40) {
      local = h & 0x0f
      const hasDev = (h & 0x20) !== 0
      off++
      const little = dv.getUint8(off++) === 0
      const global = dv.getUint16(off, little)
      off += 2
      const n = dv.getUint8(off++)
      const fields: FieldDef[] = []
      for (let i = 0; i < n; i++) {
        fields.push({ num: dv.getUint8(off), size: dv.getUint8(off + 1), base: dv.getUint8(off + 2) })
        off += 3
      }
      let devSize = 0
      if (hasDev) {
        const dn = dv.getUint8(off++)
        for (let i = 0; i < dn; i++) {
          devSize += dv.getUint8(off + 1)
          off += 3
        }
      }
      defs.set(local, { global, little, fields, devSize })
      continue
    } else {
      local = h & 0x0f
    }

    const def = defs.get(local)
    if (!def) break
    const values = new Map<number, number | null>()
    let p = off
    for (const f of def.fields) {
      values.set(f.num, readValue(dv, p, f.base, f.size, def.little))
      p += f.size
    }
    off = p + def.devSize

    if (def.global !== 20) continue
    const ts = values.get(253)
    if (ts !== undefined && ts !== null) lastTs = ts
    const rawTs = ts ?? compressedTs
    const semi = (k: number) => {
      const v = values.get(k)
      return v === undefined || v === null ? null : v * SEMICIRCLE
    }
    const altitude = (k: number) => {
      const v = values.get(k)
      return v === undefined || v === null || v === 0 ? null : v / 5 - 500
    }
    points.push({
      time: rawTs !== null && rawTs !== undefined ? FIT_EPOCH_MS + rawTs * 1000 : null,
      lat: semi(0),
      lon: semi(1),
      ele: altitude(78) ?? altitude(2),
      hr: values.get(3) ?? null,
      cad: values.get(4) ?? null,
      temp: values.get(13) ?? null,
      power: values.get(7) ?? null,
    })
  }

  const trkpts = points
    .filter((p) => p.lat !== null && p.lon !== null && Math.abs(p.lat as number) <= 90 && Math.abs(p.lon as number) <= 180)
    .map((p) => {
      const ext: string[] = []
      if (p.hr !== null) ext.push(`<hr>${p.hr}</hr>`)
      if (p.cad !== null) ext.push(`<cad>${p.cad}</cad>`)
      if (p.temp !== null) ext.push(`<atemp>${p.temp}</atemp>`)
      if (p.power !== null) ext.push(`<power>${p.power}</power>`)
      return [
        `<trkpt lat="${(p.lat as number).toFixed(7)}" lon="${(p.lon as number).toFixed(7)}">`,
        p.ele !== null ? `<ele>${p.ele.toFixed(1)}</ele>` : '',
        p.time !== null ? `<time>${new Date(p.time).toISOString()}</time>` : '',
        ext.length ? `<extensions>${ext.join('')}</extensions>` : '',
        '</trkpt>',
      ].join('')
    })

  if (trkpts.length === 0) throw new Error('This FIT file has no GPS track (an indoor ride). Only rides with GPS can be analysed.')

  const safeName = name.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="GPX Explorer FIT import" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${safeName}</name><trkseg>${trkpts.join('')}</trkseg></trk></gpx>`
}
