/**
 * @fileoverview 手绘地图瓦片网格构建工具。
 * @description 将按行排列的图片源映射到景区地理边界，并提供稳定的行优先排序。
 */

import type { CoordinateBounds, HandDrawnTile } from '@/types/map-guide'

/**
 * @typedef TileSource
 * @description 构建手绘地图瓦片时使用的图片元数据。
 * @property {string} url 瓦片图片访问地址。
 * @property {number} [width] 图片像素宽度。
 * @property {number} [height] 图片像素高度。
 * @property {number} [sizeBytes] 图片文件大小，单位为字节。
 */
export interface TileSource {
  url: string
  width?: number
  height?: number
  sizeBytes?: number
}

/**
 * @description 按总边界、网格尺寸和行列索引计算单张瓦片的地理边界。
 * @param {CoordinateBounds} bounds 整幅手绘地图的西南角与东北角边界。
 * @param {number} rows 网格总行数。
 * @param {number} columns 网格总列数。
 * @param {number} row 当前瓦片从零开始的行索引。
 * @param {number} column 当前瓦片从零开始的列索引。
 * @returns {CoordinateBounds} 当前瓦片对应的地理边界。
 * @throws {RangeError} 当网格尺寸非正数或行列索引越界时抛出。
 * @example
 * calculateTileBounds(bounds, 4, 4, 0, 0)
 */
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

/**
 * @description 将行优先排列的图片源转换为带编号、尺寸、索引和地理边界的手绘瓦片列表。
 * @param {TileSource[]} sources 按从上到下、从左到右排列的图片源。
 * @param {CoordinateBounds} bounds 整幅手绘地图的地理边界。
 * @param {number} rows 网格总行数。
 * @param {number} columns 网格总列数。
 * @returns {HandDrawnTile[]} 与图片源顺序一致的完整瓦片记录。
 * @throws {Error} 当图片源数量不等于行数与列数之积时抛出。
 * @throws {RangeError} 当网格尺寸无法形成有效瓦片边界时抛出。
 * @example
 * buildTileGrid(tileSources, bounds, 4, 4)
 */
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

/**
 * @description 在不修改原数组的前提下，按行索引再按列索引排序手绘瓦片。
 * @param {HandDrawnTile[]} tiles 待排序的手绘地图瓦片列表。
 * @returns {HandDrawnTile[]} 新建的行优先瓦片数组。
 * @example
 * sortTilesRowMajor(tiles)
 */
export function sortTilesRowMajor(tiles: HandDrawnTile[]): HandDrawnTile[] {
  return [...tiles].sort((first, second) => first.row - second.row || first.column - second.column)
}
