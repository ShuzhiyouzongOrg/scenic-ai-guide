export type CoordinateSystem = 'WGS84' | 'GCJ02' | 'BD09' | 'UNKNOWN'

export interface GuideCoordinate {
  latitude: number
  longitude: number
  coordinateSystem: CoordinateSystem
}

export interface CoordinateAuditEntry {
  id: string
  name: string
  source: GuideCoordinate
  converted?: GuideCoordinate
  reference?: GuideCoordinate
  errorMeters?: number
  status: 'verified' | 'manual-review' | 'invalid'
  note?: string
}

export interface CoordinateBounds {
  southwest: GuideCoordinate
  northeast: GuideCoordinate
}
