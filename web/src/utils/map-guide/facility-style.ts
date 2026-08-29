/**
 * @fileoverview 景区设施分类配色工具。
 * @description 按设施分类编号返回稳定的地图标记色，并为未知分类提供默认颜色。
 */

const FACILITY_COLORS: Readonly<Record<string, string>> = {
  '41': '#667b86',
  '37': '#3f7f6f',
  '38': '#a45f3e',
  '44': '#58729b',
  '48': '#8a6d35',
  '76': '#2f7d89',
  '53': '#4f6f95',
  '73': '#9c637b',
  '47': '#9a6c2e',
  '65': '#6a6992',
  '66': '#65784b',
  '55': '#a3563f',
  '46': '#765d88',
  '39': '#536e58',
  '50': '#55788f',
  '69': '#a14f4f',
  '71': '#687569',
  '72': '#77635a',
  '70': '#4e7b52'
}

const DEFAULT_FACILITY_COLOR = '#687a73'

/**
 * @description 获取设施分类对应的十六进制地图标记色。
 * @param {string} categoryId 景区设施分类编号。
 * @returns {string} 已配置分类色；未知分类返回默认灰绿色。
 * @example
 * facilityColor('37')
 */
export function facilityColor(categoryId: string): string {
  return FACILITY_COLORS[categoryId] || DEFAULT_FACILITY_COLOR
}
