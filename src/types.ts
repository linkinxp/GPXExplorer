export interface TrackPoint {
  lat: number
  lon: number
  ele: number | null
  time: Date | null
  hr: number | null
  cad: number | null
  temp: number | null
  power: number | null
}

export interface Track {
  name: string
  points: TrackPoint[]
}

export interface Waypoint {
  name: string
  lat: number
  lon: number
  ele: number | null
  time: Date | null
  desc: string | null
  sym: string | null
}

export interface GpxFile {
  name: string
  creator: string | null
  time: Date | null
  tracks: Track[]
  routes: Track[]
  waypoints: Waypoint[]
}

export interface ProfilePoint {
  d: number
  lat: number
  lon: number
  ele: number
  grade: number
  hr: number | null
  power: number | null
  cad: number | null
  speed: number | null
  t: number | null
}

export type ClimbCategory = 'HC' | '1' | '2' | '3' | '4'

export interface Climb {
  id: number
  startD: number
  endD: number
  lengthM: number
  gainM: number
  avgGrade: number
  maxGrade: number
  category: ClimbCategory
  score: number
  startIdx: number
  endIdx: number
}

export interface SteepSection {
  startD: number
  endD: number
  grade: number
  startIdx: number
  endIdx: number
}

export interface GradeBucket {
  label: string
  min: number
  max: number
  color: string
  distanceM: number
}

export interface Analysis {
  name: string
  pointCount: number
  totalDistanceM: number
  hasElevation: boolean
  hasTime: boolean
  startTime: Date | null
  endTime: Date | null
  elapsedS: number | null
  movingS: number | null
  avgMovingSpeed: number | null
  maxSpeed: number | null
  elevGainM: number
  elevLossM: number
  minEle: number | null
  maxEle: number | null
  gainPerKm: number
  maxGrade: number
  minGrade: number
  avgHr: number | null
  maxHr: number | null
  avgCad: number | null
  avgTemp: number | null
  avgPower: number | null
  maxPower: number | null
  profile: ProfilePoint[]
  gradeBuckets: GradeBucket[]
  climbs: Climb[]
  steepUp: SteepSection[]
  steepDown: SteepSection[]
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }
  start: { lat: number; lon: number }
  end: { lat: number; lon: number }
}
