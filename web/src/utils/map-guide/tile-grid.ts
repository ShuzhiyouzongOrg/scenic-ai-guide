import type { CoordinateBounds, HandDrawnTile } from '@/types/map-guide'

export interface TileSource {
  url: string
  width?: number
  height?: number
  sizeBytes?: number
}

export function calculateTileBounds(
  bounds: CoordinateBounds,
  rows: number,
  columns: number,
  row: number,
  column: number
): CoordinateBounds {
  if (rows <= 0 || columns <= 0 || row < 0 || row >= rows || column < 0 || column >= columns) {
    throw new RangeError('Tile grid coordinates are outside the configured grid')
  }
  const latitudeStep = (bounds.northeast.latitude - bounds.southwest.latitude) / rows
  const longitudeStep = (bounds.northeast.longitude - bounds.southwest.longitude) / columns
  const north = bounds.northeast.latitude - latitudeStep * row
  const south = north - latitudeStep
  const west = bounds.southwest.longitude + longitudeStep * column
  const east = west + longitudeStep
  const coordinateSystem = bounds.southwest.coordinateSystem
  return {
    southwest: { latitude: south, longitude: west, coordinateSystem },
    northeast: { latitude: north, longitude: east, coordinateSystem }
  }
}

export function buildTileGrid(
  sources: TileSource[],
  bounds: CoordinateBounds,
  rows: number,
  columns: number
): HandDrawnTile[] {
  if (sources.length !== rows * columns) {
    throw new Error(`Expected ${rows * columns} tiles, received ${sources.length}`)
  }
  return sources.map((source, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    return {
      id: String(index + 1).padStart(2, '0'),
      index,
      row,
      column,
      url: source.url,
      width: source.width ?? 0,
      height: source.height ?? 0,
      sizeBytes: source.sizeBytes ?? 0,
      bounds: calculateTileBounds(bounds, rows, columns, row, column)
    }
  })
}

export function sortTilesRowMajor(tiles: HandDrawnTile[]): HandDrawnTile[] {
  return [...tiles].sort((first, second) => first.row - second.row || first.column - second.column)
}
