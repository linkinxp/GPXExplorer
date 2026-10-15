import { useEffect, useState } from 'react'
import type { Analysis, Climb, GpxFile, TrackPoint } from './types'
import { analyse, primaryTrack } from './lib/analysis'
import { parseGpx } from './lib/gpx'
import { fitToGpx, isFit } from './lib/fit'
import { sampleGpx } from './lib/sample'
import { distUnit, distValue, fmtDateTime, setUnitSystem, type UnitSystem } from './lib/format'
import {
  addSaved,
  compressText,
  createShareUrl,
  decompressText,
  fetchShared,
  forgetLast,
  loadSaved,
  readLast,
  readRouteHash,
  readShareId,
  rememberLast,
  removeSaved,
  type SavedRoute,
} from './lib/share'
import { Dropzone } from './components/Dropzone'
import { StatGrid } from './components/StatGrid'
import { NumberTicker } from './components/magic/number-ticker'
import { downloadRideCard } from './lib/ridecard'
import { RouteMap } from './components/RouteMap'
import { StreetMap } from './components/StreetMap'
import { ClimbCurtain } from './components/ClimbCurtain'
import { ElevationProfile } from './components/ElevationProfile'
import { GradientChart } from './components/GradientChart'
import { GradientRibbon } from './components/GradientRibbon'
import { EffortChart } from './components/EffortChart'
import { GarminImport } from './components/GarminImport'
import { WahooImport } from './components/WahooImport'
import { ClimbsPanel } from './components/ClimbsPanel'
import { WeatherPanel } from './components/WeatherPanel'
import { EffortZones } from './components/EffortZones'
import { PointsPanel } from './components/PointsPanel'
import { Section } from './components/Section'
import { DotPattern } from './components/magic/dot-pattern'
import { ShimmerButton } from './components/magic/shimmer-button'
import { BlurFade } from './components/magic/blur-fade'
import { BorderBeam } from './components/magic/border-beam'
import { InstallButton } from './components/InstallButton'
import { downloadText } from './lib/export'

interface Loaded {
  gpx: GpxFile
  text: string
  analysis: Analysis
  points: TrackPoint[]
}

const NAV = [
  { id: 'stats', label: 'Overview' },
  { id: 'route', label: 'Route' },
  { id: 'climbs', label: 'Climbs' },
  { id: 'weather', label: 'Weather' },
  { id: 'effort', label: 'Effort' },
  { id: 'data', label: 'Data' },
]

const FEATURES = [
  { title: 'Real route understanding', body: 'Smoothed elevation, 10 m resampling and turning-point detection so GPS noise does not invent climbs.' },
  { title: 'Climbs, categorised', body: 'Every climb of 400 m or more at 3% average, scored and graded HC through Cat 4.' },
  { title: 'Weather where you ride', body: 'Temperature, wind and headwind for five points along the route, timed from your start.' },
]

const SHOW_WAHOO = false
const UNITS_KEY = 'gpx-explorer-units'

function readUnits(): UnitSystem {
  return localStorage.getItem(UNITS_KEY) === 'imperial' ? 'imperial' : 'metric'
}

function UnitToggle({ value, onChange }: { value: UnitSystem; onChange: (u: UnitSystem) => void }) {
  return (
    <div className="flex gap-1 rounded-full p-0.5 text-xs ring-1 ring-white/10">
      {(['metric', 'imperial'] as const).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          aria-pressed={value === u}
          className={`rounded-full px-3 py-1 transition ${value === u ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          {u === 'metric' ? 'km · m' : 'mi · ft'}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hoverD, setHoverD] = useState<number | null>(null)
  const [selected, setSelected] = useState<Climb | null>(null)
  const [garminOpen, setGarminOpen] = useState(false)
  const [wahooOpen, setWahooOpen] = useState(false)
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    if (!p.has('wahoo')) return
    setWahooOpen(true)
    p.delete('wahoo')
    history.replaceState(null, '', `${location.pathname}${p.toString() ? `?${p}` : ''}`)
  }, [])
  const [units, setUnits] = useState<UnitSystem>(readUnits)
  const [saved, setSaved] = useState<SavedRoute[]>(loadSaved)
  const [toast, setToast] = useState<string | null>(null)
  setUnitSystem(units)

  const open = (gpx: GpxFile, text: string) => {
    const analysis = analyse(gpx)
    setLoaded({ gpx, text, analysis, points: primaryTrack(gpx).points })
    setSelected(null)
    setHoverD(null)
    setError(null)
  }

  const openText = (text: string, name: string) => open(parseGpx(text, name), text)

  useEffect(() => {
    const sid = readShareId()
    if (sid) {
      fetchShared(sid)
        .then((text) => openText(text, 'route.gpx'))
        .catch((e: Error) => setError(e.message))
      return
    }
    const hash = readRouteHash()
    const stored = hash ?? readLast()
    if (!stored) return
    decompressText(stored)
      .then((text) => openText(text, 'route.gpx'))
      .catch(() => {
        forgetLast()
        if (hash) setError('This shared link could not be opened.')
      })
  }, [])

  useEffect(() => {
    if (loaded) compressText(loaded.text).then(rememberLast)
  }, [loaded])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const changeUnits = (u: UnitSystem) => {
    localStorage.setItem(UNITS_KEY, u)
    setUnits(u)
  }

  const shareRoute = async () => {
    if (!loaded) return
    let url: string
    try {
      url = await createShareUrl(loaded.text)
    } catch (e) {
      return setToast(e instanceof Error ? e.message : 'Could not create a link.')
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: loaded.gpx.name || 'Route', url })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setToast('Link copied')
    } catch {
      setToast('Could not copy the link.')
    }
  }

  const saveRoute = async () => {
    if (!loaded) return
    setSaved(await addSaved(loaded.gpx.name || 'Route', loaded.text))
    setToast('Route saved')
  }

  const openSaved = (r: SavedRoute) =>
    decompressText(r.data)
      .then((text) => openText(text, `${r.name}.gpx`))
      .catch(() => setError('This saved route could not be opened.'))

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'Could not read this file.')

  const loadFile = async (file: File) => {
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      if (isFit(buf)) openText(fitToGpx(buf, file.name.replace(/\.fit$/i, '')), file.name)
      else openText(new TextDecoder().decode(buf), file.name)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const loadText = (name: string, text: string) => {
    setGarminOpen(false)
    try {
      openText(text, name)
    } catch (e) {
      fail(e)
    }
  }

  const loadSample = () => {
    try {
      const text = sampleGpx()
      openText(text, 'sample.gpx')
    } catch (e) {
      fail(e)
    }
  }

  const selectClimb = (c: Climb | null) => {
    setSelected(c)
    if (c) document.getElementById('profile')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="min-h-screen">
      {loaded ? (
        <Dashboard
          loaded={loaded}
          hoverD={hoverD}
          onHover={setHoverD}
          selected={selected}
          onSelect={selectClimb}
          onReset={() => {
            forgetLast()
            setLoaded(null)
          }}
          units={units}
          onUnits={changeUnits}
          onShare={shareRoute}
          onSave={saveRoute}
        />
      ) : (
        <Hero
          busy={busy}
          error={error}
          onFile={loadFile}
          onSample={loadSample}
          onGarmin={() => setGarminOpen(true)}
          onWahoo={() => setWahooOpen(true)}
          units={units}
          onUnits={changeUnits}
          saved={saved}
          onOpenSaved={openSaved}
          onRemoveSaved={(id) => setSaved(removeSaved(id))}
        />
      )}
      {garminOpen && <GarminImport onLoad={loadText} onClose={() => setGarminOpen(false)} />}
      {wahooOpen && <WahooImport onLoad={loadText} onClose={() => setWahooOpen(false)} />}
      {toast && (
        <div className="anim-toast fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

function Hero({
  busy,
  error,
  onFile,
  onSample,
  onGarmin,
  onWahoo,
  units,
  onUnits,
  saved,
  onOpenSaved,
  onRemoveSaved,
}: {
  busy: boolean
  error: string | null
  onFile: (f: File) => void
  onSample: () => void
  onGarmin: () => void
  onWahoo: () => void
  units: UnitSystem
  onUnits: (u: UnitSystem) => void
  saved: SavedRoute[]
  onOpenSaved: (r: SavedRoute) => void
  onRemoveSaved: (id: string) => void
}) {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20">
      <DotPattern
        className="pointer-events-none absolute inset-0 -z-0 fill-zinc-700/50 [mask-image:radial-gradient(ellipse_at_top,white,transparent_70%)]"
        width={22}
        height={22}
        cr={1.2}
      />
      <BlurFade delay={0.05} inView={false}>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
          Route intelligence for cyclists and hikers
        </span>
      </BlurFade>
      <BlurFade delay={0.12} inView={false}>
        <h1 className="mt-6 text-5xl font-semibold tracking-tight text-zinc-50 md:text-6xl">
          Understand every metre
          <br />
          <span className="bg-gradient-to-r from-emerald-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">
            of your route.
          </span>
        </h1>
      </BlurFade>
      <BlurFade delay={0.2} inView={false}>
        <p className="mt-5 max-w-2xl text-lg text-zinc-400">
          Plan a ride before you ride. Drop a planned route and get distance, gradient, climbs, the weather you
          will ride through and a fly-by of every climb. All parsing happens in your browser.
        </p>
      </BlurFade>

      <BlurFade delay={0.3} inView={false} className="mt-10">
        <div className="relative overflow-hidden rounded-3xl">
          <BorderBeam size={260} duration={12} colorFrom="#34d399" colorTo="#38bdf8" borderWidth={1.5} />
          <Dropzone onFile={onFile} disabled={busy} />
        </div>
      </BlurFade>

      <BlurFade delay={0.36} inView={false} className="mt-5 flex flex-wrap items-center gap-4">
        <ShimmerButton onClick={onSample} disabled={busy} className="h-11 px-6 text-sm">
          Try the sample route
        </ShimmerButton>
        <button
          type="button"
          onClick={onGarmin}
          disabled={busy}
          className="h-11 rounded-full px-6 text-sm font-medium text-zinc-200 ring-1 ring-white/15 transition hover:bg-white/5 disabled:opacity-50"
        >
          Import from Garmin
        </button>
        {SHOW_WAHOO && (
          <button
            type="button"
            onClick={onWahoo}
            disabled={busy}
            className="h-11 rounded-full px-6 text-sm font-medium text-zinc-200 ring-1 ring-white/15 transition hover:bg-white/5 disabled:opacity-50"
          >
            Import from Wahoo
          </button>
        )}
        <span className="text-xs text-zinc-500">No file? Explore a generated loop with three climbs.</span>
        <div className="ml-auto flex items-center gap-2">
          <InstallButton />
          <UnitToggle value={units} onChange={onUnits} />
        </div>
      </BlurFade>

      {saved.length > 0 && (
        <BlurFade delay={0.4} inView={false} className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Saved routes</h2>
          <ul className="mt-3 divide-y divide-zinc-800/80 rounded-2xl border border-zinc-800/80 bg-zinc-900/50">
            {saved.map((r, i) => (
              <li
                key={r.id}
                className="anim-fade-up flex items-center justify-between gap-4 px-5 py-3"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{r.name}</p>
                  <p className="text-xs text-zinc-500">Saved {fmtDateTime(new Date(r.savedAt))}</p>
                </div>
                <div className="flex shrink-0 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onOpenSaved(r)}
                    className="rounded-full bg-zinc-100 px-4 py-1.5 font-semibold text-zinc-900 transition hover:bg-white"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveSaved(r.id)}
                    className="rounded-full px-3 py-1.5 text-zinc-400 ring-1 ring-white/10 transition hover:text-rose-300"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </BlurFade>
      )}

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="mt-16 grid gap-4 md:grid-cols-3">
        {FEATURES.map((f, i) => (
          <BlurFade key={f.title} delay={0.45 + i * 0.08} inView className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6">
            <h3 className="font-medium text-zinc-100">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
          </BlurFade>
        ))}
      </div>
    </main>
  )
}

function Dashboard({
  loaded,
  hoverD,
  onHover,
  selected,
  onSelect,
  onReset,
  units,
  onUnits,
  onShare,
  onSave,
}: {
  loaded: Loaded
  hoverD: number | null
  onHover: (d: number | null) => void
  selected: Climb | null
  onSelect: (c: Climb | null) => void
  onReset: () => void
  units: UnitSystem
  onUnits: (u: UnitSystem) => void
  onShare: () => void
  onSave: () => void
}) {
  const { gpx, analysis: a, points } = loaded
  const slug = gpx.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'route'
  const focusRange = selected ? { startD: selected.startD, endD: selected.endD } : null
  const [routeView, setRouteView] = useState<'curtain' | 'map'>('curtain')

  return (
    <>
      <nav className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <span className="text-sm font-semibold tracking-tight text-zinc-100">GPX Explorer</span>
          <div className="hidden gap-1 md:flex">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100">
                {n.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <InstallButton className="hidden sm:block" />
            <UnitToggle value={units} onChange={onUnits} />
            <button
              type="button"
              onClick={onSave}
              className="hidden rounded-xl px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/5 sm:block"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onShare}
              className="rounded-xl px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/5"
            >
              Share
            </button>
            <button
              type="button"
              onClick={() => downloadRideCard(a, slug)}
              className="hidden rounded-xl px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/5 md:block"
            >
              Ride card
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-xl border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500"
            >
              Load another
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 pb-24 pt-10">
        <BlurFade inView={false}>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-300/80">
            {gpx.tracks.length ? 'Track' : 'Route'} · {gpx.creator ?? 'GPX'}
          </p>
          <h1 className="mt-2 bg-gradient-to-r from-zinc-50 via-emerald-200 to-sky-200 bg-clip-text text-4xl font-semibold tracking-tight text-transparent md:text-5xl">
            {a.name}
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            {a.hasTime ? fmtDateTime(a.startTime) : 'No timestamps'} ·{' '}
            <NumberTicker value={distValue(a.totalDistanceM)} decimalPlaces={2} /> {distUnit()} ·{' '}
            <NumberTicker value={a.climbs.length} /> categorised {a.climbs.length === 1 ? 'climb' : 'climbs'}
          </p>
        </BlurFade>

        <Section id="stats" title="Overview" subtitle="Everything the file contains, summarised.">
          <StatGrid a={a} />
          <div className="mt-6">
            <StreetMap a={a} hoverD={hoverD} onHover={onHover} />
          </div>
        </Section>

        <Section id="route" title="Route and elevation" subtitle="Hover the profile to follow your position on the map." delay={0.05}>
          <GradientRibbon a={a} />
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <div className="mb-3 flex gap-1 text-xs">
                {(['curtain', 'map'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setRouteView(v)}
                    className={`rounded-full px-3 py-1 ring-1 ring-white/10 transition ${routeView === v ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    {v === 'curtain' ? '3D climb view' : 'Top-down map'}
                  </button>
                ))}
              </div>
              {routeView === 'curtain' && (
                <ClimbCurtain a={a} hoverD={hoverD} onHover={onHover} selectedId={selected?.id ?? null} />
              )}
              {routeView === 'map' && (
                <RouteMap a={a} hoverD={hoverD} onHover={onHover} selectedId={selected?.id ?? null} />
              )}
            </div>
            <div className="lg:col-span-2">
              <GradientChart buckets={a.gradeBuckets} />
            </div>
          </div>
          <div id="profile" className="mt-6 scroll-mt-24">
            <ElevationProfile a={a} hoverD={hoverD} onHover={onHover} focusRange={focusRange} />
          </div>
          {(a.avgHr !== null || a.avgMovingSpeed !== null) && (
            <div className="mt-6">
              <EffortChart a={a} hoverD={hoverD} onHover={onHover} />
            </div>
          )}
        </Section>

        <Section
          id="climbs"
          title="Climbs and steep sections"
          subtitle="Climbs are at least 400 m long at a 3% average. Select one to highlight it on the profile."
          delay={0.05}
        >
          <ClimbsPanel a={a} selectedId={selected?.id ?? null} onSelect={onSelect} />
        </Section>

        <Section
          id="weather"
          title="Weather along the route"
          subtitle="Five points from start to finish, timed from your ride start and speed."
          delay={0.05}
        >
          <WeatherPanel a={a} />
        </Section>

        <Section
          id="effort"
          title="Effort and cadence"
          subtitle="Time in each heart-rate zone and how your cadence was spread."
          delay={0.05}
        >
          <EffortZones points={points} maxHr={a.maxHr} />
        </Section>

        <Section id="data" title="Raw data" subtitle="Waypoints, file metadata and every track point." delay={0.05}>
          <PointsPanel gpx={gpx} points={points} slug={slug} />
        </Section>

        <footer className="mt-16 border-t border-zinc-800/80 pt-6 text-xs text-zinc-500">
          Weather by Open-Meteo. Elevation is taken from the file; smoothing and climb detection are approximations.
          <button
            type="button"
            onClick={() => downloadText(`${slug}-analysis.json`, JSON.stringify(a, null, 2), 'application/json')}
            className="ml-3 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-300"
          >
            Export analysis JSON
          </button>
        </footer>
      </main>
    </>
  )
}
