const ICONS: [RegExp, string, string][] = [
  [
    /daylight/,
    'M12 4V2M12 22v-2M4.9 4.9 3.5 3.5M20.5 20.5l-1.4-1.4M2 12H4M20 12h2M4.9 19.1 3.5 20.5M20.5 3.5l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
    '#fbbf24',
  ],
  [/steep|grade|climb/, 'M3 19l6-9 4 5 3-3 5 7z', '#fb7185'],
  [/elevation|altitude|ele/, 'M3 20l6-10 4 6 3-4 5 8z', '#fbbf24'],
  [
    /distance/,
    'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    '#34d399',
  ],
  [/time/, 'M12 7v5l3 2M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 2h6', '#38bdf8'],
  [/speed|pace/, 'M4 16a8 8 0 1 1 16 0M12 16l4-5', '#38bdf8'],
  [/heart|hr|bpm|zone/, 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z', '#fb7185'],
  [/power|watt/, 'M13 2L4 14h7l-1 8 9-12h-7z', '#a78bfa'],
  [/cadence|cad|rpm/, 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5', '#fbbf24'],
  [/temp/, 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z', '#fb923c'],
  [/wind/, 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7', '#94a3b8'],
  [/point|raw|waypoint|file/, 'M8 6h12M8 12h12M8 18h8M4 6h.01M4 12h.01M4 18h.01', '#94a3b8'],
]

const FALLBACK: [null, string, string] = [null, 'M4 20V10M10 20V4M16 20v-7M22 20H2', '#a1a1aa']

/** Small tinted icon in the top-right corner of a card; the parent must be `position: relative`. */
export function CardIcon({ label }: { label: string }) {
  const key = String(label || '').toLowerCase()
  const [, path, color] = ICONS.find(([re]) => re.test(key)) ?? FALLBACK
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 14,
        right: 14,
        width: 30,
        height: 30,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
      }}
    >
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {path
          .split('M')
          .filter(Boolean)
          .map((seg, i) => (
            <path key={i} d={'M' + seg} />
          ))}
      </svg>
    </span>
  )
}
